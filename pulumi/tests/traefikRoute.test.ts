import { makeCheckCall, makeDiffCall, makeCreateCall, makeReadCall, makeUpdateCall, makeDeleteCall, callHandler } from "./testUtils";
import { traefikRouteResource } from "../src/resources/traefikRoute";
import { traefikStaticConfigResource } from "../src/resources/traefikStaticConfig";

jest.mock("../src/homelabClient", () => ({
  ensureConfigured: jest.fn(),
  getTraefikRoute: jest.fn(),
  putTraefikRoute: jest.fn(),
  deleteTraefikRoute: jest.fn(),
  getTraefikStatic: jest.fn(),
  putTraefikStatic: jest.fn(),
}));

const homelabClient = require("../src/homelabClient");

const providerProto = require("@pulumi/pulumi/proto/provider_pb");

describe("TraefikRoute check", () => {
  it("returns failure when name is missing", async () => {
    const call = makeCheckCall({ content: "http:\n  routers: {}" });
    const { err, response } = await callHandler(traefikRouteResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("name");
  });

  it("returns failure when name has invalid characters", async () => {
    const call = makeCheckCall({ name: "My Route!", content: "http:\n  routers: {}" });
    const { err, response } = await callHandler(traefikRouteResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("name");
    expect(failures[0].getReason()).toContain("^[a-z0-9_-]+$");
  });

  it("returns failure when content is missing", async () => {
    const call = makeCheckCall({ name: "my-route" });
    const { err, response } = await callHandler(traefikRouteResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("content");
  });

  it("returns failure when content is invalid YAML", async () => {
    const call = makeCheckCall({ name: "my-route", content: "key: [unterminated" });
    const { err, response } = await callHandler(traefikRouteResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("content");
    expect(failures[0].getReason()).toContain("Invalid YAML");
  });

  it("returns no failures with valid inputs", async () => {
    const call = makeCheckCall({ name: "my-route", content: "http:\n  routers: {}" });
    const { err, response } = await callHandler(traefikRouteResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });

  it("accepts name with hyphens, underscores, and digits", async () => {
    const call = makeCheckCall({ name: "route-1_test", content: "key: value" });
    const { err, response } = await callHandler(traefikRouteResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });
});

describe("TraefikRoute diff", () => {
  it("returns DIFF_NONE when no fields changed", async () => {
    const props = { name: "my-route", content: "http:\n  routers: {}" };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(traefikRouteResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("detects name change as UPDATE_REPLACE", async () => {
    const olds = { name: "old-route", content: "http:\n  routers: {}" };
    const news = { name: "new-route", content: "http:\n  routers: {}" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(traefikRouteResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getReplacesList()).toContain("name");
    const detailedDiff = response.getDetaileddiffMap();
    const nameDiff = detailedDiff.get("name");
    expect(nameDiff).toBeDefined();
    expect(nameDiff.getKind()).toBe(providerProto.PropertyDiff.Kind.UPDATE_REPLACE);
  });

  it("detects content change with granular YAML paths", async () => {
    const olds = { name: "my-route", content: "http:\n  routers: {}" };
    const news = { name: "my-route", content: "http:\n  services: {}" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(traefikRouteResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("content");
    const detailedDiff = response.getDetaileddiffMap();
    // Granular paths instead of monolithic "content"
    expect(detailedDiff.get("content.http.services")).toBeDefined();
    expect(detailedDiff.get("content.http.services").getKind()).toBe(providerProto.PropertyDiff.Kind.ADD);
    expect(detailedDiff.get("content.http.routers")).toBeDefined();
    expect(detailedDiff.get("content.http.routers").getKind()).toBe(providerProto.PropertyDiff.Kind.DELETE);
  });

  it("produces multiple granular entries for nested changes", async () => {
    const olds = { name: "my-route", content: "http:\n  routers:\n    myapp:\n      rule: 'Host(`old.example.com`)'\n      service: myapp" };
    const news = { name: "my-route", content: "http:\n  routers:\n    myapp:\n      rule: 'Host(`new.example.com`)'\n      service: myapp-v2" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(traefikRouteResource.diff, call);

    const detailedDiff = response.getDetaileddiffMap();
    expect(detailedDiff.get("content.http.routers.myapp.rule")).toBeDefined();
    expect(detailedDiff.get("content.http.routers.myapp.rule").getKind()).toBe(providerProto.PropertyDiff.Kind.UPDATE);
    expect(detailedDiff.get("content.http.routers.myapp.service")).toBeDefined();
    expect(detailedDiff.get("content.http.routers.myapp.service").getKind()).toBe(providerProto.PropertyDiff.Kind.UPDATE);
  });

  it("falls back to monolithic content diff on invalid YAML", async () => {
    const olds = { name: "my-route", content: "valid: yaml" };
    const news = { name: "my-route", content: "key: [unterminated" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(traefikRouteResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    const detailedDiff = response.getDetaileddiffMap();
    expect(detailedDiff.get("content")).toBeDefined();
    expect(detailedDiff.get("content").getKind()).toBe(providerProto.PropertyDiff.Kind.UPDATE);
  });

  it("detects both name and content changed", async () => {
    const olds = { name: "old", content: "old: config" };
    const news = { name: "new", content: "new: config" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(traefikRouteResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("name");
    expect(response.getDiffsList()).toContain("content");
    expect(response.getReplacesList()).toContain("name");
  });
});

describe("TraefikStaticConfig check", () => {
  it("returns failure when content is missing", async () => {
    const call = makeCheckCall({});
    const { err, response } = await callHandler(traefikStaticConfigResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("content");
  });

  it("returns failure when content is invalid YAML", async () => {
    const call = makeCheckCall({ content: "key: [unterminated" });
    const { err, response } = await callHandler(traefikStaticConfigResource.check, call);

    expect(err).toBeNull();
    const failures = response.getFailuresList();
    expect(failures.length).toBe(1);
    expect(failures[0].getProperty()).toBe("content");
    expect(failures[0].getReason()).toContain("Invalid YAML");
  });

  it("returns no failures with valid content", async () => {
    const call = makeCheckCall({ content: "entryPoints:\n  web:\n    address: ':80'" });
    const { err, response } = await callHandler(traefikStaticConfigResource.check, call);

    expect(err).toBeNull();
    expect(response.getFailuresList().length).toBe(0);
  });
});

describe("TraefikStaticConfig diff", () => {
  it("returns DIFF_NONE when content unchanged", async () => {
    const props = { content: "entryPoints:\n  web:\n    address: ':80'" };
    const call = makeDiffCall(props, props);
    const { response } = await callHandler(traefikStaticConfigResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_NONE);
    expect(response.getDiffsList().length).toBe(0);
  });

  it("returns DIFF_SOME with granular path when content changed", async () => {
    const olds = { content: "entryPoints:\n  web:\n    address: ':80'" };
    const news = { content: "entryPoints:\n  web:\n    address: ':8080'" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(traefikStaticConfigResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    expect(response.getDiffsList()).toContain("content");
    const detailedDiff = response.getDetaileddiffMap();
    expect(detailedDiff.get("content.entryPoints.web.address")).toBeDefined();
    expect(detailedDiff.get("content.entryPoints.web.address").getKind()).toBe(providerProto.PropertyDiff.Kind.UPDATE);
  });

  it("falls back to monolithic content diff on invalid YAML", async () => {
    const olds = { content: "valid: yaml" };
    const news = { content: "key: [unterminated" };
    const call = makeDiffCall(olds, news);
    const { response } = await callHandler(traefikStaticConfigResource.diff, call);

    expect(response.getChanges()).toBe(providerProto.DiffResponse.DiffChanges.DIFF_SOME);
    const detailedDiff = response.getDetaileddiffMap();
    expect(detailedDiff.get("content")).toBeDefined();
    expect(detailedDiff.get("content").getKind()).toBe(providerProto.PropertyDiff.Kind.UPDATE);
  });
});

describe("TraefikRoute create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const inputs = { name: "my-route", content: "http:\n  routers: {}" };
    const call = makeCreateCall(inputs, true);
    const { err, response } = await callHandler(traefikRouteResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("my-route");
    const props = response.getProperties().toJavaScript();
    expect(props.name).toBe("my-route");
    expect(props.lastModified).toBe("");
    expect(homelabClient.putTraefikRoute).not.toHaveBeenCalled();
  });

  it("creates route via PUT and returns outputs", async () => {
    homelabClient.putTraefikRoute.mockResolvedValue({ name: "my-route", content: "http:\n  routers: {}", lastModified: "2026-01-01T00:00:00Z" });

    const inputs = { name: "my-route", content: "http:\n  routers: {}" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(traefikRouteResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("my-route");
    const props = response.getProperties().toJavaScript();
    expect(props.lastModified).toBe("2026-01-01T00:00:00Z");
    expect(homelabClient.putTraefikRoute).toHaveBeenCalledWith("my-route", "http:\n  routers: {}");
  });

  it("returns error on API failure", async () => {
    homelabClient.putTraefikRoute.mockRejectedValue(new Error("connection refused"));

    const inputs = { name: "my-route", content: "http:\n  routers: {}" };
    const call = makeCreateCall(inputs);
    const { err } = await callHandler(traefikRouteResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create traefik route");
  });
});

describe("TraefikRoute read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads route and returns outputs", async () => {
    homelabClient.getTraefikRoute.mockResolvedValue({ name: "my-route", content: "http:\n  routers: {}", lastModified: "2026-01-01T00:00:00Z" });

    const call = makeReadCall("my-route");
    const { err, response } = await callHandler(traefikRouteResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("my-route");
    const props = response.getProperties().toJavaScript();
    expect(props.name).toBe("my-route");
    expect(props.content).toBe("http:\n  routers: {}");
    expect(props.lastModified).toBe("2026-01-01T00:00:00Z");
  });

  it("returns empty response on 404", async () => {
    homelabClient.getTraefikRoute.mockRejectedValue(new Error("Homelab API GET failed (404): not found"));

    const call = makeReadCall("gone-route");
    const { err, response } = await callHandler(traefikRouteResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns empty response on 503 (service unavailable)", async () => {
    homelabClient.getTraefikRoute.mockRejectedValue(new Error("Homelab API GET failed (503): service unavailable"));

    const call = makeReadCall("my-route");
    const { err, response } = await callHandler(traefikRouteResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns empty response on 'not found' text", async () => {
    homelabClient.getTraefikRoute.mockRejectedValue(new Error("resource not found"));

    const call = makeReadCall("gone-route");
    const { err, response } = await callHandler(traefikRouteResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on non-404/503 failure", async () => {
    homelabClient.getTraefikRoute.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("my-route");
    const { err } = await callHandler(traefikRouteResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read traefik route");
  });
});

describe("TraefikRoute update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const olds = { name: "my-route", content: "old: config", lastModified: "2026-01-01T00:00:00Z" };
    const news = { name: "my-route", content: "new: config" };
    const call = makeUpdateCall("my-route", olds, news, true);
    const { err, response } = await callHandler(traefikRouteResource.update, call);

    expect(err).toBeNull();
    const props = response.getProperties().toJavaScript();
    expect(props.content).toBe("new: config");
    expect(props.lastModified).toBe("2026-01-01T00:00:00Z");
    expect(homelabClient.putTraefikRoute).not.toHaveBeenCalled();
  });

  it("updates route via PUT", async () => {
    homelabClient.putTraefikRoute.mockResolvedValue({ name: "my-route", content: "new: config", lastModified: "2026-02-01T00:00:00Z" });

    const olds = { name: "my-route", content: "old: config", lastModified: "2026-01-01T00:00:00Z" };
    const news = { name: "my-route", content: "new: config" };
    const call = makeUpdateCall("my-route", olds, news);
    const { err, response } = await callHandler(traefikRouteResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.putTraefikRoute).toHaveBeenCalledWith("my-route", "new: config");
    const props = response.getProperties().toJavaScript();
    expect(props.lastModified).toBe("2026-02-01T00:00:00Z");
  });

  it("returns error on API failure", async () => {
    homelabClient.putTraefikRoute.mockRejectedValue(new Error("server error"));

    const olds = { name: "my-route", content: "old: config" };
    const news = { name: "my-route", content: "new: config" };
    const call = makeUpdateCall("my-route", olds, news);
    const { err } = await callHandler(traefikRouteResource.update, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to update traefik route");
  });
});

describe("TraefikRoute delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes route successfully", async () => {
    homelabClient.deleteTraefikRoute.mockResolvedValue(undefined);

    const call = makeDeleteCall("my-route");
    const { err } = await callHandler(traefikRouteResource.delete, call);

    expect(err).toBeNull();
    expect(homelabClient.deleteTraefikRoute).toHaveBeenCalledWith("my-route");
  });

  it("ignores 404 on delete", async () => {
    homelabClient.deleteTraefikRoute.mockRejectedValue(new Error("Homelab API DELETE failed (404): not found"));

    const call = makeDeleteCall("gone-route");
    const { err } = await callHandler(traefikRouteResource.delete, call);

    expect(err).toBeNull();
  });

  it("ignores 'not found' text on delete", async () => {
    homelabClient.deleteTraefikRoute.mockRejectedValue(new Error("resource not found"));

    const call = makeDeleteCall("gone-route");
    const { err } = await callHandler(traefikRouteResource.delete, call);

    expect(err).toBeNull();
  });

  it("returns error on non-404 failure", async () => {
    homelabClient.deleteTraefikRoute.mockRejectedValue(new Error("connection refused"));

    const call = makeDeleteCall("my-route");
    const { err } = await callHandler(traefikRouteResource.delete, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to delete traefik route");
  });
});

describe("TraefikStaticConfig create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const inputs = { content: "entryPoints:\n  web:\n    address: ':80'" };
    const call = makeCreateCall(inputs, true);
    const { err, response } = await callHandler(traefikStaticConfigResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("traefik-static");
    const props = response.getProperties().toJavaScript();
    expect(props.lastModified).toBe("");
    expect(homelabClient.putTraefikStatic).not.toHaveBeenCalled();
  });

  it("creates static config via PUT", async () => {
    homelabClient.putTraefikStatic.mockResolvedValue({ content: "entryPoints:\n  web:\n    address: ':80'", lastModified: "2026-01-01T00:00:00Z" });

    const inputs = { content: "entryPoints:\n  web:\n    address: ':80'" };
    const call = makeCreateCall(inputs);
    const { err, response } = await callHandler(traefikStaticConfigResource.create, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("traefik-static");
    expect(homelabClient.putTraefikStatic).toHaveBeenCalledWith("entryPoints:\n  web:\n    address: ':80'");
  });

  it("returns error on API failure", async () => {
    homelabClient.putTraefikStatic.mockRejectedValue(new Error("connection refused"));

    const inputs = { content: "entryPoints:\n  web:\n    address: ':80'" };
    const call = makeCreateCall(inputs);
    const { err } = await callHandler(traefikStaticConfigResource.create, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to create traefik static config");
  });
});

describe("TraefikStaticConfig read", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads static config and returns outputs", async () => {
    homelabClient.getTraefikStatic.mockResolvedValue({ content: "entryPoints:\n  web:\n    address: ':80'", lastModified: "2026-01-01T00:00:00Z" });

    const call = makeReadCall("traefik-static");
    const { err, response } = await callHandler(traefikStaticConfigResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBe("traefik-static");
    const props = response.getProperties().toJavaScript();
    expect(props.content).toBe("entryPoints:\n  web:\n    address: ':80'");
  });

  it("returns empty response on 404", async () => {
    homelabClient.getTraefikStatic.mockRejectedValue(new Error("Homelab API GET failed (404): not found"));

    const call = makeReadCall("traefik-static");
    const { err, response } = await callHandler(traefikStaticConfigResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns empty response on 503", async () => {
    homelabClient.getTraefikStatic.mockRejectedValue(new Error("Homelab API GET failed (503): service unavailable"));

    const call = makeReadCall("traefik-static");
    const { err, response } = await callHandler(traefikStaticConfigResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns empty response on 'not found' text", async () => {
    homelabClient.getTraefikStatic.mockRejectedValue(new Error("resource not found"));

    const call = makeReadCall("traefik-static");
    const { err, response } = await callHandler(traefikStaticConfigResource.read, call);

    expect(err).toBeNull();
    expect(response.getId()).toBeFalsy();
  });

  it("returns error on non-404/503 failure", async () => {
    homelabClient.getTraefikStatic.mockRejectedValue(new Error("connection timeout"));

    const call = makeReadCall("traefik-static");
    const { err } = await callHandler(traefikStaticConfigResource.read, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to read traefik static config");
  });
});

describe("TraefikStaticConfig update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns preview outputs without calling API", async () => {
    const olds = { content: "old: config", lastModified: "2026-01-01T00:00:00Z" };
    const news = { content: "new: config" };
    const call = makeUpdateCall("traefik-static", olds, news, true);
    const { err, response } = await callHandler(traefikStaticConfigResource.update, call);

    expect(err).toBeNull();
    const props = response.getProperties().toJavaScript();
    expect(props.content).toBe("new: config");
    expect(props.lastModified).toBe("2026-01-01T00:00:00Z");
    expect(homelabClient.putTraefikStatic).not.toHaveBeenCalled();
  });

  it("updates static config via PUT", async () => {
    homelabClient.putTraefikStatic.mockResolvedValue({ content: "new: config", lastModified: "2026-02-01T00:00:00Z" });

    const olds = { content: "old: config", lastModified: "2026-01-01T00:00:00Z" };
    const news = { content: "new: config" };
    const call = makeUpdateCall("traefik-static", olds, news);
    const { err, response } = await callHandler(traefikStaticConfigResource.update, call);

    expect(err).toBeNull();
    expect(homelabClient.putTraefikStatic).toHaveBeenCalledWith("new: config");
  });

  it("returns error on API failure", async () => {
    homelabClient.putTraefikStatic.mockRejectedValue(new Error("server error"));

    const olds = { content: "old: config" };
    const news = { content: "new: config" };
    const call = makeUpdateCall("traefik-static", olds, news);
    const { err } = await callHandler(traefikStaticConfigResource.update, call);

    expect(err).not.toBeNull();
    expect(err.message).toContain("Failed to update traefik static config");
  });
});

describe("TraefikStaticConfig delete", () => {
  it("delete is a no-op (returns empty)", async () => {
    const call = makeDeleteCall("traefik-static");
    const { err } = await callHandler(traefikStaticConfigResource.delete, call);

    expect(err).toBeNull();
  });
});
