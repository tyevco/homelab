import fetch from "cross-fetch";

jest.mock("cross-fetch", () => {
  const mockFetch = jest.fn();
  return {
    __esModule: true,
    default: mockFetch,
  };
});

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

function mockResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function mock204() {
  return {
    ok: true,
    status: 204,
    json: async () => { throw new Error("no body"); },
    text: async () => "",
  } as unknown as Response;
}

describe("configureClient / ensureConfigured", () => {
  it("throws when not configured", () => {
    jest.isolateModules(() => {
      const { ensureConfigured } = require("../src/homelabClient");
      expect(() => ensureConfigured()).toThrow("Homelab provider not configured");
    });
  });

  it("returns config after configuring", () => {
    jest.isolateModules(() => {
      const { configureClient, ensureConfigured } = require("../src/homelabClient");
      const config = { url: "https://homelab.local", apiKey: "test-key" };
      configureClient(config);
      expect(ensureConfigured()).toEqual(config);
    });
  });
});

describe("Homelab client API", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  function setupConfiguredModule() {
    const client = require("../src/homelabClient");
    client.configureClient({
      url: "https://homelab.local",
      apiKey: "my-api-key",
    });
    return client;
  }

  it("sends Bearer token in Authorization header", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({ name: "test" }));

    await client.getStack("test");

    const [, opts] = mockedFetch.mock.calls[0] as [string, any];
    expect(opts.headers["Authorization"]).toBe("Bearer my-api-key");
  });

  describe("listStacks", () => {
    it("sends GET to /api/stacks", async () => {
      const client = setupConfiguredModule();
      const stacks = [{ name: "web", status: "running" }, { name: "db", status: "stopped" }];
      mockedFetch.mockResolvedValueOnce(mockResponse(stacks));

      const result = await client.listStacks();

      expect(result).toEqual(stacks);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/stacks");
      expect(opts.method).toBe("GET");
    });
  });

  describe("getStack", () => {
    it("sends GET to /api/stacks/:name", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "mystack", status: "running" }));

      const result = await client.getStack("mystack");

      expect(result).toEqual({ name: "mystack", status: "running" });
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/stacks/mystack");
      expect(opts.method).toBe("GET");
    });
  });

  describe("createStack", () => {
    it("sends POST to /api/stacks with body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "new", status: "running" }));

      await client.createStack("new", "version: '3'", "FOO=bar", true, "", false, "");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/stacks");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.name).toBe("new");
      expect(body.composeYaml).toBe("version: '3'");
      expect(body.envFile).toBe("FOO=bar");
      expect(body.start).toBe(true);
    });
  });

  describe("updateStack", () => {
    it("sends PUT to /api/stacks/:name", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "web", status: "running" }));

      await client.updateStack("web", "version: '3'", "ENV=val");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/stacks/web");
      expect(opts.method).toBe("PUT");
      const body = JSON.parse(opts.body);
      expect(body.composeYaml).toBe("version: '3'");
      expect(body.envFile).toBe("ENV=val");
    });
  });

  describe("deleteStack", () => {
    it("sends DELETE to /api/stacks/:name", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mock204());

      await client.deleteStack("old");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/stacks/old");
      expect(opts.method).toBe("DELETE");
    });
  });

  describe("startStack", () => {
    it("sends POST to /api/stacks/:name/start", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "web", status: "running" }));

      await client.startStack("web");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/stacks/web/start");
      expect(opts.method).toBe("POST");
    });
  });

  describe("stopStack", () => {
    it("sends POST to /api/stacks/:name/stop", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "web", status: "stopped" }));

      await client.stopStack("web");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/stacks/web/stop");
      expect(opts.method).toBe("POST");
    });
  });

  describe("getTraefikStatic", () => {
    it("sends GET to /api/traefik/static", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ content: "yaml", lastModified: "now" }));

      const result = await client.getTraefikStatic();

      expect(result).toEqual({ content: "yaml", lastModified: "now" });
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/traefik/static");
      expect(opts.method).toBe("GET");
    });
  });

  describe("putTraefikStatic", () => {
    it("sends PUT to /api/traefik/static with content", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ content: "new-yaml", lastModified: "later" }));

      await client.putTraefikStatic("new-yaml");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/traefik/static");
      expect(opts.method).toBe("PUT");
      expect(JSON.parse(opts.body)).toEqual({ content: "new-yaml" });
    });
  });

  describe("listTraefikRoutes", () => {
    it("sends GET to /api/traefik/routes", async () => {
      const client = setupConfiguredModule();
      const routes = [{ name: "rt1", content: "yaml1" }, { name: "rt2", content: "yaml2" }];
      mockedFetch.mockResolvedValueOnce(mockResponse(routes));

      const result = await client.listTraefikRoutes();

      expect(result).toEqual(routes);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/traefik/routes");
      expect(opts.method).toBe("GET");
    });
  });

  describe("getTraefikRoute", () => {
    it("sends GET to /api/traefik/routes/:name", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "myroute", content: "yaml" }));

      const result = await client.getTraefikRoute("myroute");

      expect(result).toEqual({ name: "myroute", content: "yaml" });
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/traefik/routes/myroute");
      expect(opts.method).toBe("GET");
    });
  });

  describe("putTraefikRoute", () => {
    it("sends PUT to /api/traefik/routes/:name with content", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "rt", content: "cfg" }));

      await client.putTraefikRoute("rt", "cfg");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/traefik/routes/rt");
      expect(opts.method).toBe("PUT");
      expect(JSON.parse(opts.body)).toEqual({ content: "cfg" });
    });
  });

  describe("deleteTraefikRoute", () => {
    it("sends DELETE to /api/traefik/routes/:name", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mock204());

      await client.deleteTraefikRoute("old-route");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/traefik/routes/old-route");
      expect(opts.method).toBe("DELETE");
    });
  });

  describe("error handling", () => {
    it("throws on non-2xx with JSON error field", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ error: "Stack not found" }, 404));

      await expect(client.getStack("missing")).rejects.toThrow(
        "Homelab API GET /api/stacks/missing failed (404): Stack not found"
      );
    });

    it("throws on non-2xx with JSON message field", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ message: "Unauthorized" }, 401));

      await expect(client.getStack("test")).rejects.toThrow(
        "Homelab API GET /api/stacks/test failed (401): Unauthorized"
      );
    });

    it("prefers message over error when both present", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ message: "Primary", error: "Secondary" }, 400));

      await expect(client.getStack("test")).rejects.toThrow("Primary");
    });

    it("throws on non-2xx with non-JSON error body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error("not json"); },
        text: async () => "Internal Server Error",
      } as unknown as Response);

      await expect(client.getStack("broken")).rejects.toThrow("Internal Server Error");
    });

    it("returns undefined for 204 response", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mock204());

      const result = await client.deleteStack("gone");
      expect(result).toBeUndefined();
    });
  });

  describe("listAgents", () => {
    it("sends GET to /api/agents and unwraps agents array", async () => {
      const client = setupConfiguredModule();
      const agents = [
        { url: "", username: "", endpoint: "", capabilities: { lxcAvailable: true, version: "1.9.2" } },
        { url: "https://agent1.local", username: "admin", endpoint: "agent1.local", capabilities: { lxcAvailable: false, version: "1.9.2" } },
      ];
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, agents }));

      const result = await client.listAgents();

      expect(result).toEqual(agents);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/agents");
      expect(opts.method).toBe("GET");
    });

    it("returns only local server entry when no remote agents configured", async () => {
      const client = setupConfiguredModule();
      const agents = [
        { url: "", username: "", endpoint: "", capabilities: { lxcAvailable: false, version: "1.9.2" } },
      ];
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, agents }));

      const result = await client.listAgents();

      expect(result).toHaveLength(1);
      expect(result[0].endpoint).toBe("");
    });

    it("returns empty array when no agents present", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, agents: [] }));

      const result = await client.listAgents();

      expect(result).toEqual([]);
    });

    it("handles agents with partial capabilities", async () => {
      const client = setupConfiguredModule();
      const agents = [
        { url: "https://agent2.local", username: "user", endpoint: "agent2.local", capabilities: {} },
      ];
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, agents }));

      const result = await client.listAgents();

      expect(result[0].capabilities).toEqual({});
      expect(result[0].capabilities.lxcAvailable).toBeUndefined();
    });

    it("throws on server error", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: false, msg: "Internal server error" }, 500));

      await expect(client.listAgents()).rejects.toThrow("500");
    });
  });

  describe("createStack with extraFiles", () => {
    it("sends extraFiles in POST body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "new", status: "running" }));

      const extraFiles = [{ name: "prometheus.yml", content: "scrape_configs: []" }];
      await client.createStack("new", "version: '3'", "", true, "", false, "", extraFiles);

      const [, opts] = mockedFetch.mock.calls[0] as [string, any];
      const body = JSON.parse(opts.body);
      expect(body.extraFiles).toEqual(extraFiles);
    });

    it("sends empty extraFiles array when not provided", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "new", status: "running" }));

      await client.createStack("new", "version: '3'");

      const [, opts] = mockedFetch.mock.calls[0] as [string, any];
      const body = JSON.parse(opts.body);
      expect(body.extraFiles).toEqual([]);
    });
  });

  describe("updateStack with extraFiles", () => {
    it("sends extraFiles in PUT body when provided", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "web", status: "running" }));

      const extraFiles = [{ name: "config.yml", content: "key: value" }];
      await client.updateStack("web", "version: '3'", "", undefined, undefined, undefined, extraFiles);

      const [, opts] = mockedFetch.mock.calls[0] as [string, any];
      const body = JSON.parse(opts.body);
      expect(body.extraFiles).toEqual(extraFiles);
    });
  });

  describe("cloneLxcContainer", () => {
    it("sends POST to /api/lxc/clone with sourceName and destName", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container cloned", container: {} }));

      await client.cloneLxcContainer("base", "new-ct");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/clone");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.sourceName).toBe("base");
      expect(body.destName).toBe("new-ct");
      expect(body.initialConfig).toBe("");
    });

    it("sends initialConfig when provided", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container cloned", container: {} }));

      await client.cloneLxcContainer("base", "new-ct", "lxc.net.0.type = veth");

      const [, opts] = mockedFetch.mock.calls[0] as [string, any];
      const body = JSON.parse(opts.body);
      expect(body.initialConfig).toBe("lxc.net.0.type = veth");
    });
  });

  describe("getNotificationSettings", () => {
    it("sends GET to /api/notifications and unwraps data", async () => {
      const client = setupConfiguredModule();
      const settings = { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" };
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, data: settings }));

      const result = await client.getNotificationSettings();

      expect(result).toEqual(settings);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/notifications");
      expect(opts.method).toBe("GET");
    });
  });

  describe("saveNotificationSettings", () => {
    it("sends PUT to /api/notifications with settings body", async () => {
      const client = setupConfiguredModule();
      const settings = { ntfyEnabled: true, ntfyUrl: "https://ntfy.sh/topic" };
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, data: settings }));

      const result = await client.saveNotificationSettings(settings);

      expect(result).toEqual(settings);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/notifications");
      expect(opts.method).toBe("PUT");
      expect(JSON.parse(opts.body)).toEqual(settings);
    });
  });

  describe("listUnraidVms", () => {
    it("sends GET to /api/unraid/vms and unwraps vms", async () => {
      const client = setupConfiguredModule();
      const vms = [{ name: "ubuntu", state: "started" }, { name: "windows", state: "stopped" }];
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, vms }));

      const result = await client.listUnraidVms("unraid-agent");

      expect(result).toEqual(vms);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/unraid/vms?endpoint=unraid-agent");
      expect(opts.method).toBe("GET");
    });

    it("sends GET without endpoint query when endpoint is omitted", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, vms: [] }));

      await client.listUnraidVms();

      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/unraid/vms");
    });
  });

  describe("startUnraidVm", () => {
    it("sends POST to /api/unraid/vms/:name/start with endpoint", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Started" }));

      await client.startUnraidVm("ubuntu", "unraid-agent");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/unraid/vms/ubuntu/start?endpoint=unraid-agent");
      expect(opts.method).toBe("POST");
    });
  });

  describe("stopUnraidVm", () => {
    it("sends POST to /api/unraid/vms/:name/stop with endpoint", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Stopped" }));

      await client.stopUnraidVm("ubuntu", "unraid-agent");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/unraid/vms/ubuntu/stop?endpoint=unraid-agent");
      expect(opts.method).toBe("POST");
    });
  });

  describe("URL trailing slash handling", () => {
    it("strips trailing slashes from base URL", async () => {
      const client = require("../src/homelabClient");
      client.configureClient({
        url: "https://homelab.local///",
        apiKey: "key",
      });
      mockedFetch.mockResolvedValueOnce(mockResponse({ name: "test" }));

      await client.getStack("test");

      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/stacks/test");
    });
  });
});
