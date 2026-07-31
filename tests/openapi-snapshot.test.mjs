import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifySnapshot } from "../scripts/verify-openapi-snapshot.mjs";

const snapshotBytes = await readFile(
  new URL("../openapi/titmas-commercial-api-v1.observed.json", import.meta.url)
);
const manifest = JSON.parse(
  await readFile(new URL("../openapi/source-manifest.json", import.meta.url), "utf8")
);

test("reviewed OpenAPI observation is digest and release-boundary safe", () => {
  assert.doesNotThrow(() => verifySnapshot(snapshotBytes, manifest));
});

test("snapshot byte drift fails closed", () => {
  const changed = Buffer.concat([snapshotBytes, Buffer.from("\n")]);
  assert.throws(() => verifySnapshot(changed, manifest), /DIGEST_MISMATCH/);
});

test("reported service version cannot be conflated with retained release", () => {
  assert.throws(
    () =>
      verifySnapshot(snapshotBytes, {
        ...manifest,
        retained_live_release_revision: manifest.service_reported_version,
        reported_version_equals_retained_release: true
      }),
    /SERVICE_RELEASE_IDENTITY_CONFLATION/
  );
});
