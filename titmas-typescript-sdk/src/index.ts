import {
  Configuration,
  DefaultApi,
  ReceiptFromJSON,
  instanceOfReceipt,
  type PreflightRequest,
  type PreflightResult,
  type Receipt,
  type ReceiptResponse,
  type ReceiptVerification
} from "../generated/src/index.js";

export type ResultValue = "PASS" | "FAIL" | "NOT_ASSESSED";

export interface BoundedPreflightOutcome {
  result: ResultValue;
  reason_codes: string[];
  receipt_id: string;
  request_id: string;
  schema_id: string | null;
  schema_version: string | null;
  completed_at: string;
  formal_conformance: false;
  certification: false;
  truth_claim: false;
  authorization_effect: false;
}

export interface BoundedReceiptVerification {
  valid: boolean;
  verification_status: string;
  reason_codes: string[];
  structure_only: true;
  truth_verified: false;
  authorization_effect: false;
}

export interface TitmasClientOptions {
  baseUrl?: string;
  credential?: string;
  credentialId?: string;
  generatedApi?: DefaultApi;
}

export interface PreflightInput {
  requestId: string;
  idempotencyKey: string;
  tenantId: string;
  agentIdentity: string;
  object: unknown;
  credentialId?: string;
  schemaId?: string;
  schemaName?: string;
  schemaVersion?: string;
  objectDigest?: string;
  timestamp?: Date;
}

export class TitmasContractError extends Error {
  constructor(
    message: string,
    readonly reasonCode: string
  ) {
    super(message);
    this.name = "TitmasContractError";
  }
}

export class TitmasAuthenticationError extends TitmasContractError {
  override name = "TitmasAuthenticationError";
}

/** Semantic wrapper over the generated transport. No HTTP is implemented here. */
export class TitmasClient {
  private readonly api: DefaultApi;
  private readonly credential: string | undefined;
  private readonly credentialId: string | undefined;

  constructor(options: TitmasClientOptions = {}) {
    const baseUrl = (options.baseUrl ?? "https://redcrag.cn").replace(/\/$/, "");
    if (!/^https?:\/\//.test(baseUrl)) {
      throw new TypeError("baseUrl must be an absolute HTTP(S) URL");
    }
    this.credential = options.credential;
    this.credentialId = options.credentialId;
    this.api =
      options.generatedApi ??
      new DefaultApi(
        new Configuration({
          basePath: baseUrl,
          headers: { "User-Agent": "titmas-agent-sdk-typescript/0.1.0 generated-transport" },
          ...(options.credential === undefined ? {} : { accessToken: options.credential })
        })
      );
  }

  capabilities(): Promise<Record<string, unknown>> {
    return this.api.titmasGetCapabilities();
  }

  status(): Promise<Record<string, unknown>> {
    return this.api.titmasStatus();
  }

  catalog(): Promise<unknown> {
    this.requireProtectedContext();
    return this.api.titmasGetCatalog();
  }

  quota(): Promise<unknown> {
    this.requireProtectedContext();
    return this.api.titmasGetQuota();
  }

  usage(): Promise<unknown> {
    this.requireProtectedContext();
    return this.api.titmasGetUsage();
  }

  receipt(receiptId: string): Promise<ReceiptResponse> {
    this.requireProtectedContext();
    return this.api.titmasGetReceipt({ receiptId });
  }

  async preflight(input: PreflightInput): Promise<BoundedPreflightOutcome> {
    const credentialId = this.requireProtectedContext(
      input.credentialId ?? this.credentialId
    );
    const schemaId = input.schemaId ?? input.schemaName;
    if (!schemaId || !input.schemaVersion || !input.objectDigest) {
      throw new TitmasContractError(
        "schemaId, schemaVersion and objectDigest are required by API v1",
        "PREFLIGHT_CONTRACT_FIELDS_MISSING"
      );
    }
    if (!/^[0-9a-f]{64}$/.test(input.objectDigest)) {
      throw new TitmasContractError(
        "objectDigest must be a lowercase SHA-256 digest",
        "OBJECT_DIGEST_INVALID"
      );
    }
    const request: PreflightRequest = {
      agentId: input.agentIdentity,
      apiVersion: "v1",
      credentialId,
      idempotencyKey: input.idempotencyKey,
      object: input.object,
      objectDigest: input.objectDigest,
      requestId: input.requestId,
      schemaId,
      schemaVersion: input.schemaVersion,
      tenantId: input.tenantId,
      ...(input.timestamp === undefined ? {} : { timestamp: input.timestamp })
    };
    const result = await this.api.titmasPreflight({
      preflightRequest: request,
      idempotencyKey: input.idempotencyKey
    });
    return boundPreflight(result);
  }

  async verifyReceipt(
    receipt: Receipt | Record<string, unknown>
  ): Promise<BoundedReceiptVerification> {
    this.requireProtectedContext();
    const value = instanceOfReceipt(receipt)
      ? (receipt as Receipt)
      : ReceiptFromJSON(receipt);
    if (!instanceOfReceipt(value)) {
      throw new TitmasContractError(
        "Receipt must be a contract-valid object",
        "RECEIPT_CONTRACT_VIOLATION"
      );
    }
    const result = await this.api.titmasVerifyReceipt({
      receiptVerifyRequest: { receipt: value }
    });
    return boundReceiptVerification(result);
  }

  private requireProtectedContext(credentialId?: string): string {
    if (!this.credential) {
      throw new TitmasAuthenticationError(
        "a delegated machine credential is required",
        "CREDENTIAL_MISSING"
      );
    }
    if (credentialId === undefined && this.credentialId === undefined) {
      throw new TitmasAuthenticationError(
        "credentialId is required by the frozen API v1 contract",
        "CREDENTIAL_ID_MISSING"
      );
    }
    return credentialId ?? this.credentialId!;
  }
}

function boundPreflight(value: PreflightResult): BoundedPreflightOutcome {
  if (!["PASS", "FAIL", "NOT_ASSESSED"].includes(value.result)) {
    throw new TitmasContractError(
      `unknown result value: ${String(value.result)}`,
      "RESULT_SEMANTICS_VIOLATION"
    );
  }
  return {
    result: value.result,
    reason_codes: [...value.reasonCodes],
    receipt_id: value.receiptId,
    request_id: value.requestId,
    schema_id: value.schemaId,
    schema_version: value.schemaVersion,
    completed_at: value.completedAt.toISOString(),
    formal_conformance: false,
    certification: false,
    truth_claim: false,
    authorization_effect: false
  };
}

function boundReceiptVerification(
  value: ReceiptVerification
): BoundedReceiptVerification {
  const allowed = new Set([
    "VALID",
    "INVALID_SIGNATURE",
    "UNVERIFIABLE_KEY_UNAVAILABLE",
    "CHAIN_INVALID",
    "STRUCTURE_INVALID",
    "NOT_ASSESSED"
  ]);
  if (!allowed.has(value.verificationStatus)) {
    throw new TitmasContractError(
      `unknown Receipt verification status: ${String(value.verificationStatus)}`,
      "RECEIPT_SEMANTICS_VIOLATION"
    );
  }
  return {
    valid: value.valid,
    verification_status: value.verificationStatus,
    reason_codes: [...value.reasonCodes],
    structure_only: true,
    truth_verified: false,
    authorization_effect: false
  };
}

export * as generated from "../generated/src/index.js";
