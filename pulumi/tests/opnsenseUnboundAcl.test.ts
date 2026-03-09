import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { opnsenseUnboundAclResource } from "../src/resources/opnsenseUnboundAcl";

jest.mock("../src/opnsenseClient", () => ({
  ensureOpnsenseConfigured: jest.fn(),
  withUnboundReconfigure: jest.fn((fn: () => Promise<any>) => fn()),
  addAcl: jest.fn(),
  getAcl: jest.fn(),
  setAcl: jest.fn(),
  delAcl: jest.fn(),
  aclToApi: jest.fn((inputs: any) => ({ name: inputs.name, networks: inputs.networks })),
  aclFromApi: jest.fn((data: any) => {
    const result: Record<string, any> = { name: data.name, networks: data.networks, enabled: data.enabled === "1" };
    if (data.action !== undefined) result.action = data.action;
    if (data.description !== undefined) result.description = data.description;
    return result;
  }),
}));

const opnsenseClient = require("../src/opnsenseClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("opnsenseUnboundAcl check", () => {
  it("returns failure when name is missing", async () => {
    const call = makeCheckCall({ networks: "10.0.0.0/8" });
    const { err, response } = await callHandler(opnsenseUnboundAclResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("name");
  });

  it("returns failure when networks is missing", async () => {
    const call = makeCheckCall({ name: "lan-acl" });
    const { err, response } = await callHandler(opnsenseUnboundAclResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("networks");
  });

  it("returns two failures when both name and networks are missing", async () => {
    const call = makeCheckCall({});
    const { err, response } = await callHandler(opnsenseUnboundAclResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(2);
    const props = failures.map((f: any) => f.getProperty());
    expect(props).toContain("name");
    expect(props).toContain("networks");
  });

  it("returns no failures when required fields are present", async () => {
    const call = makeCheckCall({ name: "lan-acl", networks: "10.0.0.0/8" });
    const { err, response } = await callHandler(opnsenseUnboundAclResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("defaults enabled to true, action to allow", async () => {
    const call = makeCheckCall({ name: "test", networks: "10.0.0.0/8" });
    const { response } = await callHandler(opnsenseUnboundAclResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.enabled).toBe(true);
    expect(inputs.action).toBe("allow");
  });

  it("preserves explicit enabled=false", async () => {
    const call = makeCheckCall({ name: "test", networks: "10.0.0.0/8", enabled: false });
    const { response } = await callHandler(opnsenseUnboundAclResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.enabled).toBe(false);
  });

  it("preserves explicit action=deny", async () => {
    const call = makeCheckCall({ name: "test", networks: "10.0.0.0/8", action: "deny" });
    const { response } = await callHandler(opnsenseUnboundAclResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.action).toBe("deny");
  });

  it("rejects invalid action value", async () => {
    const call = makeCheckCall({ name: "test", networks: "10.0.0.0/8", action: "drop" });
    const { err, response } = await callHandler(opnsenseUnboundAclResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("action");
    expect(failures[0].getReason()).toContain("must be one of");
  });
});

describe("opnsenseUnboundAcl diff", () => {
  it("returns DIFF_NONE when no fields changed", async () => {
    const props = { name: "test", networks: "10.0.0.0/8", enabled: true };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(opnsenseUnboundAclResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("detects single field change", async () => {
    const olds = { name: "test", networks: "10.0.0.0/8" };
    const news = { name: "test", networks: "192.168.0.0/16" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundAclResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["networks"]);
  });

  it("detects multiple field changes", async () => {
    const olds = { name: "old", networks: "10.0.0.0/8", action: "allow" };
    const news = { name: "new", networks: "192.168.0.0/16", action: "deny" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundAclResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    const diffs = response.getDiffsList();
    expect(diffs).toContain("name");
    expect(diffs).toContain("networks");
    expect(diffs).toContain("action");
  });

  it("detects boolean enabled change", async () => {
    const olds = { name: "test", networks: "10.0.0.0/8", enabled: true };
    const news = { name: "test", networks: "10.0.0.0/8", enabled: false };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundAclResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["enabled"]);
  });

  it("skips when both old and new are undefined", async () => {
    const olds = { name: "test", networks: "10.0.0.0/8" };
    const news = { name: "test", networks: "10.0.0.0/8" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundAclResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });
});

describe("opnsenseUnboundAcl create", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("returns preview outputs without calling API", async () => {
    const call = makeCreateCall({ name: "lan-acl", networks: "10.0.0.0/8" }, true);
    const { err, response } = await callHandler(opnsenseUnboundAclResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("preview");
    expect(opnsenseClient.addAcl).not.toHaveBeenCalled();
  });

  it("creates ACL via withUnboundReconfigure and verifies toApi args", async () => {
    opnsenseClient.addAcl.mockResolvedValue({ uuid: "acl-uuid-1" });

    const inputs = { name: "lan-acl", networks: "10.0.0.0/8" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(opnsenseUnboundAclResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("acl-uuid-1");
    expect(opnsenseClient.withUnboundReconfigure).toHaveBeenCalled();
    expect(opnsenseClient.aclToApi).toHaveBeenCalledWith(inputs);
  });

  it("returns error on API failure", async () => {
    opnsenseClient.addAcl.mockRejectedValue(new Error("connection refused"));

    const call = makeCreateCall({ name: "lan-acl", networks: "10.0.0.0/8" });
    const { err } = await callHandler(opnsenseUnboundAclResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create ACL");
  });
});

describe("opnsenseUnboundAcl read", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("reads ACL and returns outputs with all fields and setInputs", async () => {
    opnsenseClient.getAcl.mockResolvedValue({ acl: { name: "lan-acl", networks: "10.0.0.0/8", enabled: "1", action: "allow", description: "LAN access" } });

    const call = makeReadCall("acl-uuid-1");
    const { err, response } = await callHandler(opnsenseUnboundAclResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("acl-uuid-1");
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("acl-uuid-1");
    expect(props.name).toBe("lan-acl");
    expect(props.networks).toBe("10.0.0.0/8");
    expect(props.enabled).toBe(true);
    expect(props.action).toBe("allow");
    expect(props.description).toBe("LAN access");

    // Verify setInputs contains input fields (no uuid)
    const inputs = response.getInputs().toJavaScript();
    expect(inputs.name).toBe("lan-acl");
    expect(inputs.networks).toBe("10.0.0.0/8");
    expect(inputs.enabled).toBe(true);
    expect(inputs.action).toBe("allow");
    expect(inputs.uuid).toBeUndefined();
  });

  it("returns empty response on 404", async () => {
    opnsenseClient.getAcl.mockRejectedValue(new Error("OPNsense API failed (404): not found"));

    const call = makeReadCall("gone-uuid");
    const { err, response } = await callHandler(opnsenseUnboundAclResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.getAcl.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("acl-uuid-1");
    const { err } = await callHandler(opnsenseUnboundAclResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read ACL");
  });
});

describe("opnsenseUnboundAcl update", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("returns preview outputs without calling API", async () => {
    const call = makeUpdateCall("acl-uuid-1", { name: "lan-acl", networks: "10.0.0.0/8" }, { name: "lan-acl", networks: "192.168.0.0/16" }, true);
    const { err } = await callHandler(opnsenseUnboundAclResource.update, call);

    expect(err).toBeNull();
    expect(opnsenseClient.setAcl).not.toHaveBeenCalled();
  });

  it("updates ACL via withUnboundReconfigure and verifies toApi args", async () => {
    opnsenseClient.setAcl.mockResolvedValue(undefined);

    const news = { name: "lan-acl", networks: "192.168.0.0/16" };
    const call = makeUpdateCall("acl-uuid-1", { name: "lan-acl", networks: "10.0.0.0/8" }, news);
    const { err, response } = await callHandler(opnsenseUnboundAclResource.update, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withUnboundReconfigure).toHaveBeenCalled();
    expect(opnsenseClient.aclToApi).toHaveBeenCalledWith(news);
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("acl-uuid-1");
  });

  it("returns error on API failure", async () => {
    opnsenseClient.setAcl.mockRejectedValue(new Error("server error"));

    const call = makeUpdateCall("acl-uuid-1", {}, { name: "x", networks: "10.0.0.0/8" });
    const { err } = await callHandler(opnsenseUnboundAclResource.update, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to update ACL");
  });
});

describe("opnsenseUnboundAcl delete", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("deletes ACL via withUnboundReconfigure", async () => {
    opnsenseClient.delAcl.mockResolvedValue(undefined);

    const call = makeDeleteCall("acl-uuid-1");
    const { err } = await callHandler(opnsenseUnboundAclResource.delete, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withUnboundReconfigure).toHaveBeenCalled();
  });

  it("ignores 404 on delete", async () => {
    opnsenseClient.delAcl.mockRejectedValue(new Error("OPNsense API failed (404): not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseUnboundAclResource.delete, call);

    expect(err).toBeNull();
  });

  it("ignores 'not found' text on delete", async () => {
    opnsenseClient.delAcl.mockRejectedValue(new Error("resource not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseUnboundAclResource.delete, call);

    expect(err).toBeNull();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.delAcl.mockRejectedValue(new Error("connection refused"));

    const call = makeDeleteCall("acl-uuid-1");
    const { err } = await callHandler(opnsenseUnboundAclResource.delete, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to delete ACL");
  });
});
