import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { opnsenseAliasResource } from "../src/resources/opnsenseAlias";

jest.mock("../src/opnsenseClient", () => ({
  ensureOpnsenseConfigured: jest.fn(),
  withFirewallApply: jest.fn((fn: () => Promise<any>) => fn()),
  addAlias: jest.fn(),
  getAlias: jest.fn(),
  setAlias: jest.fn(),
  delAlias: jest.fn(),
  aliasToApi: jest.fn((inputs: any) => ({ name: inputs.name, type: inputs.type })),
  aliasFromApi: jest.fn((alias: any) => {
    const result: Record<string, any> = { name: alias.name, type: alias.type, enabled: alias.enabled === "1" };
    if (alias.content !== undefined) result.content = alias.content;
    if (alias.description !== undefined) result.description = alias.description;
    return result;
  }),
}));

const opnsenseClient = require("../src/opnsenseClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("opnsenseAlias check", () => {
  it("returns failure when name is missing", async () => {
    const call = makeCheckCall({ type: "host" });
    const { err, response } = await callHandler(opnsenseAliasResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("name");
  });

  it("returns failure when type is missing", async () => {
    const call = makeCheckCall({ name: "blocklist" });
    const { err, response } = await callHandler(opnsenseAliasResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("type");
  });

  it("returns two failures when both name and type are missing", async () => {
    const call = makeCheckCall({});
    const { err, response } = await callHandler(opnsenseAliasResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(2);
    const props = failures.map((f: any) => f.getProperty());
    expect(props).toContain("name");
    expect(props).toContain("type");
  });

  it("defaults enabled to true", async () => {
    const call = makeCheckCall({ name: "test", type: "host" });
    const { response } = await callHandler(opnsenseAliasResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.enabled).toBe(true);
  });

  it("preserves explicit enabled=false", async () => {
    const call = makeCheckCall({ name: "test", type: "host", enabled: false });
    const { response } = await callHandler(opnsenseAliasResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.enabled).toBe(false);
  });

  it("returns no failures when required fields are present", async () => {
    const call = makeCheckCall({ name: "myalias", type: "network" });
    const { err, response } = await callHandler(opnsenseAliasResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("accepts mac as a valid alias type", async () => {
    const call = makeCheckCall({ name: "gamelab_mac", type: "mac", content: "98:b7:85:1e:c2:1e" });
    const { err, response } = await callHandler(opnsenseAliasResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
    const inputs = response.getInputs().toJavaScript();
    expect(inputs.type).toBe("mac");
    expect(inputs.content).toBe("98:b7:85:1e:c2:1e");
  });

  it("rejects invalid alias type", async () => {
    const call = makeCheckCall({ name: "test", type: "foobar" });
    const { err, response } = await callHandler(opnsenseAliasResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("type");
    expect(failures[0].getReason()).toContain("must be one of");
  });
});

describe("opnsenseAlias diff", () => {
  it("returns DIFF_NONE when no fields changed", async () => {
    const props = { name: "test", type: "host", enabled: true };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(opnsenseAliasResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("detects single field change", async () => {
    const olds = { name: "test", type: "host" };
    const news = { name: "test", type: "network" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseAliasResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["type"]);
  });

  it("detects multiple field changes", async () => {
    const olds = { name: "old", type: "host", description: "old desc" };
    const news = { name: "new", type: "network", description: "new desc" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseAliasResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    const diffs = response.getDiffsList();
    expect(diffs).toContain("name");
    expect(diffs).toContain("type");
    expect(diffs).toContain("description");
  });

  it("detects boolean enabled change", async () => {
    const olds = { name: "test", type: "host", enabled: true };
    const news = { name: "test", type: "host", enabled: false };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseAliasResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["enabled"]);
  });

  it("treats missing and empty string as equivalent (no spurious diff)", async () => {
    const olds = { name: "test", type: "host" };
    const news = { name: "test", type: "host", content: "", description: "" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseAliasResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("detects change in multiline content", async () => {
    const olds = { name: "test", type: "host", content: "10.0.0.1\n10.0.0.2" };
    const news = { name: "test", type: "host", content: "10.0.0.1\n10.0.0.3" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseAliasResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["content"]);
  });
});

describe("opnsenseAlias create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const inputs = { name: "blocklist", type: "host" };
    const call = makeCreateCall(inputs, true);
    const { err, response } = await callHandler(opnsenseAliasResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("preview");
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("");
    expect(props.name).toBe("blocklist");
    expect(opnsenseClient.addAlias).not.toHaveBeenCalled();
  });

  it("creates alias via withFirewallApply and returns uuid", async () => {
    opnsenseClient.addAlias.mockResolvedValue({ uuid: "alias-uuid-1" });

    const inputs = { name: "blocklist", type: "host", content: "10.0.0.1" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(opnsenseAliasResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("alias-uuid-1");
    expect(opnsenseClient.withFirewallApply).toHaveBeenCalled();
    expect(opnsenseClient.aliasToApi).toHaveBeenCalledWith(inputs);
  });

  it("creates mac alias with MAC address content", async () => {
    opnsenseClient.addAlias.mockResolvedValue({ uuid: "mac-uuid-1" });

    const inputs = { name: "gamelab_mac", type: "mac", content: "98:b7:85:1e:c2:1e" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(opnsenseAliasResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("mac-uuid-1");
    expect(opnsenseClient.aliasToApi).toHaveBeenCalledWith(inputs);
    const props = response.getProperties().toJavaScript();
    expect(props.name).toBe("gamelab_mac");
    expect(props.type).toBe("mac");
    expect(props.content).toBe("98:b7:85:1e:c2:1e");
  });

  it("returns error on API failure", async () => {
    opnsenseClient.addAlias.mockRejectedValue(new Error("OPNsense unreachable"));

    const inputs = { name: "blocklist", type: "host" };
    const call = makeCreateCall(inputs);
    const { err } = await callHandler(opnsenseAliasResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create alias");
  });
});

describe("opnsenseAlias read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads alias and returns outputs with uuid and setInputs", async () => {
    opnsenseClient.getAlias.mockResolvedValue({
      alias: { name: "blocklist", type: "host", enabled: "1", content: "10.0.0.1", description: "My blocklist" },
    });

    const call = makeReadCall("alias-uuid-1");
    const { err, response } = await callHandler(opnsenseAliasResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("alias-uuid-1");
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("alias-uuid-1");
    expect(props.name).toBe("blocklist");
    expect(props.type).toBe("host");
    expect(props.enabled).toBe(true);
    expect(props.content).toBe("10.0.0.1");
    expect(props.description).toBe("My blocklist");

    // Verify setInputs contains input fields (no uuid)
    const inputs = response.getInputs().toJavaScript();
    expect(inputs.name).toBe("blocklist");
    expect(inputs.type).toBe("host");
    expect(inputs.enabled).toBe(true);
    expect(inputs.content).toBe("10.0.0.1");
    expect(inputs.uuid).toBeUndefined();
  });

  it("reads alias with getItem selected-map format", async () => {
    // Simulate getItem response after normalizeGetItemResponse has run
    opnsenseClient.getAlias.mockResolvedValue({
      alias: { name: "NetBirdPorts", type: "port", enabled: "1", content: "33073\n10000", description: "" },
    });

    const call = makeReadCall("alias-uuid-2");
    const { err, response } = await callHandler(opnsenseAliasResource.read, call);

    expect(err).toBeNull();
    const props = response.getProperties().toJavaScript();
    expect(props.name).toBe("NetBirdPorts");
    expect(props.type).toBe("port");
    expect(props.enabled).toBe(true);
    expect(props.content).toBe("33073\n10000");
  });

  it("returns empty response on 404", async () => {
    opnsenseClient.getAlias.mockRejectedValue(new Error("OPNsense API failed (404): not found"));

    const call = makeReadCall("gone-uuid");
    const { err, response } = await callHandler(opnsenseAliasResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.getAlias.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("alias-uuid-1");
    const { err } = await callHandler(opnsenseAliasResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read alias");
  });
});

describe("opnsenseAlias update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const olds = { name: "blocklist", type: "host" };
    const news = { name: "blocklist", type: "network" };
    const call = makeUpdateCall("alias-uuid-1", olds, news, true);
    const { err, response } = await callHandler(opnsenseAliasResource.update, call);

    expect(err).toBeNull();
    const props = response.getProperties().toJavaScript();
    expect(props.type).toBe("network");
    expect(props.uuid).toBe("alias-uuid-1");
    expect(opnsenseClient.setAlias).not.toHaveBeenCalled();
  });

  it("updates alias via withFirewallApply", async () => {
    opnsenseClient.setAlias.mockResolvedValue(undefined);

    const olds = { name: "blocklist", type: "host" };
    const news = { name: "blocklist", type: "network" };
    const call = makeUpdateCall("alias-uuid-1", olds, news);
    const { err } = await callHandler(opnsenseAliasResource.update, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withFirewallApply).toHaveBeenCalled();
    expect(opnsenseClient.aliasToApi).toHaveBeenCalledWith(news);
  });

  it("returns error on API failure", async () => {
    opnsenseClient.setAlias.mockRejectedValue(new Error("server error"));

    const olds = { name: "blocklist", type: "host" };
    const news = { name: "blocklist", type: "network" };
    const call = makeUpdateCall("alias-uuid-1", olds, news);
    const { err } = await callHandler(opnsenseAliasResource.update, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to update alias");
  });
});

describe("opnsenseAlias delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes alias via withFirewallApply", async () => {
    opnsenseClient.delAlias.mockResolvedValue(undefined);

    const call = makeDeleteCall("alias-uuid-1");
    const { err } = await callHandler(opnsenseAliasResource.delete, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withFirewallApply).toHaveBeenCalled();
  });

  it("ignores 404 on delete", async () => {
    opnsenseClient.delAlias.mockRejectedValue(new Error("OPNsense API failed (404): not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseAliasResource.delete, call);

    expect(err).toBeNull();
  });

  it("ignores 'not found' text on delete", async () => {
    opnsenseClient.delAlias.mockRejectedValue(new Error("resource not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseAliasResource.delete, call);

    expect(err).toBeNull();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.delAlias.mockRejectedValue(new Error("connection refused"));

    const call = makeDeleteCall("alias-uuid-1");
    const { err } = await callHandler(opnsenseAliasResource.delete, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to delete alias");
  });
});
