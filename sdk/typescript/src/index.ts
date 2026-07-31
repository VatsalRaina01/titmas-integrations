export type TitmasResult = "PASS" | "FAIL" | "NOT_ASSESSED";

export interface PreflightRequest {
  requestId: string;
  idempotencyKey: string;
  tenantId: string;
  agentIdentity: string;
  object: unknown;
  schemaName?: string;
  timestamp?: string;
}

export interface PreflightOutcome {
  result: TitmasResult;
  reason_codes: string[];
  schema_name: string | null;
  schema_version: string | null;
  object_type: string | null;
  formal_conformance: false;
  certification: false;
  truth_claim: false;
  authorization_effect: false;
  receipt: Record<string, unknown>;
  idempotent_replay: boolean;
}

export interface ReceiptVerification {
  valid: boolean;
  reason_code: string;
  receipt_hash: string | null;
  structure_only: true;
  chain_valid: string;
  truth_verified: false;
  authorization_effect: false;
}

export class TitmasApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly reasonCode?: string,
    readonly response?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TitmasApiError";
  }
}

export class TitmasAuthenticationError extends TitmasApiError {
  override name = "TitmasAuthenticationError";
}

export class TitmasScopeError extends TitmasApiError {
  override name = "TitmasScopeError";
}

export class TitmasQuotaError extends TitmasApiError {
  override name = "TitmasQuotaError";
}

export class TitmasTransportError extends TitmasApiError {
  override name = "TitmasTransportError";
}

export class TitmasContractError extends TitmasApiError {
  override name = "TitmasContractError";
}

export interface TitmasClientOptions {
  baseUrl?: string;
  credential?: string;
  timeoutMs?: number;
  getRetryAttempts?: number;
  fetchImpl?: typeof fetch;
}

export class TitmasClient {
  private readonly baseUrl: string;
  private readonly credential: string | undefined;
  private readonly timeoutMs: number;
  private readonly getRetryAttempts: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TitmasClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://redcrag.cn").replace(/\/$/, "");
    this.credential = options.credential;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.getRetryAttempts = options.getRetryAttempts ?? 2;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!/^https?:\/\//.test(this.baseUrl)) {
      throw new TypeError("baseUrl must be an absolute HTTP(S) URL");
    }
    if (this.getRetryAttempts < 0 || this.getRetryAttempts > 3) {
      throw new RangeError("getRetryAttempts must be between 0 and 3");
    }
  }

  capabilities(): Promise<Record<string, unknown>> {
    return this.get("/api/v1/capabilities", false);
  }

  plans(): Promise<Record<string, unknown>> {
    return this.get("/api/v1/plans", false);
  }

  status(): Promise<Record<string, unknown>> {
    return this.get("/api/v1/status", false);
  }

  catalog(): Promise<Record<string, unknown>> {
    return this.get("/api/v1/catalog", true);
  }

  usage(): Promise<Record<string, unknown>> {
    return this.get("/api/v1/usage", true);
  }

  quota(): Promise<Record<string, unknown>> {
    return this.get("/api/v1/quota", true);
  }

  async preflight(input: PreflightRequest): Promise<PreflightOutcome> {
    const body: Record<string, unknown> = {
      api_version: "v1",
      request_id: input.requestId,
      idempotency_key: input.idempotencyKey,
      tenant_id: input.tenantId,
      agent_identity: input.agentIdentity,
      timestamp: input.timestamp ?? new Date().toISOString(),
      object: input.object
    };
    if (input.schemaName !== undefined) body.schema_name = input.schemaName;
    const value = await this.post("/api/v1/preflight", body);
    const result = String(value.result);
    if (!["PASS", "FAIL", "NOT_ASSESSED"].includes(result)) {
      throw contractError(
        "TITMAS returned an unknown result value",
        "RESULT_SEMANTICS_VIOLATION",
        value
      );
    }
    if (!isRecord(value.receipt)) {
      throw contractError(
        "TITMAS response omitted the Receipt",
        "RECEIPT_CONTRACT_VIOLATION",
        value
      );
    }
    if (
      !Array.isArray(value.reason_codes) ||
      !value.reason_codes.every((item) => typeof item === "string")
    ) {
      throw contractError(
        "TITMAS returned invalid reason_codes",
        "RESULT_SEMANTICS_VIOLATION",
        value
      );
    }
    requireBoolean(value, "idempotent_replay");
    for (const field of [
      "formal_conformance",
      "certification",
      "truth_claim",
      "authorization_effect"
    ]) {
      requireFalse(value, field, "preflight");
    }
    return {
      result: result as TitmasResult,
      reason_codes: value.reason_codes as string[],
      schema_name: optionalString(value.schema_name),
      schema_version: optionalString(value.schema_version),
      object_type: optionalString(value.object_type),
      formal_conformance: false,
      certification: false,
      truth_claim: false,
      authorization_effect: false,
      receipt: value.receipt,
      idempotent_replay: value.idempotent_replay as boolean
    };
  }

  async verifyReceipt(
    receipt: Record<string, unknown>
  ): Promise<ReceiptVerification> {
    const value = await this.post(
      "/api/v1/receipts/verify",
      receipt
    );
    requireBoolean(value, "valid");
    if (value.structure_only !== true) {
      throw contractError(
        "Receipt verification must remain structure-only",
        "RECEIPT_AUTHORITY_BOUNDARY_VIOLATION",
        value
      );
    }
    requireFalse(value, "truth_verified", "receipt verification");
    requireFalse(value, "authorization_effect", "receipt verification");
    if (
      typeof value.reason_code !== "string" ||
      typeof value.chain_valid !== "string"
    ) {
      throw contractError(
        "Receipt verification returned invalid status fields",
        "RECEIPT_CONTRACT_VIOLATION",
        value
      );
    }
    if (
      value.receipt_hash !== null &&
      value.receipt_hash !== undefined &&
      typeof value.receipt_hash !== "string"
    ) {
      throw contractError(
        "Receipt verification returned an invalid hash",
        "RECEIPT_CONTRACT_VIOLATION",
        value
      );
    }
    return {
      valid: value.valid as boolean,
      reason_code: value.reason_code,
      receipt_hash: optionalString(value.receipt_hash),
      structure_only: true,
      chain_valid: value.chain_valid,
      truth_verified: false,
      authorization_effect: false
    };
  }

  private async get(
    path: string,
    authenticated: boolean
  ): Promise<Record<string, unknown>> {
    const attempts = this.getRetryAttempts + 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.request(path, "GET", authenticated);
        if (
          ![502, 503, 504].includes(response.status) ||
          attempt + 1 === attempts
        ) {
          return this.decode(response);
        }
      } catch (error) {
        lastError = error;
        if (
          error instanceof TitmasApiError ||
          attempt + 1 === attempts
        ) {
          throw error;
        }
      }
      await delay(100 * (attempt + 1));
    }
    throw new TitmasTransportError(
      `bounded GET transport failed: ${String(lastError)}`,
      undefined,
      "GET_TRANSPORT_FAILED"
    );
  }

  private async post(
    path: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.request(path, "POST", true, body);
    } catch (error) {
      if (error instanceof TitmasApiError) throw error;
      throw new TitmasTransportError(
        "POST outcome is unknown; automatic retry was not attempted",
        undefined,
        "POST_DISPATCH_UNKNOWN"
      );
    }
    return this.decode(response);
  }

  private async request(
    path: string,
    method: "GET" | "POST",
    authenticated: boolean,
    body?: Record<string, unknown>
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "titmas-agent-sdk-typescript/0.1.0",
      "X-Request-ID": `sdk-${crypto.randomUUID()}`
    };
    if (authenticated) {
      if (!this.credential) {
        throw new TitmasAuthenticationError(
          "a delegated machine credential is required",
          undefined,
          "CREDENTIAL_MISSING"
        );
      }
      headers.Authorization = `Bearer ${this.credential}`;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const init: RequestInit = {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(this.timeoutMs)
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    return this.fetchImpl(`${this.baseUrl}${path}`, init);
  }

  private async decode(response: Response): Promise<Record<string, unknown>> {
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new TitmasApiError(
        "TITMAS returned non-JSON content",
        response.status
      );
    }
    if (!isRecord(value)) {
      throw new TitmasApiError(
        "TITMAS returned a non-object JSON response",
        response.status
      );
    }
    if (response.ok) return value;
    const reason =
      typeof value.reason_code === "string" ? value.reason_code : undefined;
    const message =
      typeof value.title === "string" ? value.title : "TITMAS API error";
    if (response.status === 401) {
      throw new TitmasAuthenticationError(message, response.status, reason, value);
    }
    if (response.status === 403) {
      throw new TitmasScopeError(message, response.status, reason, value);
    }
    if (response.status === 429) {
      throw new TitmasQuotaError(message, response.status, reason, value);
    }
    throw new TitmasApiError(message, response.status, reason, value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function requireBoolean(value: Record<string, unknown>, field: string): void {
  if (typeof value[field] !== "boolean") {
    throw contractError(
      `TITMAS response field ${field} must be a boolean`,
      "RESPONSE_CONTRACT_VIOLATION",
      value
    );
  }
}

function requireFalse(
  value: Record<string, unknown>,
  field: string,
  context: string
): void {
  if (value[field] !== false) {
    throw contractError(
      `${context} field ${field} must remain false`,
      "AUTHORITY_BOUNDARY_VIOLATION",
      value
    );
  }
}

function contractError(
  message: string,
  reasonCode: string,
  response: Record<string, unknown>
): TitmasContractError {
  return new TitmasContractError(message, undefined, reasonCode, response);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
