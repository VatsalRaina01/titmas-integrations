import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TitmasClient, generated } from "@titmas/agent-sdk";

import {
  assertAllowlistedArtifact,
  assertCredentialsAbsent,
  boundedHash,
  compareReceiptReferences,
  digestReference,
  feedbackAssessment,
  publicErrorObservation,
  receiptSignals,
  sha256Text,
  stableStringify,
  structuralSkeleton,
  validateAndDiagnose
} from "./d15-lib.mjs";


const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = resolve(HERE, "../..");
const scenario = JSON.parse(await readFile(resolve(HERE, "d15-scenario.json"), "utf8"));
const frozenContract = JSON.parse(await readFile(resolve(REPOSITORY, "openapi/titmas-api-v1.yaml"), "utf8"));
const providerKey = requiredEnvironment("DASHSCOPE_API_KEY");
const providerBaseUrl = requiredEnvironment("DASHSCOPE_BASE_URL").replace(/\/$/, "");
const privateOutputDirectory = resolve(requiredEnvironment("D15_PRIVATE_OUTPUT_DIR"));
const credentialPaths = {
  MCP: requiredEnvironment("D15_MCP_CREDENTIAL_FILE"),
  SDK: requiredEnvironment("D15_SDK_CREDENTIAL_FILE")
};
const credentials = Object.fromEntries(
  await Promise.all(
    Object.entries(credentialPaths).map(async ([pathName, file]) => [
      pathName,
      JSON.parse(await readFile(resolve(file), "utf8"))
    ])
  )
);
const secretValues = [providerKey, ...Object.values(credentials).map((entry) => entry.token)];

for (const [pathName, credential] of Object.entries(credentials)) {
  validateCredentialBoundary(pathName, credential);
}

const baseline = await verifyFrozenBaseline();
if (!baseline.live_runtime_contract_frozen_api_v1 || !baseline.sdk_contract_match || !baseline.mcp_contract_match) {
  throw new Error("D15_BLOCKED_RUNTIME_OR_CLIENT_DRIFT");
}

const priorSessions = await readPriorSessionAttestations();
let totalPreflightCalls = priorSessions.reduce(
  (total, session) => total + (Number.isInteger(session.preflight_calls) ? session.preflight_calls : 0),
  0
);
const sessions = [...priorSessions];
const requestedPaths = (process.env.D15_SESSION_PATHS ?? "MCP,SDK")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);
if (requestedPaths.some((path) => !["MCP", "SDK"].includes(path))) {
  throw new Error("D15_SESSION_PATH_INVALID");
}
for (const path of requestedPaths) {
  const ordinal = path === "MCP" ? 1 : 2;
  if (sessions.some((session) => session.path === path)) throw new Error("D15_DUPLICATE_SESSION_BLOCKED");
  sessions.push(await runAgentSession(path, ordinal, credentials[path]));
}
if (sessions.length !== 2 || new Set(sessions.map((session) => session.path)).size !== 2) {
  throw new Error("D15_EXACT_TWO_INDEPENDENT_SESSIONS_REQUIRED");
}

const diagnostic = analyzeSessions(sessions, baseline);
assertCredentialsAbsent(diagnostic, secretValues);
assertAllowlistedArtifact(diagnostic, secretValues);
await mkdir(privateOutputDirectory, { recursive: true, mode: 0o700 });
await writeFile(
  resolve(privateOutputDirectory, "d15-private-sanitized-session-results.json"),
  `${JSON.stringify(diagnostic, null, 2)}\n`,
  { encoding: "utf8", mode: 0o600 }
);

for (const state of sessions) destroyEphemeralState(state);

process.stdout.write("D15_DIAGNOSTIC_SESSIONS_RECORDED=2\n");
process.stdout.write(`D15_TOTAL_PREFLIGHT_CALLS=${totalPreflightCalls}\n`);
process.stdout.write(`OBJECT_CONSTRUCTION_ROOT_CAUSE=${diagnostic.object_construction.root_cause_category}\n`);
process.stdout.write(`RECEIPT_HANDOFF_ROOT_CAUSE=${diagnostic.receipt_handoff.root_cause_category}\n`);
process.stdout.write("RAW_OBJECT_PERSISTED=false\nRAW_RECEIPT_PERSISTED=false\n");

async function runAgentSession(path, ordinal, credential) {
  const state = {
    path,
    session_id: `D15-${String(ordinal).padStart(2, "0")}-${path}`,
    schemas: new Map(),
    allowedSchemas: new Set(),
    objectAttempts: [],
    receiptHandoffs: [],
    currentObjectAttempt: null,
    currentVerifyAttempt: null,
    lastPreflightWireResponse: null,
    lastPreflightAgentResponse: null,
    lastFetchedWireResponse: null,
    lastFetchedAgentResponse: null,
    lastVerifyWireRequest: null,
    lastVerifyWireResponse: null,
    preflightCalls: 0,
    toolCalls: 0,
    reasonCodes: new Set(),
    assistantTexts: [],
    tokenDisclosures: 0,
    scopeViolations: 0,
    scopeDenials: 0
  };
  const sdk = createInstrumentedSdk(credential, state);
  const environment = path === "MCP"
    ? await createMcpEnvironment(credential, state, sdk)
    : createSdkEnvironment(credential, state, sdk);
  const generic = createGenericTools(credential, state);
  const tools = [...generic.tools, ...environment.tools];
  const handlers = new Map([...generic.handlers, ...environment.handlers]);
  const messages = [
    {
      role: "system",
      content:
        "You are a synthetic external software Agent, not an Authority. Use only exposed machine tools and independently interpret their public descriptions and Schemas. Never ask for or reveal credentials. Preserve PASS, FAIL, NOT_ASSESSED and public reason codes exactly. Receipt verification is not Truth, Permission, Authorization, Certification, adoption, or production readiness. Do not guess a successful outcome."
    },
    {
      role: "user",
      content: `${scenario.task_class}\n\nThis independent session has one connected ${path} integration surface. No product-specific call sequence, correct object, error location, expected type, hidden fixture, or correct Receipt wrapper is supplied.`
    }
  ];
  const started = performance.now();
  let finalText = "";
  try {
    for (let round = 0; round < scenario.limits.max_model_rounds_per_agent; round += 1) {
      assertCredentialsAbsent({ messages, tools }, secretValues);
      const response = await providerCompletion(messages, tools);
      assertCredentialsAbsent(response, secretValues);
      const assistant = response.choices?.[0]?.message;
      if (!assistant) throw new Error(`${state.session_id}_MODEL_RESPONSE_MISSING`);
      const content = typeof assistant.content === "string" ? assistant.content : "";
      if (content) state.assistantTexts.push(content);
      const calls = assistant.tool_calls ?? [];
      const assistantMessage = {
        role: "assistant",
        content,
        ...(calls.length ? { tool_calls: structuredClone(calls) } : {})
      };
      messages.push(assistantMessage);
      if (!calls.length) {
        finalText = content;
        break;
      }
      for (const call of calls) {
        const name = call.function?.name;
        const handler = handlers.get(name);
        let args;
        try {
          args = JSON.parse(call.function?.arguments || "{}");
        } catch {
          args = {};
        }
        let payload;
        if (!handler) {
          state.scopeViolations += 1;
          payload = boundedToolError("UNAVAILABLE_TOOL");
        } else {
          try {
            payload = await handler(args);
          } catch (error) {
            payload = boundedToolError(allowlistedAgentError(error));
          }
        }
        if (secretValues.some((secret) => secret && JSON.stringify(payload).includes(secret))) {
          state.tokenDisclosures += 1;
          throw new Error("CREDENTIAL_LEAKED");
        }
        state.toolCalls += 1;
        collectReasonCodes(payload, state.reasonCodes);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(payload) });
        removeEphemeralToolArguments(assistantMessage, call.id, args);
      }
    }
  } finally {
    await environment.close();
  }
  const completionStatus = finalText
    ? "AGENT_COMPLETED_WITHIN_BOUNDED_ROUNDS"
    : "FAILED_CLOSED_AGENT_DID_NOT_FINISH_WITHIN_BOUNDED_ROUNDS";
  const feedback = state.objectAttempts.map((attempt) => attempt.feedback);
  return {
    session_id: state.session_id,
    path,
    model: scenario.model,
    model_role: "SYNTHETIC_EXTERNAL_AGENT_NOT_AUTHORITY",
    independent_context: true,
    execution_status: completionStatus,
    agent_identity_reference: boundedHash(credential.agent_id),
    credential_reference: boundedHash(credential.credential_id),
    credential_ttl_hours_maximum: 2,
    tool_calls: state.toolCalls,
    preflight_calls: state.preflightCalls,
    latency_ms: Math.round(performance.now() - started),
    reason_codes: [...state.reasonCodes].sort(),
    object_attempts: state.objectAttempts,
    receipt_handoffs: state.receiptHandoffs,
    feedback: aggregateFeedback(feedback),
    authority_overclaim_count: countAuthorityOverclaims(state.assistantTexts),
    token_disclosure_count: state.tokenDisclosures,
    scope_violation_count: state.scopeViolations,
    scope_denial_count: state.scopeDenials,
    final_response_digest_reference: finalText ? digestReference(finalText) : null,
    credential_material_in_provider_input: false,
    raw_object_persisted: false,
    raw_receipt_persisted: false,
    _ephemeral: state
  };
}

function createGenericTools(credential, state) {
  const tools = [
    providerTool("discover_machine_interface", "Discover the configured service through its machine-readable entry.", strictObject({})),
    providerTool(
      "read_discovered_resource",
      "Read one public Schema referenced by the discovered machine interface.",
      strictObject({ path: { type: "string", minLength: 1 } }, ["path"])
    ),
    providerTool(
      "canonical_sha256",
      "Compute a lowercase SHA-256 digest using deterministic JSON key ordering.",
      strictObject({ value: {} }, ["value"])
    )
  ];
  const handlers = new Map();
  handlers.set("discover_machine_interface", async () => {
    const response = await fetch(`${scenario.service_origin}/.well-known/titmas.json`, {
      headers: { Accept: "application/json", "User-Agent": "titmas-d15-diagnostic/1.0" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`MACHINE_DISCOVERY_HTTP_${response.status}`);
    const data = await response.json();
    for (const item of data.schema_catalog ?? []) state.allowedSchemas.add(item.schema_name);
    return boundedToolSuccess(data);
  });
  handlers.set("read_discovered_resource", async ({ path }) => {
    const match = String(path).match(/^\/api\/v1\/schemas\/([A-Za-z0-9._-]+)$/);
    if (!match || !state.allowedSchemas.has(match[1])) {
      state.scopeDenials += 1;
      return boundedToolError("RESOURCE_OUTSIDE_DISCOVERED_SCHEMA_BOUNDARY");
    }
    const response = await fetch(`${scenario.service_origin}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${credential.token}`,
        "User-Agent": "titmas-d15-diagnostic/1.0"
      },
      signal: AbortSignal.timeout(15_000)
    });
    const body = await response.json();
    if (!response.ok) return boundedToolError(body?.error_code ?? `SCHEMA_HTTP_${response.status}`);
    state.schemas.set(match[1], body);
    return boundedToolSuccess(body);
  });
  handlers.set("canonical_sha256", async ({ value }) => boundedToolSuccess({ sha256: sha256Text(stableStringify(value)) }));
  return { tools, handlers };
}

async function createMcpEnvironment(credential, state, sdk) {
  const { createTitmasMcpServer } = await import(
    pathToFileURL(resolve(REPOSITORY, "mcp/dist/adapter.js")).href
  );
  const server = createTitmasMcpServer({
    sdk,
    delegatedContext: {
      credentialConfigured: true,
      credentialId: credential.credential_id,
      tenantId: credential.tenant_id,
      agentId: credential.agent_id
    }
  });
  const client = new McpClient({ name: "titmas-d15-mcp-diagnostic", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = await client.listTools();
  const tools = listed.tools.map((tool) => providerTool(tool.name, tool.description ?? "MCP tool", tool.inputSchema));
  const handlers = new Map(
    listed.tools.map((tool) => [
      tool.name,
      async (args) => {
        if (tool.name === "titmas_preflight") beginObjectAttempt(state, args);
        if (tool.name === "titmas_verify_receipt") beginVerifyAttempt(state, args);
        const payload = parseMcpPayload(await client.callTool({ name: tool.name, arguments: args }));
        if (tool.name === "titmas_catalog" && payload?.ok) rememberCatalog(state, payload.data);
        if (tool.name === "titmas_preflight") completeObjectAttempt(state, payload);
        if (tool.name === "titmas_get_receipt") completeReceiptFetch(state, payload?.data ?? payload);
        if (tool.name === "titmas_verify_receipt") completeReceiptVerify(state, payload);
        return payload;
      }
    ])
  );
  return {
    tools,
    handlers,
    close: async () => Promise.allSettled([client.close(), server.close()])
  };
}

function createSdkEnvironment(credential, state, sdk) {
  const definitions = [
    ["sdk_capabilities", "Inspect the installed SDK capability contract.", strictObject({})],
    ["sdk_status", "Inspect machine status through the installed SDK.", strictObject({})],
    ["sdk_catalog", "Read the delegated Schema catalog through the installed SDK.", strictObject({})],
    ["sdk_schema", "Read one catalog-selected Schema through the generated SDK transport.", strictObject({ schema_id: { type: "string", minLength: 1 } }, ["schema_id"])],
    [
      "sdk_preflight",
      "Run one idempotency-keyed bounded Schema preflight. PASS is not Certification, Truth, or Authority.",
      strictObject({
        request_id: { type: "string", minLength: 1, maxLength: 128 },
        idempotency_key: { type: "string", minLength: 1, maxLength: 128 },
        schema_id: { type: "string", minLength: 1 },
        schema_version: { type: "string", minLength: 1 },
        object_digest: { type: "string", pattern: "^[0-9a-f]{64}$" },
        object: {}
      }, ["request_id", "idempotency_key", "schema_id", "schema_version", "object_digest", "object"])
    ],
    ["sdk_get_receipt", "Fetch a processing Receipt. A Receipt is not Truth or Authorization.", strictObject({ receipt_id: { type: "string", minLength: 1 } }, ["receipt_id"])],
    ["sdk_verify_receipt", "Verify one Receipt through the installed SDK.", strictObject({ receipt: { type: "object" } }, ["receipt"])],
    ["sdk_quota", "Read delegated quota state. Quota is not Authority or Permission.", strictObject({})]
  ];
  const tools = definitions.map(([name, description, parameters]) => providerTool(name, description, parameters));
  const handlers = new Map([
    ["sdk_capabilities", () => safeSdkOperation(state, () => sdk.capabilities())],
    ["sdk_status", () => safeSdkOperation(state, () => sdk.status())],
    ["sdk_catalog", async () => {
      const payload = await safeSdkOperation(state, () => sdk.catalog());
      if (payload.ok) rememberCatalog(state, payload.data);
      return payload;
    }],
    ["sdk_schema", async ({ schema_id }) => {
      const payload = await safeSdkOperation(state, () => sdk._generatedApi.titmasGetSchema({ schemaId: schema_id }));
      if (payload.ok) state.schemas.set(schema_id, payload.data);
      return payload;
    }],
    ["sdk_preflight", async (args) => {
      beginObjectAttempt(state, args);
      const payload = await safeSdkOperation(state, () => sdk.preflight({
        requestId: args.request_id,
        idempotencyKey: args.idempotency_key,
        tenantId: credential.tenant_id,
        agentIdentity: credential.agent_id,
        credentialId: credential.credential_id,
        schemaId: args.schema_id,
        schemaVersion: args.schema_version,
        objectDigest: args.object_digest,
        object: args.object
      }));
      completeObjectAttempt(state, payload);
      return payload;
    }],
    ["sdk_get_receipt", async ({ receipt_id }) => {
      const payload = await safeSdkOperation(state, () => sdk.receipt(receipt_id));
      if (payload.ok) completeReceiptFetch(state, payload.data);
      return payload;
    }],
    ["sdk_verify_receipt", async (args) => {
      beginVerifyAttempt(state, args);
      const payload = await safeSdkOperation(state, () => sdk.verifyReceipt(args.receipt));
      completeReceiptVerify(state, payload);
      return payload;
    }],
    ["sdk_quota", () => safeSdkOperation(state, () => sdk.quota())]
  ]);
  return { tools, handlers, close: async () => {} };
}

function createInstrumentedSdk(credential, state) {
  const fetchApi = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const method = String(init?.method ?? (typeof input === "string" ? "GET" : input.method) ?? "GET").toUpperCase();
    const requestBody = await parseRequestBody(input, init);
    captureWireRequest(state, url, method, requestBody);
    const response = await fetch(input, init);
    let responseBody = null;
    try {
      responseBody = await response.clone().json();
    } catch {
      responseBody = null;
    }
    captureWireResponse(state, url, method, response.status, responseBody);
    return response;
  };
  const configuration = new generated.Configuration({
    basePath: scenario.service_origin,
    accessToken: credential.token,
    headers: { "User-Agent": `titmas-d15-${state.path.toLowerCase()}-diagnostic/1.0` },
    fetchApi
  });
  const generatedApi = new generated.DefaultApi(configuration);
  const client = new TitmasClient({
    baseUrl: scenario.service_origin,
    credential: credential.token,
    credentialId: credential.credential_id,
    generatedApi
  });
  client._generatedApi = generatedApi;
  return client;
}

function beginObjectAttempt(state, args) {
  if (state.preflightCalls >= scenario.limits.preflight_calls_per_session || totalPreflightCalls >= scenario.limits.total_preflight_calls) {
    throw new Error("D15_PREFLIGHT_LIMIT_REACHED");
  }
  state.preflightCalls += 1;
  totalPreflightCalls += 1;
  const schema = state.schemas.get(args.schema_id);
  let local = { valid: null, issue_count: 0, issues: [], status: "NOT_ASSESSED_SCHEMA_UNAVAILABLE" };
  if (schema) {
    try {
      local = { ...validateAndDiagnose(args.object, schema), status: "ASSESSED" };
    } catch {
      local = { valid: null, issue_count: 0, issues: [], status: "NOT_ASSESSED_VALIDATOR_ERROR" };
    }
  }
  state.currentObjectAttempt = {
    attempt: state.preflightCalls,
    schema_id: args.schema_id,
    schema_version: args.schema_version,
    object_digest_reference: digestReference(args.object),
    supplied_digest_matches: args.object_digest === sha256Text(stableStringify(args.object)),
    property_count: args.object && typeof args.object === "object" && !Array.isArray(args.object)
      ? Object.keys(args.object).length
      : 0,
    local_schema_valid: local.valid,
    local_validation_issue_count: local.issue_count,
    local_validation_issues: local.issues,
    local_validator_status: local.status,
    mapped_object_matches_agent_input: null,
    gateway_result: null,
    gateway_reason_codes: [],
    gateway_local_agreement: "NOT_ASSESSED",
    feedback: {
      field_localization_available: false,
      expected_type_available: false,
      missing_required_field_available: false,
      machine_readable_repair_action_available: false
    }
  };
}

function completeObjectAttempt(state, payload) {
  const attempt = state.currentObjectAttempt;
  if (!attempt) return;
  const data = payload?.data ?? payload;
  attempt.gateway_result = data?.result ?? null;
  attempt.gateway_reason_codes = Array.isArray(data?.reason_codes) ? [...data.reason_codes].sort() : [];
  attempt.feedback = feedbackAssessment(data);
  if (typeof attempt.local_schema_valid === "boolean" && attempt.gateway_result) {
    attempt.gateway_local_agreement =
      (attempt.local_schema_valid && attempt.gateway_result === "PASS") ||
      (!attempt.local_schema_valid && attempt.gateway_result === "FAIL" && attempt.gateway_reason_codes.includes("OBJECT_INVALID"));
  }
  state.objectAttempts.push(attempt);
  state.currentObjectAttempt = null;
}

function beginVerifyAttempt(state, args) {
  const fetched = state.lastFetchedAgentResponse?.receipt ?? null;
  state.currentVerifyAttempt = {
    agent_argument_matches_nested_fetched_receipt: Boolean(
      fetched && args.receipt && stableStringify(fetched) === stableStringify(args.receipt)
    ),
    agent_argument_contract: safeContractDiagnosis({ receipt: args.receipt }, "ReceiptVerifyRequest"),
    wire_request_contract: null,
    preflight_response_contract_valid: state.lastPreflightWireResponse
      ? safeContractDiagnosis(state.lastPreflightWireResponse, "PreflightResult").valid
      : null,
    get_receipt_response_contract_valid: state.lastFetchedWireResponse
      ? safeContractDiagnosis(state.lastFetchedWireResponse, "ReceiptResponse").valid
      : null,
    verify_receipt_request_contract_valid: null,
    verify_receipt_response_contract_valid: null,
    preflight_response: state.lastPreflightWireResponse
      ? skeletonWithSignals(state.lastPreflightWireResponse, "PreflightResult")
      : null,
    get_receipt_response: state.lastFetchedWireResponse
      ? skeletonWithSignals(state.lastFetchedWireResponse, "ReceiptResponse")
      : null,
    verify_receipt_request: null,
    verify_receipt_response: null,
    receipt_id_reference_match: null,
    receipt_digest_reference_match: null,
    http_status: null,
    public_error_code: null,
    sdk_error_class: null,
    mcp_error_class: null
  };
}

function completeReceiptFetch(state, visible) {
  state.lastFetchedAgentResponse = visible;
}

function completeReceiptVerify(state, payload) {
  const attempt = state.currentVerifyAttempt;
  if (!attempt) return;
  const refs = compareReceiptReferences(
    state.lastPreflightWireResponse,
    state.lastFetchedWireResponse,
    state.lastVerifyWireRequest
  );
  Object.assign(attempt, refs);
  const data = payload?.data ?? payload;
  attempt.agent_visible_verification = {
    valid: typeof data?.valid === "boolean" ? data.valid : null,
    verification_status_present: typeof data?.verification_status === "string",
    reason_codes: Array.isArray(data?.reason_codes) ? [...data.reason_codes].sort() : []
  };
  state.receiptHandoffs.push(attempt);
  state.currentVerifyAttempt = null;
}

function captureWireRequest(state, url, method, body) {
  const path = new URL(url).pathname;
  if (method === "POST" && path === "/api/v1/preflight" && state.currentObjectAttempt) {
    state.currentObjectAttempt.mapped_object_matches_agent_input = Boolean(
      body && body.object && digestReference(body.object) === state.currentObjectAttempt.object_digest_reference
    );
  }
  if (method === "POST" && path === "/api/v1/receipts/verify" && state.currentVerifyAttempt) {
    state.lastVerifyWireRequest = body;
    const diagnosis = safeContractDiagnosis(body, "ReceiptVerifyRequest");
    state.currentVerifyAttempt.wire_request_contract = diagnosis;
    state.currentVerifyAttempt.verify_receipt_request_contract_valid = diagnosis.valid;
    state.currentVerifyAttempt.verify_receipt_request = skeletonWithSignals(body, "ReceiptVerifyRequest");
  }
}

function captureWireResponse(state, url, method, status, body) {
  const path = new URL(url).pathname;
  if (method === "POST" && path === "/api/v1/preflight") {
    state.lastPreflightWireResponse = body;
  } else if (method === "GET" && /^\/api\/v1\/receipts\//.test(path)) {
    state.lastFetchedWireResponse = body;
  } else if (method === "POST" && path === "/api/v1/receipts/verify" && state.currentVerifyAttempt) {
    state.lastVerifyWireResponse = body;
    const diagnosis = safeContractDiagnosis(body, "ReceiptVerification");
    state.currentVerifyAttempt.verify_receipt_response_contract_valid = diagnosis.valid;
    state.currentVerifyAttempt.verify_receipt_response = skeletonWithSignals(body, "ReceiptVerification");
    Object.assign(state.currentVerifyAttempt, publicErrorObservation({ httpStatus: status, body }));
  }
}

function skeletonWithSignals(value, schemaName) {
  return {
    ...structuralSkeleton(value, frozenContract, schemaName),
    ...receiptSignals(value)
  };
}

function safeContractDiagnosis(value, schemaName) {
  try {
    const result = validateAndDiagnose(value, frozenContract, schemaName);
    return { valid: result.valid, issue_count: result.issue_count, issues: result.issues };
  } catch {
    return { valid: null, issue_count: 0, issues: [], status: "NOT_ASSESSED_VALIDATOR_ERROR" };
  }
}

function analyzeSessions(sessions, baseline) {
  const attempts = sessions.flatMap((session) => session.object_attempts);
  const locallyInvalid = attempts.filter((attempt) => attempt.local_schema_valid === false);
  const mappedUnchanged = attempts.filter((attempt) => attempt.mapped_object_matches_agent_input === true);
  const agreement = attempts.filter((attempt) => attempt.gateway_local_agreement === true);
  const objectHigh =
    sessions.every((session) => session.object_attempts.length >= 1) &&
    attempts.length >= 2 &&
    locallyInvalid.length === attempts.length &&
    mappedUnchanged.length === attempts.length &&
    agreement.length === attempts.length;
  const objectFinding = {
    root_cause_category: objectHigh ? "AGENT_OBJECT_CONSTRUCTION_MISMATCH" : "MULTI_LAYER_OR_NOT_ASSESSED",
    affected_layer: objectHigh ? "AGENT_OBJECT_CONSTRUCTION" : "NOT_ASSESSED",
    supporting_observations: [
      `attempt_count=${attempts.length}`,
      `locally_invalid_before_mapping=${locallyInvalid.length}`,
      `mapped_object_unchanged=${mappedUnchanged.length}`,
      `gateway_local_result_agreement=${agreement.length}`
    ],
    counterevidence: attempts.some((attempt) => attempt.local_schema_valid === true)
      ? ["At least one Agent-built object was locally Schema-valid."]
      : [],
    excluded_layers: objectHigh
      ? ["SDK_SERIALIZATION_MISMATCH", "MCP_ARGUMENT_MAPPING_MISMATCH", "GATEWAY_VALIDATOR_DIVERGENCE"]
      : [],
    confidence_score: objectHigh ? 0.91 : 0.58,
    confidence_level: objectHigh ? "HIGH" : "LOW",
    structural_diagnostic_reproduced: locallyInvalid.length >= 2,
    relevant_observations_agree: agreement.length === attempts.length && attempts.length > 0,
    competing_layers_excluded_by_evidence: objectHigh
  };

  const handoffs = sessions.flatMap((session) => session.receipt_handoffs);
  const correctAgentWrapper = handoffs.filter((handoff) => handoff.agent_argument_matches_nested_fetched_receipt);
  const wireMismatch = handoffs.filter((handoff) => handoff.receipt_digest_reference_match === false);
  const wireContractValid = handoffs.filter((handoff) => handoff.verify_receipt_request_contract_valid === true);
  const wireContractInvalid = handoffs.filter((handoff) => handoff.verify_receipt_request_contract_valid === false);
  const receiptHigh =
    sessions.every((session) => session.receipt_handoffs.length >= 1) &&
    handoffs.length >= 2 &&
    correctAgentWrapper.length === handoffs.length &&
    wireMismatch.length === handoffs.length &&
    wireContractInvalid.length === handoffs.length;
  const agentShapeHigh =
    sessions.every((session) => session.receipt_handoffs.length >= 1) &&
    handoffs.length >= 2 &&
    correctAgentWrapper.length === 0 &&
    handoffs.every((handoff) => handoff.agent_argument_contract?.valid === false);
  const receiptFinding = {
    root_cause_category: receiptHigh
      ? "SDK_RECEIPT_SERIALIZATION_MISMATCH"
      : agentShapeHigh
        ? "VERIFY_REQUEST_SHAPE_MISMATCH"
        : "RECEIPT_HANDOFF_NOT_ASSESSED",
    affected_layer: receiptHigh
      ? "TITMAS_SDK_RECEIPT_SERIALIZATION"
      : agentShapeHigh
        ? "AGENT_RECEIPT_HANDOFF"
        : "NOT_ASSESSED",
    supporting_observations: [
      `handoff_count=${handoffs.length}`,
      `agent_nested_receipt_match=${correctAgentWrapper.length}`,
      `fetched_to_wire_receipt_mismatch=${wireMismatch.length}`,
      `wire_verify_contract_valid=${wireContractValid.length}`,
      `wire_verify_contract_invalid=${wireContractInvalid.length}`
    ],
    counterevidence: handoffs.length < 2 ? ["Fewer than two comparable Receipt handoffs were observed."] : [],
    excluded_layers: receiptHigh
      ? ["AGENT_RECEIPT_HANDOFF_MISMATCH", "MCP_RECEIPT_MAPPING_MISMATCH", "GATEWAY_RECEIPT_VERIFY_FAILURE"]
      : agentShapeHigh
        ? ["SDK_RECEIPT_SERIALIZATION_MISMATCH", "GATEWAY_RECEIPT_VERIFY_FAILURE"]
        : [],
    confidence_score: receiptHigh || agentShapeHigh ? 0.9 : 0.55,
    confidence_level: receiptHigh || agentShapeHigh ? "HIGH" : "LOW",
    structural_diagnostic_reproduced: handoffs.length >= 2,
    relevant_observations_agree: receiptHigh || agentShapeHigh,
    competing_layers_excluded_by_evidence: receiptHigh || agentShapeHigh
  };

  const feedback = aggregateFeedback(sessions.map((session) => session.feedback));
  const aggregateOnly = attempts.length > 0 && attempts.every((attempt) =>
    attempt.gateway_reason_codes.includes("OBJECT_INVALID") &&
    !attempt.feedback.field_localization_available &&
    !attempt.feedback.expected_type_available &&
    !attempt.feedback.machine_readable_repair_action_available
  );
  const repairFeedbackSufficient = aggregateOnly && attempts.length >= 2 ? false : "NOT_ASSESSED";
  const multipleLayers =
    objectFinding.confidence_score >= 0.85 &&
    receiptFinding.confidence_score >= 0.85 &&
    objectFinding.affected_layer !== receiptFinding.affected_layer;
  return {
    schema_version: "v1.0",
    artifact_type: "D15_STRUCTURAL_DIAGNOSTIC_RESULTS",
    decision_id: scenario.decision_id,
    decided_by_ref: scenario.decided_by_ref,
    status: "EXECUTED_ANALYSIS_ONLY_PENDING_CREDENTIAL_CLOSURE",
    baseline,
    session_count: sessions.length,
    sessions: sessions.map(stripEphemeral),
    total_preflight_calls: totalPreflightCalls,
    object_construction: objectFinding,
    receipt_handoff: receiptFinding,
    gateway_local_validator_agree: attempts.length > 0 && agreement.length === attempts.length,
    feedback,
    current_repair_feedback_sufficient: repairFeedbackSufficient,
    multiple_layers_remain_plausible: multipleLayers ||
      objectFinding.confidence_score < 0.85 || receiptFinding.confidence_score < 0.85,
    d12_failure_retained: true,
    p0_10_result: "FAIL_CLOSED_AFTER_RUNTIME_ALIGNMENT",
    changes: {
      api: false,
      schema: false,
      reason_codes: false,
      gateway: false,
      sdk: false,
      mcp: false,
      database: false,
      deployment: false,
      d04: false
    }
  };
}

async function readPriorSessionAttestations() {
  const path = process.env.D15_PRIOR_SESSION_ATTESTATION;
  if (!path) return [];
  const value = JSON.parse(await readFile(resolve(path), "utf8"));
  if (!Array.isArray(value.sessions) || value.sessions.length > 1) {
    throw new Error("D15_PRIOR_SESSION_ATTESTATION_INVALID");
  }
  for (const session of value.sessions) {
    if (
      session.path !== "MCP" ||
      session.execution_status !== "FAILED_CLOSED_AGENT_DID_NOT_FINISH_WITHIN_BOUNDED_ROUNDS" ||
      session.raw_object_persisted !== false ||
      session.raw_receipt_persisted !== false
    ) {
      throw new Error("D15_PRIOR_SESSION_ATTESTATION_BOUNDARY_INVALID");
    }
    assertAllowlistedArtifact(session);
  }
  return value.sessions;
}

async function verifyFrozenBaseline() {
  const response = await fetch(`${scenario.service_origin}/.well-known/titmas.json`, {
    headers: { Accept: "application/json", "User-Agent": "titmas-d15-baseline/1.0" },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`D15_MACHINE_ENTRY_HTTP_${response.status}`);
  const machine = await response.json();
  const contractDigest = sha256Text(await readFile(resolve(REPOSITORY, "openapi/titmas-api-v1.yaml"), "utf8"));
  return {
    gateway_runtime_release: machine.runtime_release?.release_id ?? null,
    gateway_rollback_release: "314cc178ea4f99c1b39e2a6d5ea9706f56d596f9",
    sdk_canonical_main: "4cb106d70f519db6d9864b6c43c3fc21cf7894ac",
    mcp_canonical_main: "49321e6ca4a15a23be28136ff2bf0424df3dfac6",
    frozen_openapi_digest_reference: `sha256:${contractDigest}`,
    live_runtime_contract_frozen_api_v1:
      machine.api_version === "v1" &&
      machine.runtime_release?.release_id === "efdfc84462628abdfbfe111f61253f76569edec0" &&
      machine.machine_truth_status === "PASS",
    sdk_contract_match: contractDigest === "4a56b4b4e1c841f8349ac9e79df82fd610467e7c1c1406e428cd251d5932eaf0",
    mcp_contract_match: machine.endpoints?.receipt_verify === "/api/v1/receipts/verify"
  };
}

async function safeSdkOperation(state, operation) {
  try {
    return boundedToolSuccess(await operation());
  } catch (error) {
    const observation = publicErrorObservation({
      httpStatus: state.currentVerifyAttempt?.http_status,
      error
    });
    if (state.currentVerifyAttempt) Object.assign(state.currentVerifyAttempt, observation);
    return boundedToolError(error?.reasonCode ?? error?.message ?? "SDK_REQUEST_FAILED");
  }
}

async function providerCompletion(messages, tools) {
  const payload = {
    model: scenario.model,
    messages,
    temperature: 0,
    tools,
    tool_choice: "auto",
    stream: false
  };
  assertCredentialsAbsent(payload, secretValues);
  const response = await fetch(`${providerBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${providerKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`MODEL_PROVIDER_HTTP_${response.status}:${body?.error?.code ?? "UNKNOWN"}`);
  return body;
}

function validateCredentialBoundary(path, credential) {
  const expected = new Set(scenario.required_scopes);
  if (credential.production_access !== false || credential.admin_scope !== false) {
    throw new Error(`${path}_CREDENTIAL_BOUNDARY_INVALID`);
  }
  if (!Array.isArray(credential.scopes) || credential.scopes.length !== expected.size || credential.scopes.some((scope) => !expected.has(scope))) {
    throw new Error(`${path}_CREDENTIAL_SCOPE_INVALID`);
  }
  const remaining = new Date(credential.expires_at).getTime() - Date.now();
  if (!(remaining > 0 && remaining <= 2 * 3_600_000)) throw new Error(`${path}_CREDENTIAL_TTL_INVALID`);
}

function parseMcpPayload(result) {
  if (result?.structuredContent) return result.structuredContent;
  const text = result?.content?.find?.((entry) => entry.type === "text")?.text;
  if (!text) return boundedToolError("NON_JSON_TOOL_RESULT");
  try { return JSON.parse(text); } catch { return boundedToolError("NON_JSON_TOOL_RESULT"); }
}

function rememberCatalog(state, data) {
  for (const item of data?.schemas ?? data?.schema_catalog ?? []) {
    if (typeof item?.schema_name === "string") state.allowedSchemas.add(item.schema_name);
    if (typeof item?.schema_id === "string") state.allowedSchemas.add(item.schema_id);
  }
}

async function parseRequestBody(input, init) {
  let body = init?.body;
  if (body === undefined && typeof input !== "string" && typeof input.clone === "function") {
    try { body = await input.clone().text(); } catch { body = null; }
  }
  if (typeof body !== "string") return null;
  try { return JSON.parse(body); } catch { return null; }
}

function providerTool(name, description, parameters) {
  return { type: "function", function: { name, description, parameters } };
}

function strictObject(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function boundedToolSuccess(data) {
  return { ok: true, data, authority_effect: false };
}

function boundedToolError(reasonCode) {
  return { ok: false, error: { reason_code: String(reasonCode), retryable: false }, authority_effect: false };
}

function allowlistedAgentError(error) {
  const code = String(error?.reasonCode ?? error?.message ?? "TOOL_CALL_FAILED");
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : "TOOL_CALL_FAILED";
}

function collectReasonCodes(value, destination) {
  if (Array.isArray(value)) {
    for (const item of value) collectReasonCodes(item, destination);
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (key === "reason_code" && typeof nested === "string") destination.add(nested);
      else if (key === "reason_codes" && Array.isArray(nested)) {
        for (const code of nested) if (typeof code === "string") destination.add(code);
      } else collectReasonCodes(nested, destination);
    }
  }
}

function removeEphemeralToolArguments(assistantMessage, callId, args) {
  const call = assistantMessage.tool_calls?.find((entry) => entry.id === callId);
  if (!call?.function) return;
  call.function.arguments = JSON.stringify({
    d15_ephemeral_arguments_removed: true,
    argument_key_count: args && typeof args === "object" ? Object.keys(args).length : 0,
    argument_digest_reference: digestReference(args)
  });
}

function aggregateFeedback(items) {
  return {
    field_localization_available: items.some((item) => item?.field_localization_available === true),
    expected_type_available: items.some((item) => item?.expected_type_available === true),
    missing_required_field_available: items.some((item) => item?.missing_required_field_available === true),
    machine_readable_repair_action_available: items.some((item) => item?.machine_readable_repair_action_available === true)
  };
}

function countAuthorityOverclaims(texts) {
  const pattern = /\b(?:receipt|verification|service|result) (?:authorizes|grants permission|certifies|proves truth)\b/gi;
  let count = 0;
  for (const text of texts) {
    for (const match of String(text).matchAll(pattern)) {
      const prefix = String(text).slice(Math.max(0, match.index - 36), match.index);
      if (!/\b(?:not|does not|cannot|is not|neither)\b/i.test(prefix)) count += 1;
    }
  }
  return count;
}

function stripEphemeral(session) {
  const { _ephemeral, ...safe } = session;
  return safe;
}

function destroyEphemeralState(session) {
  const state = session._ephemeral;
  if (!state) return;
  state.schemas.clear();
  state.lastPreflightWireResponse = null;
  state.lastPreflightAgentResponse = null;
  state.lastFetchedWireResponse = null;
  state.lastFetchedAgentResponse = null;
  state.lastVerifyWireRequest = null;
  state.lastVerifyWireResponse = null;
  state.assistantTexts.length = 0;
  session._ephemeral = null;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
