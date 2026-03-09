import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { stackResource } from "../src/resources/stack";

jest.mock("../src/homelabClient", () => ({
  ensureConfigured: jest.fn(),
  getStack: jest.fn(),
  createStack: jest.fn(),
  updateStack: jest.fn(),
  deleteStack: jest.fn(),
  startStack: jest.fn(),
  stopStack: jest.fn(),
}));

const homelabClient = require("../src/homelabClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("stack check", () => {
  it("returns failure when name is missing", async () => {
    const call = makeCheckCall({ composeYaml: "version: '3'" });
    const { err, response } = await callHandler(stackResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("name");
  });

  it("returns failure when composeYaml is missing", async () => {
    const call = makeCheckCall({ name: "mystack" });
    const { err, response } = await callHandler(stackResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("composeYaml");
  });

  it("returns two failures when both name and composeYaml are missing", async () => {
    const call = makeCheckCall({});
    const { err, response } = await callHandler(stackResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(2);
    const props = failures.map((f: any) => f.getProperty());
    expect(props).toContain("name");
    expect(props).toContain("composeYaml");
  });

  it("defaults running to true", async () => {
    const call = makeCheckCall({ name: "test", composeYaml: "version: '3'" });
    const { response } = await callHandler(stackResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.running).toBe(true);
  });

  it("preserves explicit running=false", async () => {
    const call = makeCheckCall({ name: "test", composeYaml: "version: '3'", running: false });
    const { response } = await callHandler(stackResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.running).toBe(false);
  });

  it("returns no failures when required fields are present", async () => {
    const call = makeCheckCall({ name: "mystack", composeYaml: "version: '3'" });
    const { err, response } = await callHandler(stackResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("returns no failures when valid extraFiles provided", async () => {
    const call = makeCheckCall({
      name: "mystack",
      composeYaml: "version: '3'",
      extraFiles: [{ name: "prometheus.yml", content: "scrape_configs: []" }],
    });
    const { err, response } = await callHandler(stackResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("returns failure when extraFiles has invalid name", async () => {
    const call = makeCheckCall({
      name: "mystack",
      composeYaml: "version: '3'",
      extraFiles: [{ name: "-invalid!", content: "data" }],
    });
    const { response } = await callHandler(stackResource.check, call);

    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("extraFiles[0].name");
  });
});

describe("stack diff", () => {
  it("returns DIFF_NONE when no fields changed", async () => {
    const props = { name: "test", composeYaml: "version: '3'", running: true };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("detects name change as UPDATE_REPLACE", async () => {
    const olds = { name: "old-stack", composeYaml: "version: '3'", running: true };
    const news = { name: "new-stack", composeYaml: "version: '3'", running: true };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getReplacesList()).toContain("name");
    const detailedDiff = response.getDetaileddiffMap();
    const nameDiff = detailedDiff.get("name");
    expect(nameDiff).toBeDefined();
    expect(nameDiff.getKind()).toBe(providerProto.PropertyDiff.Kind.UPDATE_REPLACE);
  });

  it("detects composeYaml change with granular compose diffs", async () => {
    const olds = {
      name: "test",
      composeYaml: "services:\n  web:\n    image: nginx:1.0",
      running: true,
    };
    const news = {
      name: "test",
      composeYaml: "services:\n  web:\n    image: nginx:2.0",
      running: true,
    };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("composeYaml");
    const detailedDiff = response.getDetaileddiffMap();
    const imageDiff = detailedDiff.get("compose.services.web.image");
    expect(imageDiff).toBeDefined();
    expect(imageDiff.getKind()).toBe(providerProto.PropertyDiff.Kind.UPDATE);
  });

  it("detects envFile change with per-variable diffs", async () => {
    const olds = {
      name: "test",
      composeYaml: "version: '3'",
      running: true,
      envFile: "FOO=bar",
    };
    const news = {
      name: "test",
      composeYaml: "version: '3'",
      running: true,
      envFile: "FOO=baz\nNEW=val",
    };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("envFile");
    const detailedDiff = response.getDetaileddiffMap();
    expect(detailedDiff.get("envFile.FOO")).toBeDefined();
    expect(detailedDiff.get("envFile.NEW")).toBeDefined();
  });

  it("detects running change", async () => {
    const olds = { name: "test", composeYaml: "version: '3'", running: true };
    const news = { name: "test", composeYaml: "version: '3'", running: false };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("running");
  });

  it("detects autostart change", async () => {
    const olds = { name: "test", composeYaml: "version: '3'", running: true, autostart: false };
    const news = { name: "test", composeYaml: "version: '3'", running: true, autostart: true };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("autostart");
  });

  it("detects displayName change", async () => {
    const olds = { name: "test", composeYaml: "version: '3'", running: true, displayName: "Old" };
    const news = { name: "test", composeYaml: "version: '3'", running: true, displayName: "New" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("displayName");
  });

  it("detects extraFiles change as UPDATE", async () => {
    const olds = { name: "test", composeYaml: "version: '3'", running: true, extraFiles: [{ name: "a.yml", content: "old" }] };
    const news = { name: "test", composeYaml: "version: '3'", running: true, extraFiles: [{ name: "a.yml", content: "new" }] };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("extraFiles");
    expect(response.getReplacesList()).not.toContain("extraFiles");
  });

  it("returns DIFF_NONE when extraFiles unchanged", async () => {
    const props = { name: "test", composeYaml: "version: '3'", running: true, extraFiles: [{ name: "a.yml", content: "same" }] };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });

  it("detects multiple changes at once", async () => {
    const olds = {
      name: "test",
      composeYaml: "services:\n  web:\n    image: nginx",
      running: true,
      autostart: false,
      displayName: "Old",
    };
    const news = {
      name: "test",
      composeYaml: "services:\n  web:\n    image: apache",
      running: false,
      autostart: true,
      displayName: "New",
    };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    const diffs = response.getDiffsList();
    expect(diffs).toContain("composeYaml");
    expect(diffs).toContain("running");
    expect(diffs).toContain("autostart");
    expect(diffs).toContain("displayName");
  });

  it("detects composeOverride change", async () => {
    const olds = {
      name: "test",
      composeYaml: "services:\n  web:\n    image: nginx",
      running: true,
    };
    const news = {
      name: "test",
      composeYaml: "services:\n  web:\n    image: nginx",
      running: true,
      composeOverride: "services:\n  web:\n    ports:\n      - '8080:80'",
    };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("composeOverride");
  });

  it("falls back to simple diff when compose YAML parsing fails", async () => {
    const olds = {
      name: "test",
      composeYaml: "valid: yaml",
      running: true,
    };
    const news = {
      name: "test",
      composeYaml: "%YAML 99.99",
      running: true,
    };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("composeYaml");
    // Falls back to coarse "composeYaml" diff instead of granular compose.* diffs
    const detailedDiff = response.getDetaileddiffMap();
    expect(detailedDiff.get("composeYaml")).toBeDefined();
  });

  it("treats empty override as no override (no false diff)", async () => {
    const olds = {
      name: "test",
      composeYaml: "services:\n  web:\n    image: nginx",
      running: true,
      composeOverride: "",
    };
    const news = {
      name: "test",
      composeYaml: "services:\n  web:\n    image: nginx",
      running: true,
    };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });

  it("treats empty envFile as no envFile (no false diff)", async () => {
    const olds = {
      name: "test",
      composeYaml: "version: '3'",
      running: true,
      envFile: "",
    };
    const news = {
      name: "test",
      composeYaml: "version: '3'",
      running: true,
    };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(stackResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });
});

describe("stack create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const inputs = { name: "web", composeYaml: "version: '3'", running: true };
    const call = makeCreateCall(inputs, true);
    const { err, response } = await callHandler(stackResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("web");
    const props = response.getProperties().toJavaScript();
    expect(props.name).toBe("web");
    expect(props.status).toBe("unknown");
    expect(props.containers).toEqual([]);
    expect(homelabClient.createStack).not.toHaveBeenCalled();
  });

  it("creates stack with running=true", async () => {
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '3'", envFile: "", containers: [{ name: "web-1", status: "running" }] };
    homelabClient.createStack.mockResolvedValue(stackInfo);

    const inputs = { name: "web", composeYaml: "version: '3'", envFile: "FOO=bar", running: true };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(stackResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("web");
    expect(homelabClient.createStack).toHaveBeenCalledWith("web", "version: '3'", "FOO=bar", true, undefined, undefined, undefined, undefined);
  });

  it("creates stack with running=false (no start)", async () => {
    const stackInfo = { name: "web", status: "stopped", composeYaml: "version: '3'", containers: [] };
    homelabClient.createStack.mockResolvedValue(stackInfo);

    const inputs = { name: "web", composeYaml: "version: '3'", running: false };
    const call = makeCreateCall(inputs);
    const { err } = await callHandler(stackResource.create, call);

    expect(err).toBeNull();
    expect(homelabClient.createStack).toHaveBeenCalledWith("web", "version: '3'", undefined, false, undefined, undefined, undefined, undefined);
  });

  it("returns error on API failure", async () => {
    homelabClient.createStack.mockRejectedValue(new Error("connection refused"));

    const inputs = { name: "web", composeYaml: "version: '3'", running: true };
    const call = makeCreateCall(inputs);
    const { err } = await callHandler(stackResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create stack");
  });
});

describe("stack read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads stack and returns outputs", async () => {
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '3'", envFile: "FOO=bar", autostart: true, displayName: "Web App", containers: [{ name: "web-1", status: "running" }] };
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const call = makeReadCall("web", { name: "web", composeYaml: "version: '3'", running: true });
    const { err, response } = await callHandler(stackResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("web");
    const props = response.getProperties().toJavaScript();
    expect(props.name).toBe("web");
    expect(props.status).toBe("running");
    expect(props.running).toBe(true);
    expect(props.composeYaml).toBe("version: '3'");
    expect(props.envFile).toBe("FOO=bar");
    expect(props.autostart).toBe(true);
    expect(props.displayName).toBe("Web App");
  });

  it("returns empty response on 404 (triggers recreation)", async () => {
    homelabClient.getStack.mockRejectedValue(new Error("Homelab API GET /api/stacks/gone failed (404): not found"));

    const call = makeReadCall("gone", { name: "gone" });
    const { err, response } = await callHandler(stackResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns empty response on 'not found' text", async () => {
    homelabClient.getStack.mockRejectedValue(new Error("resource not found"));

    const call = makeReadCall("gone", { name: "gone" });
    const { err, response } = await callHandler(stackResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on non-404 API failure", async () => {
    homelabClient.getStack.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("web", { name: "web" });
    const { err } = await callHandler(stackResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read stack");
  });

  it("sets running based on status", async () => {
    const stackInfo = { name: "web", status: "stopped", composeYaml: "version: '3'", containers: [] };
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const call = makeReadCall("web", { name: "web" });
    const { response } = await callHandler(stackResource.read, call);

    const props = response.getProperties().toJavaScript();
    expect(props.running).toBe(false);
  });

  it("treats partial status as running", async () => {
    const stackInfo = { name: "web", status: "partial", composeYaml: "version: '3'", containers: [] };
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const call = makeReadCall("web", { name: "web" });
    const { response } = await callHandler(stackResource.read, call);

    const props = response.getProperties().toJavaScript();
    expect(props.running).toBe(true);
  });
});

describe("stack update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const olds = { name: "web", composeYaml: "version: '3'", running: true, status: "running", containers: [{ name: "web-1" }] };
    const news = { name: "web", composeYaml: "version: '4'", running: true };
    const call = makeUpdateCall("web", olds, news, true);
    const { err, response } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    const props = response.getProperties().toJavaScript();
    expect(props.composeYaml).toBe("version: '4'");
    expect(props.status).toBe("running");
    expect(homelabClient.updateStack).not.toHaveBeenCalled();
  });

  it("calls updateStack when compose changed", async () => {
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '4'", containers: [] };
    homelabClient.updateStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: true };
    const news = { name: "web", composeYaml: "version: '4'", running: true };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.updateStack).toHaveBeenCalled();
  });

  it("calls startStack when running changed from false to true", async () => {
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '3'", containers: [] };
    homelabClient.startStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: false };
    const news = { name: "web", composeYaml: "version: '3'", running: true };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.startStack).toHaveBeenCalledWith("web");
    expect(homelabClient.stopStack).not.toHaveBeenCalled();
  });

  it("calls stopStack when running changed from true to false", async () => {
    const stackInfo = { name: "web", status: "stopped", composeYaml: "version: '3'", containers: [] };
    homelabClient.stopStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: true };
    const news = { name: "web", composeYaml: "version: '3'", running: false };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.stopStack).toHaveBeenCalledWith("web");
    expect(homelabClient.startStack).not.toHaveBeenCalled();
  });

  it("calls updateStack when envFile changed", async () => {
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '3'", containers: [] };
    homelabClient.updateStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: true, envFile: "FOO=bar" };
    const news = { name: "web", composeYaml: "version: '3'", running: true, envFile: "FOO=baz" };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.updateStack).toHaveBeenCalled();
  });

  it("calls updateStack when composeOverride changed", async () => {
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '3'", containers: [] };
    homelabClient.updateStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: true };
    const news = { name: "web", composeYaml: "version: '3'", running: true, composeOverride: "services:\n  web:\n    ports:\n      - '8080:80'" };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.updateStack).toHaveBeenCalled();
  });

  it("handles combined compose and running change", async () => {
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '4'", containers: [] };
    homelabClient.updateStack.mockResolvedValue(stackInfo);
    homelabClient.startStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: false };
    const news = { name: "web", composeYaml: "version: '4'", running: true };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.updateStack).toHaveBeenCalled();
    expect(homelabClient.startStack).toHaveBeenCalledWith("web");
  });

  it("skips updateStack when only running changed", async () => {
    const stackInfo = { name: "web", status: "stopped", composeYaml: "version: '3'", containers: [] };
    homelabClient.stopStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: true };
    const news = { name: "web", composeYaml: "version: '3'", running: false };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.updateStack).not.toHaveBeenCalled();
    expect(homelabClient.stopStack).toHaveBeenCalledWith("web");
  });

  it("calls updateStack when autostart changed", async () => {
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '3'", containers: [] };
    homelabClient.updateStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: true, autostart: false };
    const news = { name: "web", composeYaml: "version: '3'", running: true, autostart: true };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.updateStack).toHaveBeenCalled();
  });

  it("calls updateStack when displayName changed", async () => {
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '3'", containers: [] };
    homelabClient.updateStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: true, displayName: "Old" };
    const news = { name: "web", composeYaml: "version: '3'", running: true, displayName: "New" };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.updateStack).toHaveBeenCalled();
  });

  it("preserves explicit empty envFile in output after update", async () => {
    // Server still reports old envFile, but user explicitly cleared it
    const stackInfo = { name: "web", status: "running", composeYaml: "version: '3'", envFile: "FOO=bar", containers: [] };
    homelabClient.updateStack.mockResolvedValue(stackInfo);
    homelabClient.getStack.mockResolvedValue(stackInfo);

    const olds = { name: "web", composeYaml: "version: '3'", running: true, envFile: "FOO=bar" };
    const news = { name: "web", composeYaml: "version: '3'", running: true, envFile: "" };
    const call = makeUpdateCall("web", olds, news);
    const { err, response } = await callHandler(stackResource.update, call);

    expect(err).toBeNull();
    const props = response.getProperties().toJavaScript();
    expect(props.envFile).toBe("");
  });

  it("returns error on API failure", async () => {
    homelabClient.updateStack.mockRejectedValue(new Error("server error"));

    const olds = { name: "web", composeYaml: "version: '3'", running: true };
    const news = { name: "web", composeYaml: "version: '4'", running: true };
    const call = makeUpdateCall("web", olds, news);
    const { err } = await callHandler(stackResource.update, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to update stack");
  });
});

describe("stack delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes stack successfully", async () => {
    homelabClient.deleteStack.mockResolvedValue(undefined);

    const call = makeDeleteCall("web");
    const { err } = await callHandler(stackResource.delete, call);

    expect(err).toBeNull();
    expect(homelabClient.deleteStack).toHaveBeenCalledWith("web");
  });

  it("ignores 404 on delete (already gone)", async () => {
    homelabClient.deleteStack.mockRejectedValue(new Error("Homelab API DELETE failed (404): not found"));

    const call = makeDeleteCall("gone");
    const { err } = await callHandler(stackResource.delete, call);

    expect(err).toBeNull();
  });

  it("ignores 'not found' text on delete", async () => {
    homelabClient.deleteStack.mockRejectedValue(new Error("resource not found"));

    const call = makeDeleteCall("gone");
    const { err } = await callHandler(stackResource.delete, call);

    expect(err).toBeNull();
  });

  it("returns error on non-404 failure", async () => {
    homelabClient.deleteStack.mockRejectedValue(new Error("connection refused"));

    const call = makeDeleteCall("web");
    const { err } = await callHandler(stackResource.delete, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to delete stack");
  });
});
