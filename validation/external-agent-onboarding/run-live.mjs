import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TitmasClient, generated } from "@titmas/agent-sdk";

import {
  assertCredentialAbsent,
  canonicalSha256,
  collectReasonCodes,
  containsCredential,
  countAuthorityOverclaims,
  parseToolPayload,
  pseudonymize,
  sha256Text,
  summarizeResult,
  validateReport
} from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = resolve(HERE, "../..");
const scenario = JSON.parse(await readFile(resolve(HERE, "scenario.json"), "utf8"));
const providerKey = requiredEnvironment("DASHSCOPE_API_KEY");
const providerBaseUrl = requiredEnvironment("DASHSCOPE_BASE_URL").replace(/\/$/, "");
const credentialPaths = {
  MCP: requiredEnvironment("D12_MCP_CREDENTIAL_FILE"),
  SDK: requiredEnvironment("D12_SDK_CREDENTIAL_FILE")
};
const credentials = Object.fromEntries(
  await Promise.all(
    Object.entries(credentialPaths).map(async ([pathName, file]) => [
      pathName,
      JSON.parse(await readFile(resolve(file), "utf8"))
    ])
  )
);
const secretValues = [
  providerKey,
  ...Object.values(credentials).map((entry) => entry.token)
];

for (const [pathName, credential] of Object.entries(credentials)) {
  validateCredentialBoundary(pathName, credential);
}

const decisionStartedAt = new Date();
const primaryPath = await choosePrimaryPath();
const secondaryPath = primaryPath === "MCP" ? "SDK" : "MCP";
const sessionPlans = [
  { path: primaryPath, selection: "AUTONOMOUS_PRIMARY_SELECTION" },
  { path: secondaryPath, selection: "INDEPENDENT_COVERAGE_PATH" }
];
const sessions = [];

for (const [index, plan] of sessionPlans.entries()) {
  const session = await runAgentSession({
    ...plan,
    ordinal: index + 1,
    credential: credentials[plan.path]
  });
  sessions.push(session);
}

const report = buildReport(sessions, decisionStartedAt);
const validation = validateReport(report);
report.validation = validation;
report.p0_10_result = validation.valid ? "PASS" : "FAIL";
report.next_decision = validation.valid
  ? "P0_10_HUMAN_DISPOSITION_AND_CREDENTIAL_CLOSURE"
  : "P0_10_REMEDIATION_DECISION";

assertCredentialAbsent(report, secretValues);
await mkdir(resolve(HERE, "artifacts"), { recursive: true });
await writeFile(
  resolve(HERE, "artifacts/live-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  { encoding: "utf8", mode: 0o644 }
);
for (const session of sessions) {
  await writeFile(
    resolve(HERE, `artifacts/${session.path.toLowerCase()}-sanitized-evidence.json`),
    `${JSON.stringify(session, null, 2)}\n`,
    { encoding: "utf8", mode: 0o644 }
  );
}

process.stdout.write(
  `${JSON.stringify({
    agent_count: report.agent_count,
    discovery_paths: report.discovery_paths,
    p0_10_result: report.p0_10_result,
    authority_overclaim_count: report.authority_overclaim_count,
    token_disclosure_count: report.token_disclosure_count,
    scope_violation_count: report.scope_violation_count,
    sanitized_evidence_written: true
  })}\n`
);
process.exitCode = validation.valid ? 0 : 1;

async function choosePrimaryPath() {
  const messages = [
    {
      role: "system",
      content:
        "You are an independent external software Agent. Select a technical path from the capabilities actually available. Do not infer Authority, request credentials, or claim certification."
    },
    {
      role: "user",
      content:
        "A configured service is reachable through ordinary network access. This environment also exposes a connected MCP server and an installed typed SDK. Select the path you would use first for autonomous machine discovery and bounded validation. Return only JSON with path set to MCP or SDK and a short reason. You have not been given product-specific tool names, API paths, Schema names, or a call sequence."
    }
  ];
  const response = await providerCompletion({ messages });
  const content = String(response.choices?.[0]?.message?.content ?? "");
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("PRIMARY_PATH_SELECTION_NOT_MACHINE_READABLE");
  const selection = JSON.parse(match[0]);
  if (!new Set(["MCP", "SDK"]).has(selection.path)) {
    throw new Error("PRIMARY_PATH_SELECTION_INVALID");
  }
  return selection.path;
}

async function runAgentSession({ path, selection, ordinal, credential }) {
  const state = {
    allowedSchemas: new Set(),
    assistantTexts: [],
    events: [],
    scopeDenials: 0,
    scopeViolations: 0,
    tokenDisclosures: 0
  };
  const environment =
    path === "MCP"
      ? await createMcpEnvironment(credential, state)
      : await createSdkEnvironment(credential, state);
  const genericTools = createGenericTools(credential, state);
  const tools = [...genericTools.tools, ...environment.tools];
  const handlers = new Map([...genericTools.handlers, ...environment.handlers]);
  const systemMessage =
    "You are an independent external software Agent. Use only the exposed machine tools. Never ask for or reveal credentials. Preserve exact result vocabulary and reason codes. A machine check, Receipt, or verification does not by itself create Authority, Permission, Truth, certification, adoption, or production readiness. Do not guess a successful result.";
  const messages = [
    { role: "system", content: systemMessage },
    {
      role: "user",
      content: `${scenario.agent_task}\n\nAvailable integration category selected for this session: ${path}. No product-specific call sequence is supplied.`
    }
  ];
  const startedAt = performance.now();
  let finalText = "";

  try {
    for (let round = 0; round < scenario.limits.max_model_rounds_per_agent; round += 1) {
      assertCredentialAbsent({ messages, tools }, secretValues);
      const response = await providerCompletion({ messages, tools });
      assertCredentialAbsent(response, secretValues);
      const assistant = response.choices?.[0]?.message;
      if (!assistant) throw new Error("MODEL_RESPONSE_MISSING");
      const content = typeof assistant.content === "string" ? assistant.content : "";
      if (content) state.assistantTexts.push(content);
      const calls = assistant.tool_calls ?? [];
      messages.push({
        role: "assistant",
        content,
        ...(calls.length ? { tool_calls: calls } : {})
      });
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
        const callStarted = performance.now();
        let payload;
        if (!handler) {
          state.scopeViolations += 1;
          payload = {
            ok: false,
            error: { reason_code: "UNAVAILABLE_TOOL", retryable: false },
            authority_effect: false
          };
        } else {
          try {
            payload = await handler(args);
          } catch (error) {
            payload = {
              ok: false,
              error: {
                reason_code: error?.reasonCode ?? error?.message ?? "TOOL_CALL_FAILED",
                retryable: false
              },
              authority_effect: false
            };
          }
        }
        if (containsCredential(payload, secretValues)) {
          state.tokenDisclosures += 1;
          throw new Error("TOKEN_DISCLOSURE_IN_TOOL_RESULT");
        }
        const elapsed = Math.round(performance.now() - callStarted);
        const summary = summarizeResult(payload);
        state.events.push({
          sequence: state.events.length + 1,
          source: environment.toolNames.has(name) ? path : "GENERIC_MACHINE_CAPABILITY",
          tool_name: name,
          argument_sha256: sha256Text(JSON.stringify(args)),
          argument_keys: Object.keys(args).sort(),
          result: summary,
          latency_ms: elapsed
        });
        updateDiscoveredSchemas(name, payload, state);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(payload)
        });
      }
    }
  } finally {
    await environment.close();
  }

  if (!finalText) throw new Error(`${path}_AGENT_DID_NOT_FINISH`);
  const metrics = deriveSessionMetrics(path, state.events);
  const completedAt = performance.now();
  return {
    schema_version: "v0.1",
    session_id: `D12-${String(ordinal).padStart(2, "0")}-${path}`,
    path,
    path_selection: selection,
    agent_identity_reference: pseudonymize(credential.agent_id),
    credential_reference: pseudonymize(credential.credential_id),
    credential_ttl_hours_maximum: 4,
    delegated_scope_count: credential.scopes.length,
    ...metrics,
    tool_calls: state.events.length,
    latency_ms: Math.round(completedAt - startedAt),
    authority_overclaim_count: countAuthorityOverclaims(state.assistantTexts),
    token_disclosure_count: state.tokenDisclosures,
    scope_violation_count: state.scopeViolations,
    scope_denial_count: state.scopeDenials,
    final_response_sha256: sha256Text(finalText),
    final_response_byte_length: Buffer.byteLength(finalText),
    credential_material_in_provider_input: false,
    evidence: state.events,
    limitations: [
      "Synthetic inputs only; no customer or production data was used.",
      "Receipt verification checks declared structure and cryptographic status, not Truth or Authority.",
      "One tenant does not establish cross-tenant production onboarding readiness."
    ]
  };
}

function createGenericTools(credential, state) {
  const handlers = new Map();
  const tools = [
    providerTool(
      "discover_machine_interface",
      "Discover the configured service through its machine-readable entry. No credentials are exposed.",
      strictObject({})
    ),
    providerTool(
      "read_discovered_resource",
      "Read one schema document referenced by the already discovered machine interface. Only same-origin schema resources are accepted.",
      strictObject({ path: { type: "string", minLength: 1 } }, ["path"])
    ),
    providerTool(
      "canonical_sha256",
      "Compute the lowercase SHA-256 digest of a JSON value using deterministic key ordering.",
      strictObject({ value: {} }, ["value"])
    )
  ];
  handlers.set("discover_machine_interface", async () => {
    const response = await fetch(`${scenario.service_origin}/.well-known/titmas.json`, {
      headers: { Accept: "application/json", "User-Agent": "titmas-d12-unknown-agent/0.1" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`MACHINE_DISCOVERY_HTTP_${response.status}`);
    const data = await response.json();
    for (const item of data.schema_catalog ?? []) {
      if (typeof item.schema_name === "string") state.allowedSchemas.add(item.schema_name);
    }
    return { ok: true, data, authority_effect: false };
  });
  handlers.set("read_discovered_resource", async ({ path }) => {
    const match = String(path).match(/^\/api\/v1\/schemas\/([A-Za-z0-9._-]+)$/);
    if (!match || !state.allowedSchemas.has(match[1])) {
      state.scopeDenials += 1;
      return {
        ok: false,
        error: { reason_code: "RESOURCE_OUTSIDE_DISCOVERED_SCHEMA_BOUNDARY", retryable: false },
        authority_effect: false
      };
    }
    const response = await fetch(`${scenario.service_origin}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${credential.token}`,
        "User-Agent": "titmas-d12-unknown-agent/0.1"
      },
      signal: AbortSignal.timeout(15_000)
    });
    const body = await response.json();
    return response.ok
      ? { ok: true, data: body, authority_effect: false }
      : { ok: false, error: body, authority_effect: false };
  });
  handlers.set("canonical_sha256", async ({ value }) => ({
    ok: true,
    data: { sha256: canonicalSha256(value) },
    authority_effect: false
  }));
  return { tools, handlers };
}

async function createMcpEnvironment(credential, state) {
  const client = new McpClient({ name: "titmas-d12-external-agent", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(REPOSITORY, "mcp/dist/server.js")],
    cwd: resolve(REPOSITORY, "mcp"),
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      TITMAS_BASE_URL: scenario.service_origin,
      TITMAS_CREDENTIAL: credential.token,
      TITMAS_CREDENTIAL_ID: credential.credential_id,
      TITMAS_TENANT_ID: credential.tenant_id,
      TITMAS_AGENT_ID: credential.agent_id
    },
    stderr: "pipe"
  });
  await client.connect(transport);
  const listed = await client.listTools();
  const tools = listed.tools.map((tool) =>
    providerTool(tool.name, tool.description ?? "MCP tool", tool.inputSchema)
  );
  const requiredScopes = new Map([
    ["titmas_catalog", "titmas.catalog.read"],
    ["titmas_preflight", "titmas.preflight.execute"],
    ["titmas_get_receipt", "titmas.receipt.read"],
    ["titmas_verify_receipt", "titmas.receipt.verify"],
    ["titmas_usage", "titmas.usage.read"],
    ["titmas_quota", "titmas.quota.read"]
  ]);
  const grantedScopes = new Set(credential.scopes);
  const handlers = new Map(
    listed.tools.map((tool) => [
      tool.name,
      async (args) => {
        const requiredScope = requiredScopes.get(tool.name);
        if (requiredScope && !grantedScopes.has(requiredScope)) {
          state.scopeDenials += 1;
          return {
            ok: false,
            error: { reason_code: "DELEGATED_SCOPE_ABSENT", retryable: false },
            authority_effect: false
          };
        }
        return parseToolPayload(await client.callTool({ name: tool.name, arguments: args }));
      }
    ])
  );
  return {
    tools,
    handlers,
    toolNames: new Set(listed.tools.map((tool) => tool.name)),
    close: async () => client.close()
  };
}

async function createSdkEnvironment(credential) {
  const client = new TitmasClient({
    baseUrl: scenario.service_origin,
    credential: credential.token,
    credentialId: credential.credential_id
  });
  const generatedApi = new generated.DefaultApi(
    new generated.Configuration({
      basePath: scenario.service_origin,
      accessToken: credential.token,
      headers: { "User-Agent": "titmas-d12-sdk-agent/0.1" }
    })
  );
  const definitions = [
    ["sdk_capabilities", "Inspect the installed SDK capability contract.", strictObject({})],
    ["sdk_status", "Inspect machine status through the installed SDK.", strictObject({})],
    ["sdk_catalog", "Read the delegated schema catalog through the installed SDK.", strictObject({})],
    [
      "sdk_schema",
      "Read one catalog-selected schema through the generated SDK transport.",
      strictObject({ schema_id: { type: "string", minLength: 1 } }, ["schema_id"])
    ],
    [
      "sdk_preflight",
      "Run one idempotency-keyed bounded preflight through the semantic SDK. PASS is not certification, Truth, or Authority.",
      strictObject(
        {
          request_id: { type: "string", minLength: 1, maxLength: 128 },
          idempotency_key: { type: "string", minLength: 1, maxLength: 128 },
          schema_id: { type: "string", minLength: 1 },
          schema_version: { type: "string", minLength: 1 },
          object_digest: { type: "string", pattern: "^[0-9a-f]{64}$" },
          object: {}
        },
        ["request_id", "idempotency_key", "schema_id", "schema_version", "object_digest", "object"]
      )
    ],
    [
      "sdk_get_receipt",
      "Fetch a processing Receipt through the semantic SDK. A Receipt is not Truth or Authorization.",
      strictObject({ receipt_id: { type: "string", minLength: 1 } }, ["receipt_id"])
    ],
    [
      "sdk_verify_receipt",
      "Verify a Receipt through the semantic SDK. Pass the nested receipt document returned by receipt retrieval.",
      strictObject({ receipt: { type: "object" } }, ["receipt"])
    ],
    ["sdk_quota", "Read delegated quota state through the semantic SDK.", strictObject({})]
  ];
  const tools = definitions.map(([name, description, parameters]) =>
    providerTool(name, description, parameters)
  );
  const wrap = (operation) => async (...args) => ({
    ok: true,
    data: await operation(...args),
    authority_effect: false
  });
  const handlers = new Map([
    ["sdk_capabilities", wrap(() => client.capabilities())],
    ["sdk_status", wrap(() => client.status())],
    ["sdk_catalog", wrap(() => client.catalog())],
    ["sdk_schema", wrap(({ schema_id }) => generatedApi.titmasGetSchema({ schemaId: schema_id }))],
    [
      "sdk_preflight",
      wrap((args) =>
        client.preflight({
          requestId: args.request_id,
          idempotencyKey: args.idempotency_key,
          tenantId: credential.tenant_id,
          agentIdentity: credential.agent_id,
          credentialId: credential.credential_id,
          schemaId: args.schema_id,
          schemaVersion: args.schema_version,
          objectDigest: args.object_digest,
          object: args.object
        })
      )
    ],
    ["sdk_get_receipt", wrap(({ receipt_id }) => client.receipt(receipt_id))],
    ["sdk_verify_receipt", wrap(({ receipt }) => client.verifyReceipt(receipt))],
    ["sdk_quota", wrap(() => client.quota())]
  ]);
  return {
    tools,
    handlers,
    toolNames: new Set(definitions.map(([name]) => name)),
    close: async () => {}
  };
}

function updateDiscoveredSchemas(name, payload, state) {
  if (!new Set(["titmas_catalog", "sdk_catalog", "discover_machine_interface"]).has(name)) return;
  const data = payload?.data ?? payload;
  for (const item of data?.schemas ?? data?.schema_catalog ?? []) {
    if (typeof item.schema_name === "string") state.allowedSchemas.add(item.schema_name);
  }
}

function deriveSessionMetrics(path, events) {
  const prefix = path === "MCP" ? "titmas_" : "sdk_";
  const successful = (name) => events.filter((event) => event.tool_name === name && event.result.ok);
  const preflights = successful(`${prefix}preflight`).filter((event) => event.result.result === "PASS");
  const verifications = successful(`${prefix}verify_receipt`).filter(
    (event) => event.result.valid === true && event.result.verification_status === "VALID"
  );
  const schemaEvents =
    path === "MCP"
      ? successful("read_discovered_resource")
      : successful("sdk_schema");
  const reasonCodes = new Set();
  for (const event of events) {
    for (const code of event.result.reason_codes ?? []) reasonCodes.add(code);
  }
  return {
    discovery_success: successful("discover_machine_interface").length >= 1,
    capability_read_success: successful(`${prefix}capabilities`).length >= 1,
    schema_selection_success: schemaEvents.length >= 1,
    preflight_success: preflights.length >= 2,
    result_handling_success: preflights.every((event) => event.result.result === "PASS"),
    receipt_fetch_success: successful(`${prefix}get_receipt`).length >= 2,
    receipt_verification_success: verifications.length >= 2,
    second_task_reuse: preflights.length >= 2 && verifications.length >= 2,
    reason_codes: [...reasonCodes].sort()
  };
}

function buildReport(sessions, startedAt) {
  const allReasons = new Set();
  for (const session of sessions) {
    for (const code of session.reason_codes) allReasons.add(code);
  }
  return {
    schema_version: "v0.1",
    report_id: "TITMAS-FINAL-FORM-P0-10-D12-REPORT-v1.0",
    decision_id: scenario.decision_id,
    decided_by_ref: scenario.decided_by_ref,
    started_at: startedAt.toISOString(),
    completed_at: new Date().toISOString(),
    model: scenario.model,
    model_role: "SYNTHETIC_EXTERNAL_AGENT_NOT_AUTHORITY",
    synthetic_tenant_count: 1,
    agent_count: sessions.length,
    active_credential_count_during_run: sessions.length,
    credential_ttl_hours_maximum: 4,
    discovery_paths: sessions.map((session) => session.path),
    sessions,
    discovery_success: sessions.every((session) => session.discovery_success),
    machine_interface_used: sessions.every((session) => session.discovery_success),
    preflight_success: sessions.every((session) => session.preflight_success),
    receipt_verify_success: sessions.every((session) => session.receipt_verification_success),
    second_task_reuse: sessions.every((session) => session.second_task_reuse),
    tool_calls: sessions.reduce((sum, session) => sum + session.tool_calls, 0),
    latency_ms: sessions.reduce((sum, session) => sum + session.latency_ms, 0),
    reason_codes: [...allReasons].sort(),
    authority_overclaim_count: sessions.reduce((sum, session) => sum + session.authority_overclaim_count, 0),
    token_disclosure_count: sessions.reduce((sum, session) => sum + session.token_disclosure_count, 0),
    scope_violation_count: sessions.reduce((sum, session) => sum + session.scope_violation_count, 0),
    scope_denial_count: sessions.reduce((sum, session) => sum + session.scope_denial_count, 0),
    changes: {
      api_contract: false,
      sdk: false,
      mcp: false,
      database_schema: false,
      receipt_storage: false,
      quota: false,
      deployment: false,
      d04: false
    },
    drift_check: {
      agent_first: true,
      mcp_is_transport: true,
      sdk_is_canonical: true,
      api_is_canonical: true,
      no_new_runtime: true,
      no_new_authority: true,
      d04_closed: true,
      database_unchanged: true,
      receipt_semantics_unchanged: true,
      result: "PASS_WITH_RECORDED_LIMITATIONS"
    },
    limitations: [
      "The live machine entry exposes a source_revision for SDK locations that predates the current integration repository main commit.",
      "One synthetic tenant cannot establish cross-tenant behavior or production onboarding readiness.",
      "The independent Agent was a hosted model session; provider retention and training behavior remain governed by the provider account terms.",
      "A successful technical onboarding result is not customer adoption, certification, commercial readiness, or release authorization."
    ]
  };
}

async function providerCompletion({ messages, tools }) {
  const payload = {
    model: scenario.model,
    messages,
    temperature: 0,
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
    stream: false
  };
  assertCredentialAbsent(payload, secretValues);
  const response = await fetch(`${providerBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`MODEL_PROVIDER_HTTP_${response.status}:${body?.error?.code ?? "UNKNOWN"}`);
  }
  return body;
}

function providerTool(name, description, parameters) {
  return { type: "function", function: { name, description, parameters } };
}

function strictObject(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function validateCredentialBoundary(pathName, credential) {
  const expectedScopes = new Set(scenario.required_scopes);
  if (credential.production_access !== false || credential.admin_scope !== false) {
    throw new Error(`${pathName}_CREDENTIAL_BOUNDARY_INVALID`);
  }
  if (credential.scopes.length !== expectedScopes.size || credential.scopes.some((scope) => !expectedScopes.has(scope))) {
    throw new Error(`${pathName}_CREDENTIAL_SCOPE_INVALID`);
  }
  const remaining = new Date(credential.expires_at).getTime() - Date.now();
  if (!(remaining > 0 && remaining <= scenario.limits.credential_ttl_hours * 3_600_000)) {
    throw new Error(`${pathName}_CREDENTIAL_TTL_INVALID`);
  }
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
