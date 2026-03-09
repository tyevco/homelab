import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { opnsenseFirewallRuleResource } from "../src/resources/opnsenseFirewallRule";

jest.mock("../src/opnsenseClient", () => ({
  ensureOpnsenseConfigured: jest.fn(),
  withFirewallApply: jest.fn((fn: () => Promise<any>) => fn()),
  addFirewallRule: jest.fn(),
  getFirewallRule: jest.fn(),
  setFirewallRule: jest.fn(),
  delFirewallRule: jest.fn(),
  ruleToApi: jest.fn((inputs: any) => ({ action: inputs.action, interface: inputs.interface })),
  ruleFromApi: jest.fn((rule: any) => {
    const result: Record<string, any> = {};
    if (rule.action !== undefined) result.action = rule.action;
    if (rule.interface !== undefined) result.interface = rule.interface;
    if (rule.ipprotocol !== undefined) result.ipprotocol = rule.ipprotocol;
    if (rule.protocol !== undefined) result.protocol = rule.protocol;
    if (rule.source_net !== undefined) result.sourceNet = rule.source_net;
    if (rule.destination_net !== undefined) result.destinationNet = rule.destination_net;
    if (rule.direction !== undefined) result.direction = rule.direction;
    if (rule.description !== undefined) result.description = rule.description;
    if (rule.log !== undefined) result.log = rule.log === "1";
    if (rule.quick !== undefined) result.quick = rule.quick === "1";
    if (rule.disabled !== undefined) result.disabled = rule.disabled === "1";
    if (rule.sequence !== undefined) result.sequence = parseInt(rule.sequence, 10);
    return result;
  }),
}));

const opnsenseClient = require("../src/opnsenseClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("opnsenseFirewallRule check", () => {
  it("returns failure when action is missing", async () => {
    const call = makeCheckCall({ interface: "lan" });
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("action");
  });

  it("returns failure when interface is missing", async () => {
    const call = makeCheckCall({ action: "pass" });
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("interface");
  });

  it("returns two failures when both action and interface are missing", async () => {
    const call = makeCheckCall({});
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(2);
    const props = failures.map((f: any) => f.getProperty());
    expect(props).toContain("action");
    expect(props).toContain("interface");
  });

  it("applies defaults for ipprotocol, protocol, direction, quick", async () => {
    const call = makeCheckCall({ action: "pass", interface: "lan" });
    const { response } = await callHandler(opnsenseFirewallRuleResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.ipprotocol).toBe("inet");
    expect(inputs.protocol).toBe("any");
    expect(inputs.direction).toBe("in");
    expect(inputs.quick).toBe(true);
  });

  it("preserves explicit values over defaults", async () => {
    const call = makeCheckCall({
      action: "block",
      interface: "wan",
      ipprotocol: "inet6",
      protocol: "TCP",
      direction: "out",
      quick: false,
    });
    const { response } = await callHandler(opnsenseFirewallRuleResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.ipprotocol).toBe("inet6");
    expect(inputs.protocol).toBe("TCP");
    expect(inputs.direction).toBe("out");
    expect(inputs.quick).toBe(false);
  });

  it("returns no failures when required fields are present", async () => {
    const call = makeCheckCall({ action: "pass", interface: "lan" });
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("rejects invalid action value", async () => {
    const call = makeCheckCall({ action: "deny", interface: "lan" });
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("action");
    expect(failures[0].getReason()).toContain("must be one of");
  });

  it("rejects invalid direction value", async () => {
    const call = makeCheckCall({ action: "pass", interface: "lan", direction: "forward" });
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("direction");
  });

  it("rejects invalid ipprotocol value", async () => {
    const call = makeCheckCall({ action: "pass", interface: "lan", ipprotocol: "ipv4" });
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("ipprotocol");
  });
});

describe("opnsenseFirewallRule diff", () => {
  it("returns DIFF_NONE when no fields changed", async () => {
    const props = { action: "pass", interface: "lan", ipprotocol: "inet" };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(opnsenseFirewallRuleResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("detects single field change", async () => {
    const olds = { action: "pass", interface: "lan" };
    const news = { action: "block", interface: "lan" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseFirewallRuleResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["action"]);
  });

  it("detects multiple field changes", async () => {
    const olds = { action: "pass", interface: "lan", protocol: "any" };
    const news = { action: "block", interface: "wan", protocol: "TCP" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseFirewallRuleResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    const diffs = response.getDiffsList();
    expect(diffs).toContain("action");
    expect(diffs).toContain("interface");
    expect(diffs).toContain("protocol");
    expect(diffs.length).toBe(3);
  });

  it("detects boolean field change", async () => {
    const olds = { action: "pass", interface: "lan", quick: true };
    const news = { action: "pass", interface: "lan", quick: false };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseFirewallRuleResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toEqual(["quick"]);
  });

  it("detects undefined vs value as a change", async () => {
    const olds = { action: "pass", interface: "lan" };
    const news = { action: "pass", interface: "lan", description: "new desc" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseFirewallRuleResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("description");
  });

  it("skips when both old and new are undefined", async () => {
    // Neither has sourcePort defined — should NOT count as a diff
    const olds = { action: "pass", interface: "lan" };
    const news = { action: "pass", interface: "lan" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(opnsenseFirewallRuleResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });
});

describe("opnsenseFirewallRule create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const inputs = { action: "pass", interface: "lan" };
    const call = makeCreateCall(inputs, true);
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("preview");
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("");
    expect(props.action).toBe("pass");
    expect(opnsenseClient.addFirewallRule).not.toHaveBeenCalled();
  });

  it("creates rule via withFirewallApply and returns uuid", async () => {
    opnsenseClient.addFirewallRule.mockResolvedValue({ uuid: "abc-123" });

    const inputs = { action: "pass", interface: "lan" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("abc-123");
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("abc-123");
    expect(opnsenseClient.withFirewallApply).toHaveBeenCalled();
    expect(opnsenseClient.ruleToApi).toHaveBeenCalledWith(inputs);
  });

  it("returns error on API failure", async () => {
    opnsenseClient.addFirewallRule.mockRejectedValue(new Error("OPNsense unreachable"));

    const inputs = { action: "pass", interface: "lan" };
    const call = makeCreateCall(inputs);
    const { err } = await callHandler(opnsenseFirewallRuleResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create firewall rule");
  });
});

describe("opnsenseFirewallRule read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads rule and returns outputs with all fields and setInputs", async () => {
    opnsenseClient.getFirewallRule.mockResolvedValue({
      rule: {
        action: "pass", interface: "lan", ipprotocol: "inet", protocol: "TCP",
        source_net: "10.0.0.0/8", destination_net: "any",
        direction: "in", description: "Allow LAN", log: "0", quick: "1",
        disabled: "0", sequence: "10",
      },
    });

    const call = makeReadCall("abc-123");
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("abc-123");
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("abc-123");
    expect(props.action).toBe("pass");
    expect(props.interface).toBe("lan");
    expect(props.ipprotocol).toBe("inet");
    expect(props.protocol).toBe("TCP");
    expect(props.sourceNet).toBe("10.0.0.0/8");
    expect(props.direction).toBe("in");
    expect(props.description).toBe("Allow LAN");
    expect(props.log).toBe(false);
    expect(props.quick).toBe(true);
    expect(props.sequence).toBe(10);

    // Verify setInputs contains input fields (no uuid)
    const inputs = response.getInputs().toJavaScript();
    expect(inputs.action).toBe("pass");
    expect(inputs.interface).toBe("lan");
    expect(inputs.ipprotocol).toBe("inet");
    expect(inputs.description).toBe("Allow LAN");
    expect(inputs.uuid).toBeUndefined();
  });

  it("returns empty response on 404", async () => {
    opnsenseClient.getFirewallRule.mockRejectedValue(new Error("OPNsense API GET failed (404): not found"));

    const call = makeReadCall("gone-uuid");
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.getFirewallRule.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("abc-123");
    const { err } = await callHandler(opnsenseFirewallRuleResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read firewall rule");
  });
});

describe("opnsenseFirewallRule update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const olds = { action: "pass", interface: "lan" };
    const news = { action: "block", interface: "lan" };
    const call = makeUpdateCall("abc-123", olds, news, true);
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.update, call);

    expect(err).toBeNull();
    const props = response.getProperties().toJavaScript();
    expect(props.action).toBe("block");
    expect(props.uuid).toBe("abc-123");
    expect(opnsenseClient.setFirewallRule).not.toHaveBeenCalled();
  });

  it("updates rule via withFirewallApply", async () => {
    opnsenseClient.setFirewallRule.mockResolvedValue(undefined);

    const olds = { action: "pass", interface: "lan" };
    const news = { action: "block", interface: "lan" };
    const call = makeUpdateCall("abc-123", olds, news);
    const { err, response } = await callHandler(opnsenseFirewallRuleResource.update, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withFirewallApply).toHaveBeenCalled();
    expect(opnsenseClient.ruleToApi).toHaveBeenCalledWith(news);
    const props = response.getProperties().toJavaScript();
    expect(props.uuid).toBe("abc-123");
  });

  it("returns error on API failure", async () => {
    opnsenseClient.setFirewallRule.mockRejectedValue(new Error("server error"));

    const olds = { action: "pass", interface: "lan" };
    const news = { action: "block", interface: "lan" };
    const call = makeUpdateCall("abc-123", olds, news);
    const { err } = await callHandler(opnsenseFirewallRuleResource.update, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to update firewall rule");
  });
});

describe("opnsenseFirewallRule delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes rule via withFirewallApply", async () => {
    opnsenseClient.delFirewallRule.mockResolvedValue(undefined);

    const call = makeDeleteCall("abc-123");
    const { err } = await callHandler(opnsenseFirewallRuleResource.delete, call);

    expect(err).toBeNull();
    expect(opnsenseClient.withFirewallApply).toHaveBeenCalled();
  });

  it("ignores 404 on delete", async () => {
    opnsenseClient.delFirewallRule.mockRejectedValue(new Error("OPNsense API failed (404): not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseFirewallRuleResource.delete, call);

    expect(err).toBeNull();
  });

  it("ignores 'not found' text on delete", async () => {
    opnsenseClient.delFirewallRule.mockRejectedValue(new Error("resource not found"));

    const call = makeDeleteCall("gone-uuid");
    const { err } = await callHandler(opnsenseFirewallRuleResource.delete, call);

    expect(err).toBeNull();
  });

  it("returns error on non-404 failure", async () => {
    opnsenseClient.delFirewallRule.mockRejectedValue(new Error("connection refused"));

    const call = makeDeleteCall("abc-123");
    const { err } = await callHandler(opnsenseFirewallRuleResource.delete, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to delete firewall rule");
  });
});
