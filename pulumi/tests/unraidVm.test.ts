import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { unraidVmResource } from "../src/resources/unraidVm";

jest.mock("../src/homelabClient", () => ({
  ensureConfigured: jest.fn(),
  listUnraidVms: jest.fn(),
  startUnraidVm: jest.fn(),
  stopUnraidVm: jest.fn(),
}));

const homelabClient = require("../src/homelabClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("unraidVm check", () => {
  it("returns failure when name is missing", async () => {
    const call = makeCheckCall({ endpoint: "unraid-agent" });
    const { response } = await callHandler(unraidVmResource.check, call);

    const failures = response.getFailuresList();
    expect(failures.some((f: any) => f.getProperty() === "name")).toBe(true);
  });

  it("returns failure when endpoint is missing", async () => {
    const call = makeCheckCall({ name: "ubuntu" });
    const { response } = await callHandler(unraidVmResource.check, call);

    const failures = response.getFailuresList();
    expect(failures.some((f: any) => f.getProperty() === "endpoint")).toBe(true);
  });

  it("returns no failures with valid inputs", async () => {
    const call = makeCheckCall({ name: "ubuntu", endpoint: "unraid-agent" });
    const { err, response } = await callHandler(unraidVmResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("defaults running to true", async () => {
    const call = makeCheckCall({ name: "ubuntu", endpoint: "unraid-agent" });
    const { response } = await callHandler(unraidVmResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.running).toBe(true);
  });

  it("preserves explicit running=false", async () => {
    const call = makeCheckCall({ name: "ubuntu", endpoint: "unraid-agent", running: false });
    const { response } = await callHandler(unraidVmResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.running).toBe(false);
  });
});

describe("unraidVm diff", () => {
  it("returns DIFF_NONE when nothing changed", async () => {
    const props = { name: "ubuntu", endpoint: "unraid-agent", running: true };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(unraidVmResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });

  it("marks name change as UPDATE_REPLACE", async () => {
    const olds = { name: "ubuntu", endpoint: "unraid-agent", running: true };
    const news = { name: "windows", endpoint: "unraid-agent", running: true };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(unraidVmResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getReplacesList()).toContain("name");
  });

  it("marks endpoint change as UPDATE_REPLACE", async () => {
    const olds = { name: "ubuntu", endpoint: "agent1", running: true };
    const news = { name: "ubuntu", endpoint: "agent2", running: true };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(unraidVmResource.diff, call);

    expect(response.getReplacesList()).toContain("endpoint");
  });

  it("marks running change as UPDATE (not replace)", async () => {
    const olds = { name: "ubuntu", endpoint: "unraid-agent", running: true };
    const news = { name: "ubuntu", endpoint: "unraid-agent", running: false };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(unraidVmResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("running");
    expect(response.getReplacesList()).not.toContain("running");
  });
});

describe("unraidVm create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const inputs = { name: "ubuntu", endpoint: "unraid-agent", running: true };
    const call = makeCreateCall(inputs, true);
    const { err, response } = await callHandler(unraidVmResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("ubuntu");
    const props = response.getProperties().toJavaScript();
    expect(props.state).toBe("unknown");
    expect(homelabClient.startUnraidVm).not.toHaveBeenCalled();
  });

  it("starts VM and returns state", async () => {
    homelabClient.startUnraidVm.mockResolvedValue(undefined);
    homelabClient.listUnraidVms.mockResolvedValue([
      { name: "ubuntu", state: "started" },
    ]);

    const inputs = { name: "ubuntu", endpoint: "unraid-agent", running: true };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(unraidVmResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("ubuntu");
    expect(homelabClient.startUnraidVm).toHaveBeenCalledWith("ubuntu", "unraid-agent");
    const props = response.getProperties().toJavaScript();
    expect(props.state).toBe("started");
  });

  it("does not start VM when running is false", async () => {
    homelabClient.listUnraidVms.mockResolvedValue([
      { name: "ubuntu", state: "stopped" },
    ]);

    const inputs = { name: "ubuntu", endpoint: "unraid-agent", running: false };
    const call = makeCreateCall(inputs);
    const { err } = await callHandler(unraidVmResource.create, call);

    expect(err).toBeNull();
    expect(homelabClient.startUnraidVm).not.toHaveBeenCalled();
  });

  it("returns error on API failure", async () => {
    homelabClient.startUnraidVm.mockRejectedValue(new Error("agent unreachable"));

    const inputs = { name: "ubuntu", endpoint: "unraid-agent", running: true };
    const call = makeCreateCall(inputs);
    const { err } = await callHandler(unraidVmResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create Unraid VM");
  });
});

describe("unraidVm read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads VM state and returns outputs", async () => {
    homelabClient.listUnraidVms.mockResolvedValue([
      { name: "ubuntu", state: "started" },
    ]);

    const call = makeReadCall("ubuntu", { name: "ubuntu", endpoint: "unraid-agent" });
    const { err, response } = await callHandler(unraidVmResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("ubuntu");
    const props = response.getProperties().toJavaScript();
    expect(props.state).toBe("started");
    expect(props.running).toBe(true);
  });

  it("returns empty response when VM not found (deleted externally)", async () => {
    homelabClient.listUnraidVms.mockResolvedValue([]);

    const call = makeReadCall("ubuntu", { name: "ubuntu", endpoint: "unraid-agent" });
    const { err, response } = await callHandler(unraidVmResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on API failure", async () => {
    homelabClient.listUnraidVms.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("ubuntu", { name: "ubuntu", endpoint: "unraid-agent" });
    const { err } = await callHandler(unraidVmResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read Unraid VM");
  });
});

describe("unraidVm update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const olds = { name: "ubuntu", endpoint: "unraid-agent", running: true, state: "started" };
    const news = { name: "ubuntu", endpoint: "unraid-agent", running: false };
    const call = makeUpdateCall("ubuntu", olds, news, true);
    const { err } = await callHandler(unraidVmResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.stopUnraidVm).not.toHaveBeenCalled();
  });

  it("stops VM when running changed to false", async () => {
    homelabClient.stopUnraidVm.mockResolvedValue(undefined);
    homelabClient.listUnraidVms.mockResolvedValue([{ name: "ubuntu", state: "stopped" }]);

    const olds = { name: "ubuntu", endpoint: "unraid-agent", running: true };
    const news = { name: "ubuntu", endpoint: "unraid-agent", running: false };
    const call = makeUpdateCall("ubuntu", olds, news);
    const { err } = await callHandler(unraidVmResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.stopUnraidVm).toHaveBeenCalledWith("ubuntu", "unraid-agent");
  });

  it("starts VM when running changed to true", async () => {
    homelabClient.startUnraidVm.mockResolvedValue(undefined);
    homelabClient.listUnraidVms.mockResolvedValue([{ name: "ubuntu", state: "started" }]);

    const olds = { name: "ubuntu", endpoint: "unraid-agent", running: false };
    const news = { name: "ubuntu", endpoint: "unraid-agent", running: true };
    const call = makeUpdateCall("ubuntu", olds, news);
    const { err } = await callHandler(unraidVmResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.startUnraidVm).toHaveBeenCalledWith("ubuntu", "unraid-agent");
  });
});

describe("unraidVm delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stops VM on delete", async () => {
    homelabClient.stopUnraidVm.mockResolvedValue(undefined);

    const call = makeDeleteCall("ubuntu");
    const { err } = await callHandler(unraidVmResource.delete, call);

    expect(err).toBeNull();
    expect(homelabClient.stopUnraidVm).toHaveBeenCalledWith("ubuntu", undefined);
  });

  it("ignores 404 on delete", async () => {
    homelabClient.stopUnraidVm.mockRejectedValue(new Error("API failed (404): not found"));

    const call = makeDeleteCall("ubuntu");
    const { err } = await callHandler(unraidVmResource.delete, call);

    expect(err).toBeNull();
  });

  it("returns error on non-404 failure", async () => {
    homelabClient.stopUnraidVm.mockRejectedValue(new Error("connection refused"));

    const call = makeDeleteCall("ubuntu");
    const { err } = await callHandler(unraidVmResource.delete, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to delete Unraid VM");
  });
});
