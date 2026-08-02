import { createHash } from "node:crypto";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";


const SECRET_PATTERN = /titmas_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}/;
const UUID_VALUE_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const AUTHORIZATION_PATTERN = /authorization\s*[:=]\s*bearer/i;
const PUBLIC_ERROR_CODES = new Set([
  "INVALID_REQUEST",
  "AUTH_FAILED",
  "SCOPE_DENIED",
  "RESOURCE_NOT_FOUND",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE"
]);

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function digestReference(value) {
  return `sha256:${sha256Text(stableStringify(value))}`;
}

export function boundedHash(value) {
  return `sha256:${sha256Text(String(value)).slice(0, 16)}`;
}

export function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isInteger(value)) return "integer";
  return typeof value;
}

export function containsCredential(value, credentials = []) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return SECRET_PATTERN.test(text) || credentials.some((secret) => secret && text.includes(secret));
}

export function assertCredentialsAbsent(value, credentials = []) {
  if (containsCredential(value, credentials)) throw new Error("CREDENTIAL_DISCLOSURE_BLOCKED");
}

export function compileSchema(document, schemaName = null) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  const schema = schemaName
    ? {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        components: document.components,
        $ref: `#/components/schemas/${schemaName}`
      }
    : document;
  return ajv.compile(schema);
}

export function validateAndDiagnose(value, schemaDocument, schemaName = null) {
  const validate = compileSchema(schemaDocument, schemaName);
  const valid = validate(value);
  return {
    valid,
    issue_count: validate.errors?.length ?? 0,
    issues: sanitizeValidationIssues(validate.errors ?? [], value, schemaDocument, schemaName)
  };
}

export function sanitizeValidationIssues(errors, rawValue, schemaDocument, schemaName = null) {
  return errors.map((error) => {
    const basePath = error.instancePath || "";
    const rawAtPath = lookupJsonPointer(rawValue, basePath);
    const issue = {
      json_pointer: basePath || "/",
      schema_keyword: error.keyword,
      observed_json_type: jsonType(rawAtPath),
      expected_json_types: expectedTypes(error)
    };
    if (error.keyword === "required") {
      const missing = error.params?.missingProperty;
      issue.required_property_missing = true;
      issue.json_pointer = `${basePath}/${escapePointer(missing)}` || "/";
      issue.expected_json_types = schemaTypesAtPath(
        schemaDocument,
        issue.json_pointer,
        schemaName
      );
    }
    if (error.keyword === "additionalProperties") {
      const unknown = error.params?.additionalProperty;
      issue.additional_property = true;
      issue.unknown_property_name_hash = boundedHash(unknown);
      issue.json_pointer = `${basePath}/<unknown:${sha256Text(unknown).slice(0, 16)}>`;
    }
    if (error.keyword === "enum" || error.keyword === "const") issue.enum_mismatch = true;
    if (error.keyword === "format") issue.format_mismatch = true;
    if (Array.isArray(rawAtPath)) issue.array_length_capped = Math.min(rawAtPath.length, 1000);
    return issue;
  });
}

export function structuralSkeleton(value, schemaDocument, schemaName) {
  const rootSchema = resolveSchema(
    schemaName ? schemaDocument.components?.schemas?.[schemaName] : schemaDocument,
    schemaDocument
  );
  const observed = {};
  const publicPaths = [];
  const unexpected = [];
  const missing = [];
  walkStructure(value, rootSchema, schemaDocument, "", observed, publicPaths, unexpected, missing);
  const topLevel = value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).sort().map((key) =>
        rootSchema?.properties?.[key] ? key : `<unknown:${sha256Text(key).slice(0, 16)}>`
      )
    : [];
  return {
    top_level_keys: topLevel,
    public_contract_paths: [...new Set(publicPaths)].sort(),
    observed_json_types: Object.fromEntries(Object.entries(observed).sort()),
    missing_required_paths: [...new Set(missing)].sort(),
    unexpected_paths: [...new Set(unexpected)].sort()
  };
}

function walkStructure(value, schema, document, path, observed, publicPaths, unexpected, missing) {
  const resolved = resolveSchema(schema, document) ?? {};
  const publicPath = path || "/";
  observed[publicPath] = jsonType(value);
  if (path) publicPaths.push(path);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const properties = resolved.properties ?? {};
    for (const required of resolved.required ?? []) {
      if (!(required in value)) missing.push(`${path}/${escapePointer(required)}`);
    }
    for (const [key, nested] of Object.entries(value)) {
      if (!(key in properties)) {
        unexpected.push(`${path}/<unknown:${sha256Text(key).slice(0, 16)}>`);
        continue;
      }
      walkStructure(
        nested,
        properties[key],
        document,
        `${path}/${escapePointer(key)}`,
        observed,
        publicPaths,
        unexpected,
        missing
      );
    }
  } else if (Array.isArray(value)) {
    observed[`${publicPath}/@length`] = `integer_capped_${Math.min(value.length, 1000)}`;
    const itemSchema = resolved.items ?? {};
    for (let index = 0; index < Math.min(value.length, 20); index += 1) {
      walkStructure(
        value[index],
        itemSchema,
        document,
        `${path}/${index}`,
        observed,
        publicPaths,
        unexpected,
        missing
      );
    }
  }
}

export function receiptSignals(value) {
  const receipt = value?.receipt ?? value?.data?.receipt ?? null;
  const metadata = receipt?.signature_metadata ?? receipt?.signatureMetadata ?? null;
  return {
    signature_present: Boolean(
      metadata &&
      typeof metadata === "object" &&
      ("signature" in metadata || "signature_value" in metadata || "value" in metadata)
    ),
    signature_algorithm_present: Boolean(
      metadata &&
      typeof metadata === "object" &&
      ("algorithm" in metadata || "signature_algorithm" in metadata)
    ),
    verification_status_present: Boolean(
      value &&
      typeof value === "object" &&
      ("verification_status" in value || "verificationStatus" in value ||
        "verification_status" in (value.data ?? {}) || "verificationStatus" in (value.data ?? {}))
    )
  };
}

export function publicErrorObservation({ httpStatus = null, body = null, error = null } = {}) {
  const code = body?.error_code ?? body?.error?.error_code ?? null;
  return {
    http_status: Number.isInteger(httpStatus) ? httpStatus : null,
    public_error_code: PUBLIC_ERROR_CODES.has(code) ? code : null,
    sdk_error_class: allowlistedErrorClass(error?.name),
    mcp_error_class: allowlistedErrorClass(body?.error?.error_type)
  };
}

function allowlistedErrorClass(name) {
  return new Set([
    "TitmasContractError",
    "TitmasAuthenticationError",
    "TitmasSdkError",
    "ResponseError",
    "FetchError",
    "TypeError"
  ]).has(name) ? name : null;
}

export function compareReceiptReferences(preflight, receiptResponse, verifyWireRequest) {
  const preflightId = preflight?.receipt_id ?? preflight?.receiptId ?? preflight?.data?.receipt_id ?? null;
  const responseId = receiptResponse?.receipt_id ?? receiptResponse?.receiptId ?? null;
  const fetchedReceipt = receiptResponse?.receipt ?? null;
  const verifyReceipt = verifyWireRequest?.receipt ?? null;
  return {
    receipt_id_reference_match: Boolean(preflightId && responseId && preflightId === responseId),
    receipt_digest_reference_match: Boolean(
      fetchedReceipt && verifyReceipt && stableStringify(fetchedReceipt) === stableStringify(verifyReceipt)
    )
  };
}

export function feedbackAssessment(response) {
  const issues = response?.issues ?? response?.validation_issues ?? [];
  const hasLocations = Array.isArray(issues) && issues.some((item) =>
    Array.isArray(item?.loc) || typeof item?.json_pointer === "string"
  );
  const hasExpected = Array.isArray(issues) && issues.some((item) =>
    item?.expected_type !== undefined || item?.expected_json_types !== undefined
  );
  const hasMissing = Array.isArray(issues) && issues.some((item) =>
    item?.required_property_missing === true || item?.type === "missing"
  );
  const hasRepair = Boolean(response?.repair_action || response?.machine_repair_action);
  return {
    field_localization_available: hasLocations,
    expected_type_available: hasExpected,
    missing_required_field_available: hasMissing,
    machine_readable_repair_action_available: hasRepair
  };
}

export function scanDisclosure(value, credentials = []) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return {
    raw_object_findings: /"(?:raw_object|object|raw_value)"\s*:/.test(text) ? 1 : 0,
    raw_receipt_findings: /"(?:raw_receipt|receipt|signature_value|digest_value)"\s*:/.test(text) ? 1 : 0,
    token_findings: containsCredential(text, credentials) ? 1 : 0,
    authorization_header_findings: AUTHORIZATION_PATTERN.test(text) ? 1 : 0,
    identity_disclosure_findings: UUID_VALUE_PATTERN.test(text) ? 1 : 0
  };
}

export function assertAllowlistedArtifact(value, credentials = []) {
  const findings = scanDisclosure(value, credentials);
  if (Object.values(findings).some((count) => count !== 0)) {
    throw new Error(`D15_DISCLOSURE_FINDING:${JSON.stringify(findings)}`);
  }
  walkKeys(value, (key) => {
    if (new Set([
      "tenant_id",
      "agent_id",
      "credential_id",
      "authorization",
      "raw_object",
      "raw_receipt",
      "signature_value",
      "digest_value",
      "string_value",
      "number_value",
      "boolean_value",
      "raw_array_item",
      "raw_nested_object"
    ]).has(key)) {
      throw new Error(`D15_FORBIDDEN_ARTIFACT_KEY:${key}`);
    }
  });
  return findings;
}

function walkKeys(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, visitor);
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      visitor(key);
      walkKeys(nested, visitor);
    }
  }
}

function expectedTypes(error) {
  if (error.keyword === "type") return Array.isArray(error.params?.type)
    ? error.params.type
    : [error.params?.type].filter(Boolean);
  if (error.keyword === "format") return ["string"];
  if (error.keyword === "required") return [];
  return [];
}

function schemaTypesAtPath(document, pointer, schemaName) {
  let schema = schemaName ? document.components?.schemas?.[schemaName] : document;
  for (const token of pointer.split("/").slice(1).map(unescapePointer)) {
    schema = resolveSchema(schema, document);
    if (!schema) return [];
    if (schema.properties?.[token]) schema = schema.properties[token];
    else if (schema.items && /^\d+$/.test(token)) schema = schema.items;
    else return [];
  }
  schema = resolveSchema(schema, document);
  if (!schema) return [];
  const type = schema.type;
  return Array.isArray(type) ? type : type ? [type] : [];
}

function resolveSchema(schema, document) {
  if (!schema?.$ref) return schema;
  if (!schema.$ref.startsWith("#/")) return schema;
  return lookupJsonPointer(document, schema.$ref.slice(1));
}

function lookupJsonPointer(value, pointer) {
  if (!pointer || pointer === "/") return value;
  let current = value;
  for (const token of pointer.split("/").slice(1).map(unescapePointer)) {
    if (current === null || current === undefined) return undefined;
    current = current[token];
  }
  return current;
}

function escapePointer(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function unescapePointer(value) {
  return String(value).replaceAll("~1", "/").replaceAll("~0", "~");
}
