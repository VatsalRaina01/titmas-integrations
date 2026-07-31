#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const requiredPaths = [
  "/api/v1/capabilities",
  "/api/v1/catalog",
  "/api/v1/health",
  "/api/v1/plans",
  "/api/v1/preflight",
  "/api/v1/quota",
  "/api/v1/readiness",
  "/api/v1/receipt-keys",
  "/api/v1/receipts/verify",
  "/api/v1/receipts/{receipt_id}",
  "/api/v1/schemas/{schema_name}",
  "/api/v1/service-health",
  "/api/v1/service-metrics-summary",
  "/api/v1/status",
  "/api/v1/usage"
];

export function verifySnapshot(snapshotBytes, manifest) {
  const digest = createHash("sha256").update(snapshotBytes).digest("hex");
  if (digest !== manifest.snapshot_sha256) {
    throw new Error("OPENAPI_SNAPSHOT_DIGEST_MISMATCH");
  }
  if (snapshotBytes.byteLength !== manifest.snapshot_bytes) {
    throw new Error("OPENAPI_SNAPSHOT_BYTE_COUNT_MISMATCH");
  }

  const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
  if (snapshot.openapi !== manifest.openapi_version) {
    throw new Error("OPENAPI_VERSION_MISMATCH");
  }
  if (snapshot.info?.version !== manifest.service_reported_version) {
    throw new Error("SERVICE_REPORTED_VERSION_MISMATCH");
  }
  if (
    manifest.reported_version_equals_retained_release !== false ||
    manifest.service_reported_version === manifest.retained_live_release_revision ||
    manifest.mismatch_status !== "KNOWN_RUNTIME_METADATA_DRIFT"
  ) {
    throw new Error("SERVICE_RELEASE_IDENTITY_CONFLATION");
  }
  if (
    manifest.canonical_contract_source !== "LIVE_URL" ||
    manifest.snapshot_role !== "REVIEWED_OBSERVATION_NOT_SECOND_TRUTH_SOURCE"
  ) {
    throw new Error("OPENAPI_SNAPSHOT_AUTHORITY_ELEVATION");
  }
  if (manifest.package_publication_authorized !== false || manifest.production_support !== false) {
    throw new Error("OPENAPI_SNAPSHOT_RELEASE_ELEVATION");
  }

  const actualPaths = Object.keys(snapshot.paths ?? {}).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(requiredPaths)) {
    throw new Error("OPENAPI_PATH_SET_DRIFT");
  }
}

async function main() {
  const snapshotBytes = await readFile(
    new URL("../openapi/titmas-commercial-api-v1.observed.json", import.meta.url)
  );
  const manifest = JSON.parse(
    await readFile(new URL("../openapi/source-manifest.json", import.meta.url), "utf8")
  );
  verifySnapshot(snapshotBytes, manifest);
  process.stdout.write("OPENAPI_OBSERVED_SNAPSHOT_VALIDATION=PASS\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
