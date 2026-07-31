# OpenAPI client boundary

Live contract:

```text
https://redcrag.cn/api/v1/openapi.json
```

The Python and TypeScript SDKs in this repository are typed clients for that
contract. [`titmas-commercial-api-v1.observed.json`](titmas-commercial-api-v1.observed.json)
is a reviewed observation for reproducible testing. It is not a second live API
truth source.

The adjacent source manifest binds:

- snapshot SHA-256;
- observation time and URL;
- OpenAPI version;
- service-reported version;
- retained live release identity;
- their known mismatch.

The service-reported version is runtime metadata, not proof of the retained
release identity. Before a release candidate, compare the live contract with
the reviewed snapshot, run both SDK suites, and review every difference. A
changed digest requires review; it does not automatically authorize package
publication.
