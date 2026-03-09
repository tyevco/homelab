import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { opnsenseUnboundHostOverrideResource } from "../src/resources/opnsenseUnboundHostOverride";

jest.mock("../src/opnsenseClient", () => ({
  ensureOpnsenseConfigured: jest.fn(),
  withUnboundReconfigure: jest.fn((fn: () => Promise<any>) => fn()),
  addHostOverride: jest.fn(),
  getHostOverride: jest.fn(),
  setHostOverride: jest.fn(),
  delHostOverride: jest.fn(),
  hostOverrideToApi: jest.fn((inputs: any) => ({ hostname: inputs.hostname, domain: inputs.domain })),
  hostOverrideFromApi: jest.fn((data: any) => {
    const result: Record<string, any> = { hostname: data.hostname, domain: data.domain, enabled: data.enabled === "1" };
    if (data.rr !== undefined) result.rr = data.rr;
    if (data.server !== undefined) result.server = data.server;
    if (data.mx !== undefined) result.mx = data.mx;
    return result;
  }),
}));

const opnsenseClient = require("../src/opnsenseClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("opnsenseUnboundHostOverride check", () => {
  it("returns failure when domain is missing", async () => {
    const call = makeCheckCall({ server: "1.2.3.4" });
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("domain");
  });

  it("returns no failures when domain is present", async () => {
    const call = makeCheckCall({ domain: "example.com" });
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("defaults enabled to true, rr to A, addptr to true", async () => {
    const call = makeCheckCall({ domain: "example.com" });
    const { response } = await callHandler(opnsenseUnboundHostOverrideResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.enabled).toBe(true);
    expect(inputs.rr).toBe("A");
    expect(inputs.addptr).toBe(true);
  });

  it("preserves explicit enabled=false", async () => {
    const call = makeCheckCall({ domain: "example.com", enabled: false });
    const { response } = await callHandler(opnsenseUnboundHostOverrideResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.enabled).toBe(false);
  });

  it("preserves explicit rr=AAAA", async () => {
    const call = makeCheckCall({ domain: "example.com", rr: "AAAA" });
    const { response } = await callHandler(opnsenseUnboundHostOverrideResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.rr).toBe("AAAA");
  });

  it("preserves explicit addptr=false", async () => {
    const call = makeCheckCall({ domain: "example.com", addptr: false });
    const { response } = await callHandler(opnsenseUnboundHostOverrideResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.addptr).toBe(false);
  });

  it("accepts TXT as a valid rr value", async () => {
    const call = makeCheckCall({ domain: "example.com", rr: "TXT", txtdata: "v=spf1 include:example.com ~all" });
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
    const inputs = response.getInputs().toJavaScript();
    expect(inputs.rr).toBe("TXT");
    expect(inputs.txtdata).toBe("v=spf1 include:example.com ~all");
  });

  it("rejects invalid rr value", async () => {
    const call = makeCheckCall({ domain: "example.com", rr: "CNAME" });
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("rr");
    expect(failures[0].getReason()).toContain("must be one of");
  });
});

describe("opnsenseUnboundHostOverride diff", () => {
  it("returns DIFF_NONE when no fields changed", async () => {
    const props = { domain: "example.com", rr: "A", enabled: true };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(opnsenseUnboundHostOverrideResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("detects single field change", async () => {
    const olds = { domain: "example.com", server: "1.2.3.4" };
    const news = { domain: "example.com", server: "5.6.7.8" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundHostOverrideResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["server"]);
  });

  it("detects multiple field changes", async () => {
    const olds = { domain: "old.com", hostname: "host1", rr: "A" };
    const news = { domain: "new.com", hostname: "host2", rr: "AAAA" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundHostOverrideResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    const diffs = response.getDiffsList();
    expect(diffs).toContain("domain");
    expect(diffs).toContain("hostname");
    expect(diffs).toContain("rr");
  });

  it("detects boolean addptr change", async () => {
    const olds = { domain: "example.com", addptr: true };
    const news = { domain: "example.com", addptr: false };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundHostOverrideResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["addptr"]);
  });

  it("skips when both old and new are undefined", async () => {
    const olds = { domain: "example.com" };
    const news = { domain: "example.com" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseUnboundHostOverrideResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });
});

describe("opnsenseUnboundHostOverride create", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("returns preview outputs without calling API", async () => {
    const inputs = { domain: "example.com", server: "1.2.3.4" };
    const call = makeCreateCall(inputs, true);
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("preview");
    expect(opnsenseClient.addHostOverride).not.toHaveBeenCalled();
  });

  it("creates host override via withUnboundReconfigure and verifies toApi args", async () => {
    opnsenseClient.addHostOverride.mockResolvedValue({ uuid: "ho-uuid-1" });

    const inputs = { domain: "example.com", server: "1.2.3.4" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("ho-uuid-1");
    expect(opnsenseClient.withUnboundReconfigure).toHaveBeenCalled();
    expect(opnsenseClient.hostOverrideToApi).toHaveBeenCalledWith(inputs);
  });

  it("returns error on API failure", async () => {
    opnsenseClient.addHostOverride.mockRejectedValue(new Error("connection refused"));

    const call = makeCreateCall({ domain: "example.com" });
    const { err } = await callHandler(opnsenseUnboundHostOverrideResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create host override");
  });
});

describe("opnsenseUnboundHostOverride read", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("reads host override and returns outputs with all fields and setInputs", async () => {
    opnsenseClient.getHostOverride.mockResolvedValue({ hostoverride: { hostname: "myhost", domain: "example.com", enabled: "1", rr: "A", server: "1.2.3.4" } });

    const call = makeReadCall("ho-uuid-1");
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("ho-uuid-1");
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("ho-uuid-1");
    expect(props.hostname).toBe("myhost");
    expect(props.domain).toBe("example.com");
    expect(props.enabled).toBe(true);
    expect(props.rr).toBe("A");
    expect(props.server).toBe("1.2.3.4");

    // Verify setInputs contains input fields (no uuid)
    const inputs = response.getInputs().toJavaScript();
    expect(inputs.hostname).toBe("myhost");
    expect(inputs.domain).toBe("example.com");
    expect(inputs.enabled).toBe(true);
    expect(inputs.rr).toBe("A");
    expect(inputs.server).toBe("1.2.3.4");
    expect(inputs.uuid).toBeUndefined();
  });

  it("returns empty response on 404", async () => {
    opnsenseClient.getHostOverride.mockRejectedValue(new Error("OPNsense API failed (404): not found"));

    const call = makeReadCall("gone-uuid");
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.getHostOverride.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("ho-uuid-1");
    const { err } = await callHandler(opnsenseUnboundHostOverrideResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read host override");
  });
});

describe("opnsenseUnboundHostOverride update", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("returns preview outputs without calling API", async () => {
    const olds = { domain: "example.com", server: "1.2.3.4" };
    const news = { domain: "example.com", server: "5.6.7.8" };
    const call = makeUpdateCall("ho-uuid-1", olds, news, true);
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.update, call);

    expect(err).toBeNull();
    expect(opnsenseClient.setHostOverride).not.toHaveBeenCalled();
  });

  it("updates host override via withUnboundReconfigure and verifies toApi args", async () => {
    opnsenseClient.setHostOverride.mockResolvedValue(undefined);

    const olds = { domain: "example.com", server: "1.2.3.4" };
    const news = { domain: "example.com", server: "5.6.7.8" };
    const call = makeUpdateCall("ho-uuid-1", olds, news);
    const { err, response } = await callHandler(opnsenseUnboundHostOverrideResource.update, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withUnboundReconfigure).toHaveBeenCalled();
    expect(opnsenseClient.hostOverrideToApi).toHaveBeenCalledWith(news);
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("ho-uuid-1");
  });

  it("returns error on API failure", async () => {
    opnsenseClient.setHostOverride.mockRejectedValue(new Error("server error"));

    const call = makeUpdateCall("ho-uuid-1", {}, { domain: "x.com" });
    const { err } = await callHandler(opnsenseUnboundHostOverrideResource.update, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to update host override");
  });
});

describe("opnsenseUnboundHostOverride delete", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("deletes host override via withUnboundReconfigure", async () => {
    opnsenseClient.delHostOverride.mockResolvedValue(undefined);

    const call = makeDeleteCall("ho-uuid-1");
    const { err } = await callHandler(opnsenseUnboundHostOverrideResource.delete, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withUnboundReconfigure).toHaveBeenCalled();
  });

  it("ignores 404 on delete", async () => {
    opnsenseClient.delHostOverride.mockRejectedValue(new Error("OPNsense API failed (404): not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseUnboundHostOverrideResource.delete, call);

    expect(err).toBeNull();
  });

  it("ignores 'not found' text on delete", async () => {
    opnsenseClient.delHostOverride.mockRejectedValue(new Error("resource not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseUnboundHostOverrideResource.delete, call);

    expect(err).toBeNull();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.delHostOverride.mockRejectedValue(new Error("connection refused"));

    const call = makeDeleteCall("ho-uuid-1");
    const { err } = await callHandler(opnsenseUnboundHostOverrideResource.delete, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to delete host override");
  });
});
