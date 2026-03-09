import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { opnsenseUnboundDnsblResource } from "../src/resources/opnsenseUnboundDnsbl";

jest.mock("../src/opnsenseClient", () => ({
  ensureOpnsenseConfigured: jest.fn(),
  withUnboundReconfigure: jest.fn((fn: () => Promise<any>) => fn()),
  addDnsbl: jest.fn(),
  getDnsbl: jest.fn(),
  setDnsbl: jest.fn(),
  delDnsbl: jest.fn(),
  dnsblToApi: jest.fn((inputs: any) => ({ description: inputs.description })),
  dnsblFromApi: jest.fn((data: any) => {
    const result: Record<string, any> = { description: data.description, enabled: data.enabled === "1" };
    if (data.cache_ttl !== undefined) result.cacheTtl = parseInt(data.cache_ttl, 10);
    if (data.lists !== undefined) result.lists = data.lists;
    if (data.source_nets !== undefined) result.sourceNets = data.source_nets;
    return result;
  }),
}));

const opnsenseClient = require("../src/opnsenseClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("opnsenseUnboundDnsbl check", () => {
  it("returns failure when description is missing", async () => {
    const call = makeCheckCall({ type: "dnsbl" });
    const { err, response } = await callHandler(opnsenseUnboundDnsblResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("description");
  });

  it("returns no failures when description is present", async () => {
    const call = makeCheckCall({ description: "My blocklist" });
    const { err, response } = await callHandler(opnsenseUnboundDnsblResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("defaults enabled to true, cacheTtl to 72000", async () => {
    const call = makeCheckCall({ description: "test" });
    const { response } = await callHandler(opnsenseUnboundDnsblResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.enabled).toBe(true);
    expect(inputs.cacheTtl).toBe(72000);
  });

  it("preserves explicit enabled=false", async () => {
    const call = makeCheckCall({ description: "test", enabled: false });
    const { response } = await callHandler(opnsenseUnboundDnsblResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.enabled).toBe(false);
  });

  it("preserves explicit cacheTtl", async () => {
    const call = makeCheckCall({ description: "test", cacheTtl: 3600 });
    const { response } = await callHandler(opnsenseUnboundDnsblResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.cacheTtl).toBe(3600);
  });
});

describe("opnsenseUnboundDnsbl diff", () => {
  it("returns DIFF_NONE when no fields changed", async () => {
    const props = { description: "test", enabled: true, cacheTtl: 72000 };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(opnsenseUnboundDnsblResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("detects single field change", async () => {
    const olds = { description: "old" };
    const news = { description: "new" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundDnsblResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["description"]);
  });

  it("detects multiple field changes", async () => {
    const olds = { description: "old", type: "dnsbl", lists: "list1" };
    const news = { description: "new", type: "other", lists: "list2" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundDnsblResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    const diffs = response.getDiffsList();
    expect(diffs).toContain("description");
    expect(diffs).toContain("type");
    expect(diffs).toContain("lists");
  });

  it("detects boolean nxdomain change", async () => {
    const olds = { description: "test", nxdomain: false };
    const news = { description: "test", nxdomain: true };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundDnsblResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["nxdomain"]);
  });

  it("detects cacheTtl change", async () => {
    const olds = { description: "test", cacheTtl: 72000 };
    const news = { description: "test", cacheTtl: 3600 };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundDnsblResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["cacheTtl"]);
  });

  it("skips when both old and new are undefined", async () => {
    const olds = { description: "test" };
    const news = { description: "test" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundDnsblResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });

  it("detects change in multiline lists field", async () => {
    const olds = { description: "test", lists: "list1\nlist2" };
    const news = { description: "test", lists: "list1\nlist3" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundDnsblResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["lists"]);
  });

  it("treats missing and empty string as equivalent (no spurious diff)", async () => {
    const olds = { description: "test" };
    const news = { description: "test", lists: "", sourceNets: "" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundDnsblResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });
});

describe("opnsenseUnboundDnsbl create", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("returns preview outputs without calling API", async () => {
    const call = makeCreateCall({ description: "My blocklist" }, true);
    const { err, response } = await callHandler(opnsenseUnboundDnsblResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("preview");
    expect(opnsenseClient.addDnsbl).not.toHaveBeenCalled();
  });

  it("creates DNSBL via withUnboundReconfigure and verifies toApi args", async () => {
    opnsenseClient.addDnsbl.mockResolvedValue({ uuid: "dnsbl-uuid-1" });

    const inputs = { description: "My blocklist" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(opnsenseUnboundDnsblResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("dnsbl-uuid-1");
    expect(opnsenseClient.withUnboundReconfigure).toHaveBeenCalled();
    expect(opnsenseClient.dnsblToApi).toHaveBeenCalledWith(inputs);
  });

  it("returns error on API failure", async () => {
    opnsenseClient.addDnsbl.mockRejectedValue(new Error("connection refused"));

    const call = makeCreateCall({ description: "My blocklist" });
    const { err } = await callHandler(opnsenseUnboundDnsblResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create DNSBL");
  });
});

describe("opnsenseUnboundDnsbl read", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("reads DNSBL and returns outputs with all fields and setInputs", async () => {
    opnsenseClient.getDnsbl.mockResolvedValue({ dnsbl: { description: "My blocklist", enabled: "1", cache_ttl: "72000", lists: "list1\nlist2", source_nets: "10.0.0.0/8" } });

    const call = makeReadCall("dnsbl-uuid-1");
    const { err, response } = await callHandler(opnsenseUnboundDnsblResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("dnsbl-uuid-1");
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("dnsbl-uuid-1");
    expect(props.description).toBe("My blocklist");
    expect(props.enabled).toBe(true);
    expect(props.cacheTtl).toBe(72000);
    expect(props.lists).toBe("list1\nlist2");
    expect(props.sourceNets).toBe("10.0.0.0/8");

    // Verify setInputs contains input fields (no uuid)
    const inputs = response.getInputs().toJavaScript();
    expect(inputs.description).toBe("My blocklist");
    expect(inputs.enabled).toBe(true);
    expect(inputs.cacheTtl).toBe(72000);
    expect(inputs.lists).toBe("list1\nlist2");
    expect(inputs.sourceNets).toBe("10.0.0.0/8");
    expect(inputs.uuid).toBeUndefined();
  });

  it("returns empty response on 404", async () => {
    opnsenseClient.getDnsbl.mockRejectedValue(new Error("OPNsense API failed (404): not found"));

    const call = makeReadCall("gone-uuid");
    const { err, response } = await callHandler(opnsenseUnboundDnsblResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.getDnsbl.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("dnsbl-uuid-1");
    const { err } = await callHandler(opnsenseUnboundDnsblResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read DNSBL");
  });
});

describe("opnsenseUnboundDnsbl update", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("returns preview outputs without calling API", async () => {
    const call = makeUpdateCall("dnsbl-uuid-1", { description: "old" }, { description: "new" }, true);
    const { err } = await callHandler(opnsenseUnboundDnsblResource.update, call);

    expect(err).toBeNull();
    expect(opnsenseClient.setDnsbl).not.toHaveBeenCalled();
  });

  it("updates DNSBL via withUnboundReconfigure and verifies toApi args", async () => {
    opnsenseClient.setDnsbl.mockResolvedValue(undefined);

    const news = { description: "new" };
    const call = makeUpdateCall("dnsbl-uuid-1", { description: "old" }, news);
    const { err, response } = await callHandler(opnsenseUnboundDnsblResource.update, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withUnboundReconfigure).toHaveBeenCalled();
    expect(opnsenseClient.dnsblToApi).toHaveBeenCalledWith(news);
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("dnsbl-uuid-1");
  });

  it("returns error on API failure", async () => {
    opnsenseClient.setDnsbl.mockRejectedValue(new Error("server error"));

    const call = makeUpdateCall("dnsbl-uuid-1", {}, { description: "new" });
    const { err } = await callHandler(opnsenseUnboundDnsblResource.update, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to update DNSBL");
  });
});

describe("opnsenseUnboundDnsbl delete", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("deletes DNSBL via withUnboundReconfigure", async () => {
    opnsenseClient.delDnsbl.mockResolvedValue(undefined);

    const call = makeDeleteCall("dnsbl-uuid-1");
    const { err } = await callHandler(opnsenseUnboundDnsblResource.delete, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withUnboundReconfigure).toHaveBeenCalled();
  });

  it("ignores 404 on delete", async () => {
    opnsenseClient.delDnsbl.mockRejectedValue(new Error("OPNsense API failed (404): not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseUnboundDnsblResource.delete, call);

    expect(err).toBeNull();
  });

  it("ignores 'not found' text on delete", async () => {
    opnsenseClient.delDnsbl.mockRejectedValue(new Error("resource not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseUnboundDnsblResource.delete, call);

    expect(err).toBeNull();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.delDnsbl.mockRejectedValue(new Error("connection refused"));

    const call = makeDeleteCall("dnsbl-uuid-1");
    const { err } = await callHandler(opnsenseUnboundDnsblResource.delete, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to delete DNSBL");
  });
});
