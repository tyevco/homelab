import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { notificationSettingsResource } from "../src/resources/notificationSettings";

jest.mock("../src/homelabClient", () => ({
  ensureConfigured: jest.fn(),
  getNotificationSettings: jest.fn(),
  saveNotificationSettings: jest.fn(),
}));

const homelabClient = require("../src/homelabClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("notificationSettings check", () => {
  it("returns no failures when no inputs provided (all optional)", async () => {
    const call = makeCheckCall({});
    const { err, response } = await callHandler(notificationSettingsResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("returns failure when ntfyEnabled is true but ntfyUrl is missing", async () => {
    const call = makeCheckCall({ ntfyEnabled: true });
    const { response } = await callHandler(notificationSettingsResource.check, call);

    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("ntfyUrl");
  });

  it("returns failure when discordEnabled is true but discordWebhookUrl is missing", async () => {
    const call = makeCheckCall({ discordEnabled: true });
    const { response } = await callHandler(notificationSettingsResource.check, call);

    const failures = response.getFailuresList();
    expect(failures.some((f: any) => f.getProperty() === "discordWebhookUrl")).toBe(true);
  });

  it("returns failures for gotify when enabled without url and token", async () => {
    const call = makeCheckCall({ gotifyEnabled: true });
    const { response } = await callHandler(notificationSettingsResource.check, call);

    const failures = response.getFailuresList();
    const props = failures.map((f: any) => f.getProperty());
    expect(props).toContain("gotifyUrl");
    expect(props).toContain("gotifyToken");
  });

  it("returns failure when webhookEnabled is true but webhookUrl is missing", async () => {
    const call = makeCheckCall({ webhookEnabled: true });
    const { response } = await callHandler(notificationSettingsResource.check, call);

    const failures = response.getFailuresList();
    expect(failures.some((f: any) => f.getProperty() === "webhookUrl")).toBe(true);
  });

  it("returns no failures with all fields valid", async () => {
    const call = makeCheckCall({
      ntfyEnabled: true,
      ntfyUrl: "https://ntfy.sh/topic",
      discordEnabled: true,
      discordWebhookUrl: "https://discord.com/api/webhooks/...",
    });
    const { response } = await callHandler(notificationSettingsResource.check, call);

    expect(response.getFailuresList().length).toBe(0);
  });
});

describe("notificationSettings diff", () => {
  it("returns DIFF_NONE when no fields changed", async () => {
    const props = { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(notificationSettingsResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
  });

  it("detects field change as UPDATE (not replace)", async () => {
    const olds = { ntfyEnabled: false, ntfyUrl: "" };
    const news = { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(notificationSettingsResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("ntfyEnabled");
    expect(response.getDiffsList()).toContain("ntfyUrl");
    expect(response.getReplacesList().length).toBe(0);
  });
});

describe("notificationSettings create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const inputs = { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" };
    const call = makeCreateCall(inputs, true);
    const { err, response } = await callHandler(notificationSettingsResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("notification-settings");
    expect(homelabClient.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it("saves settings and returns singleton id", async () => {
    const settings = { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" };
    homelabClient.saveNotificationSettings.mockResolvedValue(settings);

    const call = makeCreateCall(settings);
    const { err, response } = await callHandler(notificationSettingsResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("notification-settings");
    expect(homelabClient.saveNotificationSettings).toHaveBeenCalledWith(settings);
    const props = response.getProperties().toJavaScript();
    expect(props.ntfyUrl).toBe("https://ntfy.sh/topic");
  });

  it("returns error on API failure", async () => {
    homelabClient.saveNotificationSettings.mockRejectedValue(new Error("server error"));

    const call = makeCreateCall({ ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" });
    const { err } = await callHandler(notificationSettingsResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create notification settings");
  });
});

describe("notificationSettings read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads settings and returns current values", async () => {
    const settings = { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic", discordEnabled: false };
    homelabClient.getNotificationSettings.mockResolvedValue(settings);

    const call = makeReadCall("notification-settings");
    const { err, response } = await callHandler(notificationSettingsResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("notification-settings");
    const props = response.getProperties().toJavaScript();
    expect(props.ntfyUrl).toBe("https://ntfy.sh/topic");
  });

  it("returns error on API failure", async () => {
    homelabClient.getNotificationSettings.mockRejectedValue(new Error("server error"));

    const call = makeReadCall("notification-settings");
    const { err } = await callHandler(notificationSettingsResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read notification settings");
  });
});

describe("notificationSettings update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const olds = { ntfyEnabled: false };
    const news = { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" };
    const call = makeUpdateCall("notification-settings", olds, news, true);
    const { err, response } = await callHandler(notificationSettingsResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it("saves updated settings", async () => {
    const settings = { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" };
    homelabClient.saveNotificationSettings.mockResolvedValue(settings);

    const olds = { ntfyEnabled: false };
    const call = makeUpdateCall("notification-settings", olds, settings);
    const { err } = await callHandler(notificationSettingsResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.saveNotificationSettings).toHaveBeenCalledWith(settings);
  });
});

describe("notificationSettings delete", () => {
  it("is a no-op and returns success", async () => {
    const call = makeDeleteCall("notification-settings");
    const { err } = await callHandler(notificationSettingsResource.delete, call);

    expect(err).toBeNull();
  });
});
