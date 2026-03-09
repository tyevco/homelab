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

describe("LXC client API", () => {
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

  describe("listLxcContainers", () => {
    it("sends GET to /api/lxc and unwraps containers array", async () => {
      const client = setupConfiguredModule();
      const containers = [{ name: "test", status: 3 }];
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, containers }));

      const result = await client.listLxcContainers();

      expect(result).toEqual(containers);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc");
      expect(opts.method).toBe("GET");
    });
  });

  describe("getLxcContainer", () => {
    it("sends GET to /api/lxc/:name and unwraps container", async () => {
      const client = setupConfiguredModule();
      const container = { name: "myct", status: 3, ip: "10.0.0.1" };
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, container }));

      const result = await client.getLxcContainer("myct");

      expect(result).toEqual(container);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/myct");
      expect(opts.method).toBe("GET");
    });
  });

  describe("getLxcDistributions", () => {
    it("sends GET to /api/lxc/distributions and unwraps distributions", async () => {
      const client = setupConfiguredModule();
      const distributions = ["ubuntu", "debian", "alpine"];
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, distributions }));

      const result = await client.getLxcDistributions();

      expect(result).toEqual(distributions);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/distributions");
      expect(opts.method).toBe("GET");
    });
  });

  describe("createLxcContainer", () => {
    it("sends POST to /api/lxc with body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container created" }));

      await client.createLxcContainer("newct", "ubuntu", "jammy", "amd64");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.name).toBe("newct");
      expect(body.dist).toBe("ubuntu");
      expect(body.release).toBe("jammy");
      expect(body.arch).toBe("amd64");
    });
  });

  describe("deleteLxcContainer", () => {
    it("sends DELETE to /api/lxc/:name", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container deleted" }));

      await client.deleteLxcContainer("oldct");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/oldct");
      expect(opts.method).toBe("DELETE");
    });
  });

  describe("saveLxcConfig", () => {
    it("sends PUT to /api/lxc/:name/config with body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Config saved" }));

      await client.saveLxcConfig("myct", "lxc.net.0.type = veth");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/myct/config");
      expect(opts.method).toBe("PUT");
      expect(JSON.parse(opts.body)).toEqual({ config: "lxc.net.0.type = veth" });
    });
  });

  describe("startLxcContainer", () => {
    it("sends POST to /api/lxc/:name/start", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container started" }));

      await client.startLxcContainer("myct");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/myct/start");
      expect(opts.method).toBe("POST");
    });
  });

  describe("stopLxcContainer", () => {
    it("sends POST to /api/lxc/:name/stop", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container stopped" }));

      await client.stopLxcContainer("myct");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/myct/stop");
      expect(opts.method).toBe("POST");
    });
  });

  describe("endpoint routing", () => {
    function setupWithEndpoint(endpoint: string) {
      const client = require("../src/homelabClient");
      client.configureClient({ url: "https://homelab.local", apiKey: "key", endpoint });
      return client;
    }

    it("appends ?endpoint= to listLxcContainers", async () => {
      const client = setupWithEndpoint("agent1");
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, containers: [] }));
      await client.listLxcContainers();
      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc?endpoint=agent1");
    });

    it("appends ?endpoint= to getLxcContainer", async () => {
      const client = setupWithEndpoint("agent1");
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, container: { name: "ct" } }));
      await client.getLxcContainer("ct");
      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/ct?endpoint=agent1");
    });

    it("appends ?endpoint= to getLxcDistributions", async () => {
      const client = setupWithEndpoint("agent1");
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, distributions: [] }));
      await client.getLxcDistributions();
      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/distributions?endpoint=agent1");
    });

    it("appends ?endpoint= to createLxcContainer", async () => {
      const client = setupWithEndpoint("agent1");
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container created" }));
      await client.createLxcContainer("ct", "ubuntu", "jammy", "amd64");
      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc?endpoint=agent1");
    });

    it("appends ?endpoint= to startLxcContainer", async () => {
      const client = setupWithEndpoint("agent1");
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container started" }));
      await client.startLxcContainer("ct");
      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/ct/start?endpoint=agent1");
    });

    it("appends ?endpoint= to stopLxcContainer", async () => {
      const client = setupWithEndpoint("agent1");
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container stopped" }));
      await client.stopLxcContainer("ct");
      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/ct/stop?endpoint=agent1");
    });

    it("appends ?endpoint= to saveLxcConfig", async () => {
      const client = setupWithEndpoint("agent1");
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Config saved" }));
      await client.saveLxcConfig("ct", "lxc.net.0.type = veth");
      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/ct/config?endpoint=agent1");
    });

    it("appends ?endpoint= to deleteLxcContainer", async () => {
      const client = setupWithEndpoint("agent1");
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, msg: "Container deleted" }));
      await client.deleteLxcContainer("ct");
      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc/ct?endpoint=agent1");
    });

    it("encodes special characters in endpoint name", async () => {
      const client = setupWithEndpoint("my agent");
      mockedFetch.mockResolvedValueOnce(mockResponse({ ok: true, containers: [] }));
      await client.listLxcContainers();
      const [url] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://homelab.local/api/lxc?endpoint=my%20agent");
    });
  });
});
