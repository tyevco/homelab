import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { lxcContainerResource } from "../src/resources/lxcContainer";

jest.mock("../src/homelabClient", () => ({
  ensureConfigured: jest.fn(),
  createLxcContainer: jest.fn(),
  cloneLxcContainer: jest.fn(),
  getLxcContainer: jest.fn(),
  saveLxcConfig: jest.fn(),
  startLxcContainer: jest.fn(),
  stopLxcContainer: jest.fn(),
  deleteLxcContainer: jest.fn(),
}));

const homelabClient = require("../src/homelabClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("lxcContainer check", () => {
  it("returns failure when name is missing", async () => {
    const call = makeCheckCall({ dist: "ubuntu", release: "jammy", arch: "amd64" });
    const { err, response } = await callHandler(lxcContainerResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("name");
  });

  it("returns failure when name has invalid characters", async () => {
    const call = makeCheckCall({ name: "INVALID NAME!", dist: "ubuntu", release: "jammy", arch: "amd64" });
    const { err, response } = await callHandler(lxcContainerResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("name");
    expect(failures[0].getReason()).toContain("must match");
  });

  it("returns failure when dist is missing", async () => {
    const call = makeCheckCall({ name: "test", release: "jammy", arch: "amd64" });
    const { err, response } = await callHandler(lxcContainerResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("dist");
  });

  it("returns failure when release is missing", async () => {
    const call = makeCheckCall({ name: "test", dist: "ubuntu", arch: "amd64" });
    const { err, response } = await callHandler(lxcContainerResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("release");
  });

  it("returns failure when arch is missing", async () => {
    const call = makeCheckCall({ name: "test", dist: "ubuntu", release: "jammy" });
    const { err, response } = await callHandler(lxcContainerResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("arch");
  });

  it("returns multiple failures when all required fields missing", async () => {
    const call = makeCheckCall({});
    const { err, response } = await callHandler(lxcContainerResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(4);
    const props = failures.map((f: any) => f.getProperty());
    expect(props).toContain("name");
    expect(props).toContain("dist");
    expect(props).toContain("release");
    expect(props).toContain("arch");
  });

  it("skips dist/release/arch requirement when sourceContainer is set", async () => {
    const call = makeCheckCall({ name: "new-ct", sourceContainer: "base" });
    const { err, response } = await callHandler(lxcContainerResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(0);
  });

  it("returns failure when sourceContainer has invalid characters", async () => {
    const call = makeCheckCall({ name: "new-ct", sourceContainer: "INVALID NAME!" });
    const { response } = await callHandler(lxcContainerResource.check, call);

    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("sourceContainer");
  });

  it("returns failure when snapshotName has invalid characters", async () => {
    const call = makeCheckCall({ name: "new-ct", sourceContainer: "base", snapshotName: "INVALID SNAP!" });
    const { response } = await callHandler(lxcContainerResource.check, call);

    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("snapshotName");
  });

  it("returns failure when snapshotName is set without sourceContainer", async () => {
    const call = makeCheckCall({ name: "test", dist: "ubuntu", release: "jammy", arch: "amd64", snapshotName: "snap0" });
    const { response } = await callHandler(lxcContainerResource.check, call);

    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("snapshotName");
    expect(failures[0].getReason()).toContain("sourceContainer");
  });

  it("accepts valid snapshotName with sourceContainer", async () => {
    const call = makeCheckCall({ name: "new-ct", sourceContainer: "base", snapshotName: "snap0" });
    const { response } = await callHandler(lxcContainerResource.check, call);

    expect(response.getFailuresList().length).toBe(0);
  });

  it("defaults autostart to false", async () => {
    const call = makeCheckCall({ name: "test", dist: "ubuntu", release: "jammy", arch: "amd64" });
    const { response } = await callHandler(lxcContainerResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.autostart).toBe(false);
  });

  it("preserves explicit autostart value", async () => {
    const call = makeCheckCall({ name: "test", dist: "ubuntu", release: "jammy", arch: "amd64", autostart: true });
    const { response } = await callHandler(lxcContainerResource.check, call);

    const inputs = response.getInputs().toJavaScript();
    expect(inputs.autostart).toBe(true);
  });

  it("returns no failures when all required fields are present", async () => {
    const call = makeCheckCall({ name: "test", dist: "ubuntu", release: "jammy", arch: "amd64" });
    const { err, response } = await callHandler(lxcContainerResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });
});

describe("lxcContainer diff", () => {
  it("returns DIFF_NONE when no fields changed", async () => {
    const props = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64", autostart: false };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("marks name change as UPDATE_REPLACE", async () => {
    const olds = { name: "old", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const news = { name: "new", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("name");
    expect(response.getReplacesList()).toContain("name");
  });

  it("marks dist change as UPDATE_REPLACE", async () => {
    const olds = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const news = { name: "test", dist: "debian", release: "jammy", arch: "amd64" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getReplacesList()).toContain("dist");
  });

  it("marks release change as UPDATE_REPLACE", async () => {
    const olds = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const news = { name: "test", dist: "ubuntu", release: "noble", arch: "amd64" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getReplacesList()).toContain("release");
  });

  it("marks arch change as UPDATE_REPLACE", async () => {
    const olds = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const news = { name: "test", dist: "ubuntu", release: "jammy", arch: "arm64" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getReplacesList()).toContain("arch");
  });

  it("marks config change as UPDATE (not replace)", async () => {
    const olds = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64", config: "old" };
    const news = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64", config: "new" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("config");
    expect(response.getReplacesList()).not.toContain("config");
  });

  it("marks autostart change as UPDATE_REPLACE", async () => {
    const olds = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64", autostart: false };
    const news = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64", autostart: true };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("autostart");
    expect(response.getReplacesList()).toContain("autostart");
  });

  it("marks snapshotName change as UPDATE_REPLACE", async () => {
    const olds = { name: "test", sourceContainer: "base", snapshotName: "snap0" };
    const news = { name: "test", sourceContainer: "base", snapshotName: "snap1" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("snapshotName");
    expect(response.getReplacesList()).toContain("snapshotName");
  });

  it("detects multiple changes", async () => {
    const olds = { name: "old", dist: "ubuntu", release: "jammy", arch: "amd64", config: "a" };
    const news = { name: "new", dist: "debian", release: "bookworm", arch: "arm64", config: "b" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    const diffs = response.getDiffsList();
    expect(diffs).toContain("name");
    expect(diffs).toContain("dist");
    expect(diffs).toContain("release");
    expect(diffs).toContain("arch");
    expect(diffs).toContain("config");
  });

  it("skips when both old and new config are undefined", async () => {
    const olds = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const news = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(lxcContainerResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });
});

describe("lxcContainer create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const inputs = { name: "test", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const call = makeCreateCall(inputs, true);
    const { err, response } = await callHandler(lxcContainerResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("test");
    const props = response.getProperties().toJavaScript();
    expect(props.name).toBe("test");
    expect(props.status).toBe(0);
    expect(props.stateText).toBe("unknown");
    expect(props.ip).toBe("");
    expect(homelabClient.createLxcContainer).not.toHaveBeenCalled();
  });

  it("creates container, starts it, and returns outputs", async () => {
    const containerInfo = { name: "myct", status: 3, ip: "10.0.0.5", autostart: false, pid: 123, memory: "512MB", config: "" };
    homelabClient.createLxcContainer.mockResolvedValue(undefined);
    homelabClient.startLxcContainer.mockResolvedValue(undefined);
    homelabClient.getLxcContainer.mockResolvedValue(containerInfo);

    const inputs = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(lxcContainerResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("myct");
    expect(homelabClient.createLxcContainer).toHaveBeenCalledWith("myct", "ubuntu", "jammy", "amd64");
    expect(homelabClient.startLxcContainer).toHaveBeenCalledWith("myct");
    expect(homelabClient.getLxcContainer).toHaveBeenCalledWith("myct");
    expect(homelabClient.saveLxcConfig).not.toHaveBeenCalled();
  });

  it("saves config before starting when config is provided", async () => {
    const containerInfo = { name: "myct", status: 3, ip: "10.0.0.5", autostart: false, pid: 123, memory: "512MB", config: "lxc.net.0.type = veth" };
    homelabClient.createLxcContainer.mockResolvedValue(undefined);
    homelabClient.saveLxcConfig.mockResolvedValue(undefined);
    homelabClient.startLxcContainer.mockResolvedValue(undefined);
    homelabClient.getLxcContainer.mockResolvedValue(containerInfo);

    const inputs = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64", config: "lxc.net.0.type = veth" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(lxcContainerResource.create, call);

    expect(err).toBeNull();
    expect(homelabClient.saveLxcConfig).toHaveBeenCalledWith("myct", "lxc.net.0.type = veth");

    // Verify order: create → config → start
    const createOrder = homelabClient.createLxcContainer.mock.invocationCallOrder[0];
    const configOrder = homelabClient.saveLxcConfig.mock.invocationCallOrder[0];
    const startOrder = homelabClient.startLxcContainer.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(configOrder);
    expect(configOrder).toBeLessThan(startOrder);
  });

  it("returns error on API failure", async () => {
    homelabClient.createLxcContainer.mockRejectedValue(new Error("connection refused"));

    const inputs = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64" };
    const call = makeCreateCall(inputs);
    const { err } = await callHandler(lxcContainerResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create LXC container");
    expect(err.message).toContain("connection refused");
  });

  it("uses cloneLxcContainer instead of create when sourceContainer is set", async () => {
    const containerInfo = { name: "new-ct", status: 3, ip: "10.0.0.6", autostart: false, pid: 789, memory: "256MB", config: "" };
    homelabClient.cloneLxcContainer.mockResolvedValue(undefined);
    homelabClient.startLxcContainer.mockResolvedValue(undefined);
    homelabClient.getLxcContainer.mockResolvedValue(containerInfo);

    const inputs = { name: "new-ct", sourceContainer: "base" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(lxcContainerResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("new-ct");
    expect(homelabClient.cloneLxcContainer).toHaveBeenCalledWith("base", "new-ct", undefined, undefined);
    expect(homelabClient.createLxcContainer).not.toHaveBeenCalled();
    expect(homelabClient.startLxcContainer).toHaveBeenCalledWith("new-ct");
  });

  it("passes initialConfig to cloneLxcContainer when provided", async () => {
    const containerInfo = { name: "new-ct", status: 3, ip: "10.0.0.6", autostart: false, pid: 789, memory: "256MB", config: "" };
    homelabClient.cloneLxcContainer.mockResolvedValue(undefined);
    homelabClient.startLxcContainer.mockResolvedValue(undefined);
    homelabClient.getLxcContainer.mockResolvedValue(containerInfo);

    const inputs = { name: "new-ct", sourceContainer: "base", initialConfig: "lxc.net.0.type = veth" };
    const call = makeCreateCall(inputs);
    await callHandler(lxcContainerResource.create, call);

    expect(homelabClient.cloneLxcContainer).toHaveBeenCalledWith("base", "new-ct", undefined, "lxc.net.0.type = veth");
  });

  it("passes snapshotName to cloneLxcContainer when provided", async () => {
    const containerInfo = { name: "new-ct", status: 3, ip: "10.0.0.6", autostart: false, pid: 789, memory: "256MB", config: "" };
    homelabClient.cloneLxcContainer.mockResolvedValue(undefined);
    homelabClient.startLxcContainer.mockResolvedValue(undefined);
    homelabClient.getLxcContainer.mockResolvedValue(containerInfo);

    const inputs = { name: "new-ct", sourceContainer: "base", snapshotName: "snap0" };
    const call = makeCreateCall(inputs);
    await callHandler(lxcContainerResource.create, call);

    expect(homelabClient.cloneLxcContainer).toHaveBeenCalledWith("base", "new-ct", "snap0", undefined);
  });

  it("passes both snapshotName and initialConfig to cloneLxcContainer", async () => {
    const containerInfo = { name: "new-ct", status: 3, ip: "10.0.0.6", autostart: false, pid: 789, memory: "256MB", config: "" };
    homelabClient.cloneLxcContainer.mockResolvedValue(undefined);
    homelabClient.startLxcContainer.mockResolvedValue(undefined);
    homelabClient.getLxcContainer.mockResolvedValue(containerInfo);

    const inputs = { name: "new-ct", sourceContainer: "base", snapshotName: "snap0", initialConfig: "lxc.net.0.type = veth" };
    const call = makeCreateCall(inputs);
    await callHandler(lxcContainerResource.create, call);

    expect(homelabClient.cloneLxcContainer).toHaveBeenCalledWith("base", "new-ct", "snap0", "lxc.net.0.type = veth");
  });
});

describe("lxcContainer read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads container and returns outputs", async () => {
    const containerInfo = { name: "myct", status: 3, ip: "10.0.0.5", autostart: true, pid: 456, memory: "256MB", config: "lxc.net.0.type = veth" };
    homelabClient.getLxcContainer.mockResolvedValue(containerInfo);

    const call = makeReadCall("myct", { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64" });
    const { err, response } = await callHandler(lxcContainerResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("myct");
    const props = response.getProperties().toJavaScript();
    expect(props.name).toBe("myct");
    expect(props.status).toBe(3);
    expect(props.stateText).toBe("running");
    expect(props.ip).toBe("10.0.0.5");
    expect(props.dist).toBe("ubuntu");
    expect(props.release).toBe("jammy");
    expect(props.arch).toBe("amd64");
  });

  it("returns empty response on 404 (triggers recreation)", async () => {
    homelabClient.getLxcContainer.mockRejectedValue(new Error("Homelab API GET /api/lxc/gone failed (404): not found"));

    const call = makeReadCall("gone", { name: "gone", dist: "ubuntu", release: "jammy", arch: "amd64" });
    const { err, response } = await callHandler(lxcContainerResource.read, call);

    expect(err).toBeNull();
    // Empty response (no id set) signals resource was deleted externally
    expect(response.getId()).toBeFalsy();
  });

  it("returns empty response on 'not found' text", async () => {
    homelabClient.getLxcContainer.mockRejectedValue(new Error("resource not found"));

    const call = makeReadCall("gone", { name: "gone", dist: "ubuntu", release: "jammy", arch: "amd64" });
    const { err, response } = await callHandler(lxcContainerResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on non-404 API failure", async () => {
    homelabClient.getLxcContainer.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("myct", { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64" });
    const { err } = await callHandler(lxcContainerResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read LXC container");
  });
});

describe("lxcContainer update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const olds = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64", config: "old", status: 3, ip: "10.0.0.5", pid: 123, memory: "512MB" };
    const news = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64", config: "new" };
    const call = makeUpdateCall("myct", olds, news, true);
    const { err, response } = await callHandler(lxcContainerResource.update, call);

    expect(err).toBeNull();
    const props = response.getProperties().toJavaScript();
    expect(props.config).toBe("new");
    expect(props.status).toBe(3);
    expect(homelabClient.saveLxcConfig).not.toHaveBeenCalled();
  });

  it("calls saveLxcConfig when config changed", async () => {
    const containerInfo = { name: "myct", status: 3, ip: "10.0.0.5", autostart: false, pid: 123, memory: "512MB", config: "new-config" };
    homelabClient.saveLxcConfig.mockResolvedValue(containerInfo);
    homelabClient.getLxcContainer.mockResolvedValue(containerInfo);

    const olds = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64", config: "old-config" };
    const news = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64", config: "new-config" };
    const call = makeUpdateCall("myct", olds, news);
    const { err, response } = await callHandler(lxcContainerResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.saveLxcConfig).toHaveBeenCalledWith("myct", "new-config");
    expect(homelabClient.getLxcContainer).toHaveBeenCalledWith("myct");
  });

  it("skips saveLxcConfig when config unchanged", async () => {
    const containerInfo = { name: "myct", status: 3, ip: "10.0.0.5", autostart: false, pid: 123, memory: "512MB", config: "same" };
    homelabClient.getLxcContainer.mockResolvedValue(containerInfo);

    const olds = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64", config: "same" };
    const news = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64", config: "same" };
    const call = makeUpdateCall("myct", olds, news);
    const { err } = await callHandler(lxcContainerResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.saveLxcConfig).not.toHaveBeenCalled();
  });

  it("returns error on API failure", async () => {
    homelabClient.saveLxcConfig.mockRejectedValue(new Error("server error"));

    const olds = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64", config: "old" };
    const news = { name: "myct", dist: "ubuntu", release: "jammy", arch: "amd64", config: "new" };
    const call = makeUpdateCall("myct", olds, news);
    const { err } = await callHandler(lxcContainerResource.update, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to update LXC container");
  });
});

describe("lxcContainer delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stops container before deleting", async () => {
    homelabClient.stopLxcContainer.mockResolvedValue(undefined);
    homelabClient.deleteLxcContainer.mockResolvedValue(undefined);

    const call = makeDeleteCall("myct");
    const { err } = await callHandler(lxcContainerResource.delete, call);

    expect(err).toBeNull();
    expect(homelabClient.stopLxcContainer).toHaveBeenCalledWith("myct");
    expect(homelabClient.deleteLxcContainer).toHaveBeenCalledWith("myct");

    // Verify order: stop before delete
    const stopOrder = homelabClient.stopLxcContainer.mock.invocationCallOrder[0];
    const deleteOrder = homelabClient.deleteLxcContainer.mock.invocationCallOrder[0];
    expect(stopOrder).toBeLessThan(deleteOrder);
  });

  it("proceeds with delete even if stop fails (container already stopped)", async () => {
    homelabClient.stopLxcContainer.mockRejectedValue(new Error("container not running"));
    homelabClient.deleteLxcContainer.mockResolvedValue(undefined);

    const call = makeDeleteCall("myct");
    const { err } = await callHandler(lxcContainerResource.delete, call);

    expect(err).toBeNull();
    expect(homelabClient.stopLxcContainer).toHaveBeenCalledWith("myct");
    expect(homelabClient.deleteLxcContainer).toHaveBeenCalledWith("myct");
  });

  it("ignores 404 on delete (already gone)", async () => {
    homelabClient.stopLxcContainer.mockResolvedValue(undefined);
    homelabClient.deleteLxcContainer.mockRejectedValue(new Error("Homelab API DELETE failed (404): not found"));

    const call = makeDeleteCall("gone");
    const { err } = await callHandler(lxcContainerResource.delete, call);

    expect(err).toBeNull();
  });

  it("ignores 'not found' text on delete", async () => {
    homelabClient.stopLxcContainer.mockResolvedValue(undefined);
    homelabClient.deleteLxcContainer.mockRejectedValue(new Error("resource not found"));

    const call = makeDeleteCall("gone");
    const { err } = await callHandler(lxcContainerResource.delete, call);

    expect(err).toBeNull();
  });

  it("returns error on non-404 failure", async () => {
    homelabClient.stopLxcContainer.mockResolvedValue(undefined);
    homelabClient.deleteLxcContainer.mockRejectedValue(new Error("connection refused"));

    const call = makeDeleteCall("myct");
    const { err } = await callHandler(lxcContainerResource.delete, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to delete LXC container");
  });
});
