# OpenAPI client boundary

Canonical contract:

```text
https://redcrag.cn/api/v1/openapi.json
```

The Python and TypeScript SDKs in this repository are typed clients for that
contract. The live contract remains the machine-readable source; a copied
snapshot must not silently become a second API truth source.

Before a release candidate, compare the live OpenAPI SHA-256 with the reviewed
contract digest, run both SDK suites, and record the exact service/source
revision. A changed digest requires review; it does not automatically authorize
package publication.
