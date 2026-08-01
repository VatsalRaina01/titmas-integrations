import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("mcp/package.json", "utf8"));
const toolContract = JSON.parse(readFileSync("mcp/tool-contract.json", "utf8"));
const adapterSource = readFileSync("mcp/src/adapter.ts", "utf8");
const serverSource = readFileSync("mcp/src/server.ts", "utf8");
const source = `${adapterSource}\n${serverSource}`;

const exactTools = [
  "titmas_capabilities",
  "titmas_status",
  "titmas_catalog",
  "titmas_preflight",
  "titmas_get_receipt",
  "titmas_verify_receipt",
  "titmas_usage",
  "titmas_quota"
];

assert.equal(
  packageJson.dependencies["@modelcontextprotocol/sdk"],
  "1.30.0"
);
assert.equal(
  packageJson.dependencies["@titmas/agent-sdk"],
  "file:../titmas-typescript-sdk"
);
assert.equal(packageJson.private, true);
assert.deepEqual(
  toolContract.tools.map((tool) => tool.name),
  exactTools
);
assert.equal(toolContract.titmas_sdk.only_api_transport, true);
assert.equal(toolContract.transport.direct_gateway_call, false);
assert.equal(toolContract.transport.automatic_retry, false);
assert.equal(toolContract.authority_boundaries.authorization_effect, false);
assert.equal(toolContract.authority_boundaries.truth_verified, false);

for (const name of exactTools) {
  assert.match(adapterSource, new RegExp(`registerTool\\(\\s*"${name}"`));
}

const forbiddenTransportPatterns = [
  /\bfetch\s*\(/,
  /\baxios\b/,
  /node:https?/,
  /https?\.request\s*\(/,
  /\bundici\b/,
  /\/api\/v1\//
];
for (const pattern of forbiddenTransportPatterns) {
  assert.doesNotMatch(source, pattern);
}

assert.match(serverSource, /new TitmasClient\(/);
assert.match(adapterSource, /schemaVersion: input\.schema_version/);
assert.match(adapterSource, /objectDigest: input\.object_digest/);
assert.match(adapterSource, /credentialId: context\.credentialId/);
assert.doesNotMatch(adapterSource, /credential_id:\s*z\./);
assert.doesNotMatch(adapterSource, /tenant_id:\s*z\./);
assert.doesNotMatch(adapterSource, /agent_id:\s*z\./);

console.log("MCP_ADAPTER_CONTRACT_PASS=true");
console.log("OFFICIAL_MCP_SDK_PINNED=true");
console.log("TITMAS_SDK_REUSED=true");
console.log("DIRECT_GATEWAY_CLIENT=false");
console.log("AUTOMATIC_RETRY=false");
