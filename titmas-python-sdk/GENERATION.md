# Generation contract

```text
GENERATED=true
SOURCE=openapi/titmas-api-v1.yaml
SOURCE_SHA256=4a56b4b4e1c841f8349ac9e79df82fd610467e7c1c1406e428cd251d5932eaf0
GENERATOR_VERSION=7.24.0
```

Run `../scripts/generate-sdks.sh` from the repository root. Generated files are
mechanical output and must not be edited by hand.

The script applies the locked compatibility patch
`OPENAPI_GENERATOR_7_24_0_PYTHON_CONST_FALSE`. It corrects six invalid Python
validators emitted for OAS 3.1 `const: false`, fails closed if the generated
shape changes, and never changes the frozen contract.
It also deterministically removes generator-template trailing whitespace and
normalizes final newlines in generated text files.

The SDK validator also checks that the frozen contract and exported negative
fixture manifest contain the same fixture identifiers and preserve fail-closed,
non-authoritative semantics.
