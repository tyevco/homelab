import * as grpc from "@grpc/grpc-js";

const structProto = require("google-protobuf/google/protobuf/struct_pb");

export function structToObject(struct: any): Record<string, any> {
  if (!struct) return {};
  return unwrapSecrets(struct.toJavaScript());
}

// Recursively strip undefined values from nested objects/arrays so that
// Struct.fromJavaScript never encounters an undefined (which throws
// "Unexpected struct type").
function deepClean(val: any): any {
  if (val === undefined) return null;
  if (Array.isArray(val)) return val.map(deepClean);
  if (val !== null && typeof val === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        out[k] = deepClean(v);
      }
    }
    return out;
  }
  return val;
}

export function objectToStruct(obj: Record<string, any>): any {
  return structProto.Struct.fromJavaScript(deepClean(obj));
}

const SECRET_SIG = "4dabf18193072939515e22adb298388d";

/**
 * Unwrap a Pulumi secret value. Secrets are encoded as objects with a
 * special signature key. Returns the plain value if wrapped, or the
 * original value otherwise.
 */
export function unwrapSecret(val: any): any {
  if (val && typeof val === "object" && val[SECRET_SIG] !== undefined) {
    return val["value"];
  }
  return val;
}

/**
 * Recursively unwrap a single value, handling arrays and nested objects.
 */
function unwrapDeep(val: any): any {
  const unwrapped = unwrapSecret(val);
  if (Array.isArray(unwrapped)) {
    return unwrapped.map(unwrapDeep);
  }
  if (unwrapped && typeof unwrapped === "object") {
    return unwrapSecrets(unwrapped);
  }
  return unwrapped;
}

/**
 * Recursively unwrap all secret values in an object.
 */
export function unwrapSecrets(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = unwrapDeep(val);
  }
  return result;
}

/**
 * Compare two values for diff purposes. Treats undefined and "" as equivalent
 * to prevent spurious diffs when optional fields come back as empty strings
 * from the API but were undefined in state.
 */
export function valuesEqual(a: any, b: any): boolean {
  const normA = a === "" ? undefined : a;
  const normB = b === "" ? undefined : b;
  return normA === normB;
}

export function makeCheckFailure(property: string, reason: string): any {
  const providerProto = require("@pulumi/pulumi/proto/provider_pb");
  const failure = new providerProto.CheckFailure();
  failure.setProperty(property);
  failure.setReason(reason);
  return failure;
}

export type GrpcCallback<T> = grpc.sendUnaryData<T>;
export type GrpcCall<Req, Res> = grpc.ServerUnaryCall<Req, Res>;

/**
 * Extract the resource type token from a gRPC request URN.
 * URN format: urn:pulumi:stack::project::type::name
 * Since Pulumi SDK v3.132.0, getType() is available directly.
 */
export function getResourceType(call: any): string {
  // Try getType() first (available since SDK v3.132.0)
  if (typeof call.request.getType === "function") {
    const type = call.request.getType();
    if (type) return type;
  }
  // Fallback: parse from URN
  const urn = call.request.getUrn?.();
  if (urn) {
    // urn:pulumi:stack::project::provider:module:Type::name
    const parts = urn.split("::");
    if (parts.length >= 3) {
      return parts[2];
    }
  }
  return "";
}
