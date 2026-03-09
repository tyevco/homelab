import {
  unwrapSecret,
  unwrapSecrets,
  structToObject,
  objectToStruct,
  makeCheckFailure,
  getResourceType,
  valuesEqual,
} from "../src/helpers";

const structProto = require("google-protobuf/google/protobuf/struct_pb");

const SECRET_SIG = "4dabf18193072939515e22adb298388d";

describe("unwrapSecret", () => {
  it("returns plain string as-is", () => {
    expect(unwrapSecret("hello")).toBe("hello");
  });

  it("returns plain number as-is", () => {
    expect(unwrapSecret(42)).toBe(42);
  });

  it("returns boolean as-is", () => {
    expect(unwrapSecret(true)).toBe(true);
  });

  it("returns null as-is", () => {
    expect(unwrapSecret(null)).toBeNull();
  });

  it("returns undefined as-is", () => {
    expect(unwrapSecret(undefined)).toBeUndefined();
  });

  it("unwraps a secret-wrapped value", () => {
    const wrapped = { [SECRET_SIG]: "1b47061264138c4ac30d75fd1eb44270", value: "my-secret" };
    expect(unwrapSecret(wrapped)).toBe("my-secret");
  });

  it("unwraps secret with falsy value", () => {
    const wrapped = { [SECRET_SIG]: "1b47061264138c4ac30d75fd1eb44270", value: "" };
    expect(unwrapSecret(wrapped)).toBe("");
  });
});

describe("unwrapSecrets", () => {
  it("recursively unwraps nested secrets", () => {
    const input = {
      plain: "hello",
      nested: {
        secret: { [SECRET_SIG]: "1b47061264138c4ac30d75fd1eb44270", value: "hidden" },
        deep: {
          another: { [SECRET_SIG]: "1b47061264138c4ac30d75fd1eb44270", value: 99 },
        },
      },
    };
    const result = unwrapSecrets(input);
    expect(result).toEqual({
      plain: "hello",
      nested: {
        secret: "hidden",
        deep: {
          another: 99,
        },
      },
    });
  });

  it("passes plain arrays through unchanged", () => {
    const input = { items: [1, 2, 3] };
    const result = unwrapSecrets(input);
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it("unwraps secrets inside arrays", () => {
    const input = {
      values: [
        "plain",
        { [SECRET_SIG]: "x", value: "secret-in-array" },
        42,
      ],
    };
    const result = unwrapSecrets(input);
    expect(result).toEqual({ values: ["plain", "secret-in-array", 42] });
  });

  it("unwraps secrets inside nested arrays of objects", () => {
    const input = {
      items: [
        { name: "a", key: { [SECRET_SIG]: "x", value: "key-a" } },
        { name: "b", key: { [SECRET_SIG]: "x", value: "key-b" } },
      ],
    };
    const result = unwrapSecrets(input);
    expect(result).toEqual({
      items: [
        { name: "a", key: "key-a" },
        { name: "b", key: "key-b" },
      ],
    });
  });

  it("handles deeply nested arrays with secrets", () => {
    const input = {
      outer: {
        middle: [
          [{ [SECRET_SIG]: "x", value: "deep" }],
        ],
      },
    };
    const result = unwrapSecrets(input);
    expect(result).toEqual({ outer: { middle: [["deep"]] } });
  });

  it("handles mixed plain and secret values", () => {
    const input = {
      name: "test",
      apiKey: { [SECRET_SIG]: "x", value: "key-123" },
      count: 5,
    };
    const result = unwrapSecrets(input);
    expect(result).toEqual({ name: "test", apiKey: "key-123", count: 5 });
  });

  it("handles empty object", () => {
    expect(unwrapSecrets({})).toEqual({});
  });
});

describe("structToObject", () => {
  it("round-trips through real protobuf Struct", () => {
    const original = { name: "test", count: 42, enabled: true };
    const struct = structProto.Struct.fromJavaScript(original);
    const result = structToObject(struct);
    expect(result).toEqual(original);
  });

  it("returns empty object for null input", () => {
    expect(structToObject(null)).toEqual({});
  });

  it("returns empty object for undefined input", () => {
    expect(structToObject(undefined)).toEqual({});
  });

  it("unwraps embedded secrets during conversion", () => {
    // Struct.fromJavaScript can handle nested objects
    const original = {
      plain: "value",
      secret: { [SECRET_SIG]: "x", value: "hidden" },
    };
    const struct = structProto.Struct.fromJavaScript(original);
    const result = structToObject(struct);
    expect(result.plain).toBe("value");
    expect(result.secret).toBe("hidden");
  });
});

describe("objectToStruct", () => {
  it("round-trips through real protobuf Struct", () => {
    const original = { action: "pass", interface: "lan", quick: true };
    const struct = objectToStruct(original);
    const roundTripped = struct.toJavaScript();
    expect(roundTripped).toEqual(original);
  });

  it("filters out undefined values", () => {
    const input = { name: "test", missing: undefined, present: "yes" };
    const struct = objectToStruct(input);
    const result = struct.toJavaScript();
    expect(result).toEqual({ name: "test", present: "yes" });
    expect("missing" in result).toBe(false);
  });

  it("recursively filters undefined values in nested objects", () => {
    const input = { outer: { present: "yes", missing: undefined } };
    const struct = objectToStruct(input);
    const result = struct.toJavaScript();
    expect(result).toEqual({ outer: { present: "yes" } });
  });

  it("recursively filters undefined values in nested arrays", () => {
    const input = { items: [{ name: "a", missing: undefined }, { name: "b" }] };
    const struct = objectToStruct(input);
    const result = struct.toJavaScript();
    expect(result).toEqual({ items: [{ name: "a" }, { name: "b" }] });
  });

  it("handles deeply nested undefined without throwing", () => {
    const input = { a: { b: { c: { val: "ok", bad: undefined } } } };
    expect(() => objectToStruct(input)).not.toThrow();
    const result = objectToStruct(input).toJavaScript();
    expect(result).toEqual({ a: { b: { c: { val: "ok" } } } });
  });
});

describe("makeCheckFailure", () => {
  it("creates failure with correct property and reason", () => {
    const failure = makeCheckFailure("action", "action is required");
    expect(failure.getProperty()).toBe("action");
    expect(failure.getReason()).toBe("action is required");
  });

  it("creates distinct failures for different fields", () => {
    const f1 = makeCheckFailure("name", "name is required");
    const f2 = makeCheckFailure("type", "type is required");
    expect(f1.getProperty()).toBe("name");
    expect(f2.getProperty()).toBe("type");
    expect(f1.getReason()).not.toBe(f2.getReason());
  });
});

describe("getResourceType", () => {
  it("extracts type from getType()", () => {
    const call = {
      request: {
        getType: () => "homelab:index:OpnsenseFirewallRule",
      },
    };
    expect(getResourceType(call)).toBe("homelab:index:OpnsenseFirewallRule");
  });

  it("falls back to URN parsing when getType returns empty", () => {
    const call = {
      request: {
        getType: () => "",
        getUrn: () => "urn:pulumi:dev::myproject::homelab:index:OpnsenseAlias::myalias",
      },
    };
    expect(getResourceType(call)).toBe("homelab:index:OpnsenseAlias");
  });

  it("falls back to URN parsing when getType is not a function", () => {
    const call = {
      request: {
        getUrn: () => "urn:pulumi:dev::myproject::homelab:index:Stack::mystack",
      },
    };
    expect(getResourceType(call)).toBe("homelab:index:Stack");
  });

  it("returns empty string when nothing available", () => {
    const call = { request: {} };
    expect(getResourceType(call)).toBe("");
  });
});

describe("valuesEqual", () => {
  it("treats undefined and undefined as equal", () => {
    expect(valuesEqual(undefined, undefined)).toBe(true);
  });

  it("treats empty string and undefined as equal", () => {
    expect(valuesEqual("", undefined)).toBe(true);
    expect(valuesEqual(undefined, "")).toBe(true);
  });

  it("treats empty string and empty string as equal", () => {
    expect(valuesEqual("", "")).toBe(true);
  });

  it("treats equal strings as equal", () => {
    expect(valuesEqual("hello", "hello")).toBe(true);
  });

  it("treats different strings as not equal", () => {
    expect(valuesEqual("hello", "world")).toBe(false);
  });

  it("treats equal numbers as equal", () => {
    expect(valuesEqual(42, 42)).toBe(true);
  });

  it("treats different numbers as not equal", () => {
    expect(valuesEqual(1, 2)).toBe(false);
  });

  it("treats equal booleans as equal", () => {
    expect(valuesEqual(true, true)).toBe(true);
    expect(valuesEqual(false, false)).toBe(true);
  });

  it("treats different booleans as not equal", () => {
    expect(valuesEqual(true, false)).toBe(false);
  });

  it("treats non-empty string and undefined as not equal", () => {
    expect(valuesEqual("hello", undefined)).toBe(false);
    expect(valuesEqual(undefined, "hello")).toBe(false);
  });

  it("treats 0 and undefined as not equal", () => {
    expect(valuesEqual(0, undefined)).toBe(false);
  });

  it("treats false and undefined as not equal", () => {
    expect(valuesEqual(false, undefined)).toBe(false);
  });

  it("treats null and null as equal", () => {
    expect(valuesEqual(null, null)).toBe(true);
  });

  it("treats null and undefined as not equal", () => {
    // null values from protobuf are distinct from undefined (missing)
    expect(valuesEqual(null, undefined)).toBe(false);
  });

  it("treats null and empty string as not equal", () => {
    expect(valuesEqual(null, "")).toBe(false);
  });
});
