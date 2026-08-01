#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contract="$repo_root/openapi/titmas-api-v1.yaml"
lock="$repo_root/sdk-generation.lock.json"
expected_contract_sha="$(jq -r '.source.sha256' "$lock")"
generator_version="$(jq -r '.generator.version' "$lock")"
generator_url="$(jq -r '.generator.jar_url' "$lock")"
generator_sha="$(jq -r '.generator.jar_sha256' "$lock")"
java_bin="${JAVA_BIN:-java}"
cache_dir="${TITMAS_SDK_TOOL_CACHE:-$repo_root/.cache/sdk-generation}"
generator_jar="${OPENAPI_GENERATOR_JAR:-$cache_dir/openapi-generator-cli-$generator_version.jar}"

actual_contract_sha="$(shasum -a 256 "$contract" | awk '{print $1}')"
if [[ "$actual_contract_sha" != "$expected_contract_sha" ]]; then
  printf 'frozen contract hash mismatch: expected %s, got %s\n' \
    "$expected_contract_sha" "$actual_contract_sha" >&2
  exit 2
fi

if [[ ! -f "$generator_jar" ]]; then
  mkdir -p "$cache_dir"
  curl --fail --location --silent --show-error "$generator_url" -o "$generator_jar"
fi

actual_generator_sha="$(shasum -a 256 "$generator_jar" | awk '{print $1}')"
if [[ "$actual_generator_sha" != "$generator_sha" ]]; then
  printf 'generator hash mismatch: expected %s, got %s\n' \
    "$generator_sha" "$actual_generator_sha" >&2
  exit 3
fi

actual_generator_version="$($java_bin -jar "$generator_jar" version)"
if [[ "$actual_generator_version" != "$generator_version" ]]; then
  printf 'generator version mismatch: expected %s, got %s\n' \
    "$generator_version" "$actual_generator_version" >&2
  exit 4
fi

generation_root="$(mktemp -d "${TMPDIR:-/tmp}/titmas-sdk-generation.XXXXXX")"
trap 'rm -rf "$generation_root"' EXIT

common_global='apis,models,supportingFiles,apiTests=false,modelTests=false,apiDocs=false,modelDocs=false'

"$java_bin" -jar "$generator_jar" generate \
  -i "$contract" \
  -g python \
  -o "$generation_root/python" \
  --additional-properties='packageName=titmas_api_client,projectName=titmas-python-sdk,packageVersion=0.1.0,library=httpx,supportHttpxSync=true,generateSourceCodeOnly=true,hideGenerationTimestamp=true' \
  --global-property="$common_global"

"$java_bin" -jar "$generator_jar" generate \
  -i "$contract" \
  -g typescript-fetch \
  -o "$generation_root/typescript" \
  --additional-properties='npmName=@titmas/generated-api-client,npmVersion=0.1.0,supportsES6=true,typescriptThreePlus=true,withInterfaces=true,useSingleRequestParameter=true,importFileExtension=.js,hideGenerationTimestamp=true' \
  --global-property="$common_global"

# OpenAPI Generator 7.24.0 renders OAS 3.1 boolean `const: false` values as
# string enums in the Python Pydantic validators. Apply one exact, fail-closed
# compatibility correction to generated output; the frozen source contract is
# never changed. Remove this block after the pinned generator fixes the issue.
python3 - "$generation_root/python/titmas_api_client/models/authority_boundaries.py" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
broken = "if value not in set(['false']):"
fixed = "if value is not False:"
expected_count = 6
actual_count = source.count(broken)
if actual_count != expected_count:
    raise SystemExit(
        f"const-false compatibility patch expected {expected_count} occurrences, "
        f"found {actual_count}"
    )
path.write_text(source.replace(broken, fixed))
PY

# Normalize generator template whitespace deterministically. This affects only
# generated text formatting and keeps every file at exactly one final newline.
python3 - "$generation_root/python" "$generation_root/typescript" <<'PY'
from pathlib import Path
import sys

changed = 0
for root_arg in sys.argv[1:]:
    root = Path(root_arg)
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in {".md", ".py", ".ts"}:
            continue
        source = path.read_text()
        normalized = "\n".join(
            line.rstrip() for line in source.rstrip().splitlines()
        ) + "\n"
        if normalized != source:
            path.write_text(normalized)
            changed += 1
if changed == 0:
    raise SystemExit("generated whitespace normalization changed no files")
PY

mkdir -p "$repo_root/titmas-python-sdk/generated" "$repo_root/titmas-typescript-sdk/generated"
rsync -a --delete "$generation_root/python/" "$repo_root/titmas-python-sdk/generated/"
rsync -a --delete "$generation_root/typescript/" "$repo_root/titmas-typescript-sdk/generated/"

jq -n \
  --arg source "openapi/titmas-api-v1.yaml" \
  --arg source_sha256 "$expected_contract_sha" \
  --arg generator_version "$generator_version" \
  '{GENERATED:true,SOURCE:$source,SOURCE_SHA256:$source_sha256,GENERATOR:"OpenAPI Generator",GENERATOR_VERSION:$generator_version,POSTPROCESS_PATCHES:["OPENAPI_GENERATOR_7_24_0_PYTHON_CONST_FALSE","NORMALIZE_GENERATED_TEXT_WHITESPACE"]}' \
  > "$repo_root/titmas-python-sdk/generated/GENERATION_METADATA.json"
cp "$repo_root/titmas-python-sdk/generated/GENERATION_METADATA.json" \
  "$repo_root/titmas-typescript-sdk/generated/GENERATION_METADATA.json"

printf 'Generated Python and TypeScript SDK transports from %s with OpenAPI Generator %s.\n' \
  "$expected_contract_sha" "$generator_version"
