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

// We need fresh modules for singleton tests, so import dynamically in those tests.
// For translation function tests, import normally.
import {
  ruleToApi,
  ruleFromApi,
  aliasToApi,
  aliasFromApi,
  hostOverrideToApi,
  hostOverrideFromApi,
  forwardToApi,
  forwardFromApi,
  aclToApi,
  aclFromApi,
  dnsblToApi,
  dnsblFromApi,
  normalizeGetItemResponse,
} from "../src/opnsenseClient";

describe("ruleToApi", () => {
  it("maps camelCase fields to snake_case", () => {
    const result = ruleToApi({
      sourceNet: "10.0.0.0/24",
      sourcePort: "443",
      destinationNet: "192.168.1.0/24",
      destinationPort: "8080",
    });
    expect(result).toEqual({
      source_net: "10.0.0.0/24",
      source_port: "443",
      destination_net: "192.168.1.0/24",
      destination_port: "8080",
    });
  });

  it("converts booleans to '1' and '0'", () => {
    const result = ruleToApi({ log: true, quick: false, disabled: true });
    expect(result).toEqual({ log: "1", quick: "0", disabled: "1" });
  });

  it("converts false booleans to '0'", () => {
    const result = ruleToApi({ log: false, quick: false, disabled: false });
    expect(result).toEqual({ log: "0", quick: "0", disabled: "0" });
  });

  it("converts sequence number to string", () => {
    const result = ruleToApi({ sequence: 10 });
    expect(result).toEqual({ sequence: "10" });
  });

  it("omits undefined fields", () => {
    const result = ruleToApi({ action: "pass" });
    expect(result).toEqual({ action: "pass" });
    expect(Object.keys(result)).toEqual(["action"]);
  });

  it("passes through string fields directly", () => {
    const result = ruleToApi({
      description: "Allow HTTPS",
      interface: "lan",
      ipprotocol: "inet",
      protocol: "TCP",
      action: "pass",
      direction: "in",
    });
    expect(result).toEqual({
      description: "Allow HTTPS",
      interface: "lan",
      ipprotocol: "inet",
      protocol: "TCP",
      action: "pass",
      direction: "in",
    });
  });
});

describe("ruleFromApi", () => {
  it("maps snake_case to camelCase", () => {
    const result = ruleFromApi({
      source_net: "10.0.0.0/24",
      source_port: "443",
      destination_net: "192.168.1.0/24",
      destination_port: "8080",
    });
    expect(result).toEqual({
      sourceNet: "10.0.0.0/24",
      sourcePort: "443",
      destinationNet: "192.168.1.0/24",
      destinationPort: "8080",
    });
  });

  it("converts '1' to true and '0' to false", () => {
    const result = ruleFromApi({ log: "1", quick: "0", disabled: "1" });
    expect(result).toEqual({ log: true, quick: false, disabled: true });
  });

  it("converts string sequence to number", () => {
    const result = ruleFromApi({ sequence: "15" });
    expect(result).toEqual({ sequence: 15 });
  });

  it("round-trips with ruleToApi", () => {
    const original = {
      description: "Test",
      interface: "wan",
      ipprotocol: "inet",
      protocol: "TCP",
      sourceNet: "any",
      destinationPort: "443",
      action: "pass",
      direction: "in",
      log: true,
      quick: true,
      disabled: false,
      sequence: 5,
    };
    const api = ruleToApi(original);
    const back = ruleFromApi(api);
    expect(back).toEqual(original);
  });

  it("omits undefined API fields", () => {
    const result = ruleFromApi({ action: "block" });
    expect(result).toEqual({ action: "block" });
    expect(Object.keys(result)).toEqual(["action"]);
  });
});

describe("aliasToApi", () => {
  it("maps alias fields correctly", () => {
    const result = aliasToApi({
      name: "blocklist",
      type: "host",
      content: "1.2.3.4\n5.6.7.8",
      description: "Bad hosts",
    });
    expect(result).toEqual({
      name: "blocklist",
      type: "host",
      content: "1.2.3.4\n5.6.7.8",
      description: "Bad hosts",
    });
  });

  it("converts enabled boolean to '1'/'0'", () => {
    expect(aliasToApi({ enabled: true }).enabled).toBe("1");
    expect(aliasToApi({ enabled: false }).enabled).toBe("0");
  });

  it("omits undefined fields", () => {
    const result = aliasToApi({ name: "test" });
    expect(result).toEqual({ name: "test" });
  });
});

describe("aliasFromApi", () => {
  it("maps alias fields correctly", () => {
    const result = aliasFromApi({
      name: "blocklist",
      type: "host",
      content: "1.2.3.4",
      description: "Bad hosts",
    });
    expect(result).toEqual({
      name: "blocklist",
      type: "host",
      content: "1.2.3.4",
      description: "Bad hosts",
    });
  });

  it("converts enabled '1'/'0' to boolean", () => {
    expect(aliasFromApi({ enabled: "1" }).enabled).toBe(true);
    expect(aliasFromApi({ enabled: "0" }).enabled).toBe(false);
  });

  it("round-trips with aliasToApi", () => {
    const original = {
      name: "myalias",
      type: "network",
      content: "10.0.0.0/8",
      description: "Private nets",
      enabled: true,
    };
    const api = aliasToApi(original);
    const back = aliasFromApi(api);
    expect(back).toEqual(original);
  });
});

describe("configureOpnsenseClient / ensureOpnsenseConfigured", () => {
  it("throws when not configured", () => {
    jest.isolateModules(() => {
      const { ensureOpnsenseConfigured } = require("../src/opnsenseClient");
      expect(() => ensureOpnsenseConfigured()).toThrow("OPNsense provider not configured");
    });
  });

  it("returns config after configuring", () => {
    jest.isolateModules(() => {
      const { configureOpnsenseClient, ensureOpnsenseConfigured } = require("../src/opnsenseClient");
      const config = { url: "https://fw.local", apiKey: "key", apiSecret: "secret" };
      configureOpnsenseClient(config);
      expect(ensureOpnsenseConfigured()).toEqual(config);
    });
  });

  it("stores and returns config with insecure flag", () => {
    jest.isolateModules(() => {
      const { configureOpnsenseClient, ensureOpnsenseConfigured } = require("../src/opnsenseClient");
      const config = { url: "https://fw.local", apiKey: "k", apiSecret: "s", insecure: true };
      configureOpnsenseClient(config);
      const result = ensureOpnsenseConfigured();
      expect(result.insecure).toBe(true);
    });
  });
});

describe("withFirewallApply", () => {
  beforeEach(() => {
    jest.isolateModules(() => {});
    mockedFetch.mockReset();
  });

  function setupConfiguredModule() {
    // We need to get a fresh module with fetch already mocked
    const client = require("../src/opnsenseClient");
    client.configureOpnsenseClient({
      url: "https://fw.local",
      apiKey: "testkey",
      apiSecret: "testsecret",
    });
    return client;
  }

  it("calls savepoint, fn, apply, cancelRollback in order", async () => {
    const client = setupConfiguredModule();
    const callOrder: string[] = [];

    mockedFetch
      .mockResolvedValueOnce(mockResponse({ revision: "rev-123" })) // savepoint
      .mockResolvedValueOnce(mockResponse({ uuid: "rule-1" })) // fn (addRule)
      .mockResolvedValueOnce(mockResponse({ status: "ok" })) // apply
      .mockResolvedValueOnce(mockResponse({})); // cancelRollback

    const result = await client.withFirewallApply(async () => {
      callOrder.push("fn");
      return "result-value";
    });

    expect(result).toBe("result-value");
    expect(mockedFetch).toHaveBeenCalledTimes(3); // savepoint + apply + cancelRollback (fn doesn't call fetch here)
    // Verify savepoint was called first
    const savepointCall = mockedFetch.mock.calls[0];
    expect(savepointCall[0]).toContain("/api/firewall/filter/savepoint");
  });

  it("propagates fn error without calling apply", async () => {
    const client = setupConfiguredModule();

    mockedFetch.mockResolvedValueOnce(mockResponse({ revision: "rev-456" })); // savepoint

    await expect(
      client.withFirewallApply(async () => {
        throw new Error("mutation failed");
      }),
    ).rejects.toThrow("mutation failed");

    // Only savepoint was called, not apply
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("propagates applyChanges error after successful fn", async () => {
    const client = setupConfiguredModule();

    mockedFetch
      .mockResolvedValueOnce(mockResponse({ revision: "rev-789" })) // savepoint
      .mockResolvedValueOnce(mockResponse({ status: "failed" }, 500)); // apply fails

    await expect(
      client.withFirewallApply(async () => "ok"),
    ).rejects.toThrow();

    // savepoint + apply were called, but NOT cancelRollback
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });
});

describe("CRUD functions", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  function setupConfiguredModule() {
    const client = require("../src/opnsenseClient");
    client.configureOpnsenseClient({
      url: "https://fw.local",
      apiKey: "mykey",
      apiSecret: "mysecret",
    });
    return client;
  }

  describe("addFirewallRule", () => {
    it("sends POST with correct body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ uuid: "new-uuid" }));

      const result = await client.addFirewallRule({ action: "pass", interface: "lan" });

      expect(result).toEqual({ uuid: "new-uuid" });
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/firewall/filter/addRule");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual({ rule: { action: "pass", interface: "lan" } });
    });

    it("includes auth header", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ uuid: "u1" }));

      await client.addFirewallRule({});

      const [, opts] = mockedFetch.mock.calls[0] as [string, any];
      const expectedAuth = `Basic ${Buffer.from("mykey:mysecret").toString("base64")}`;
      expect(opts.headers["Authorization"]).toBe(expectedAuth);
    });
  });

  describe("getFirewallRule", () => {
    it("sends GET to correct URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ rule: { action: "block" } }));

      const result = await client.getFirewallRule("uuid-123");

      expect(result).toEqual({ rule: { action: "block" } });
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/firewall/filter/getRule/uuid-123");
      expect(opts.method).toBe("GET");
    });
  });

  describe("setFirewallRule", () => {
    it("sends POST with rule body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.setFirewallRule("uuid-456", { action: "reject" });

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/firewall/filter/setRule/uuid-456");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual({ rule: { action: "reject" } });
    });
  });

  describe("delFirewallRule", () => {
    it("sends POST to delete URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.delFirewallRule("uuid-789");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/firewall/filter/delRule/uuid-789");
      expect(opts.method).toBe("POST");
    });
  });

  describe("addAlias", () => {
    it("sends POST with alias body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ uuid: "alias-1" }));

      const result = await client.addAlias({ name: "blocklist", type: "host" });

      expect(result).toEqual({ uuid: "alias-1" });
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/firewall/alias/addItem");
      expect(JSON.parse(opts.body)).toEqual({ alias: { name: "blocklist", type: "host" } });
    });
  });

  describe("getAlias", () => {
    it("sends GET to correct URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ alias: { name: "test" } }));

      const result = await client.getAlias("alias-uuid");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/firewall/alias/getItem/alias-uuid");
      expect(opts.method).toBe("GET");
    });
  });

  describe("setAlias", () => {
    it("sends POST with alias body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.setAlias("alias-2", { name: "updated" });

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/firewall/alias/setItem/alias-2");
      expect(JSON.parse(opts.body)).toEqual({ alias: { name: "updated" } });
    });
  });

  describe("delAlias", () => {
    it("sends POST to delete URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.delAlias("alias-3");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/firewall/alias/delItem/alias-3");
      expect(opts.method).toBe("POST");
    });
  });

  describe("error handling", () => {
    it("throws on non-2xx response", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ message: "Forbidden" }, 403));

      await expect(client.addFirewallRule({})).rejects.toThrow("OPNsense API POST /api/firewall/filter/addRule failed (403): Forbidden");
    });

    it("handles non-JSON error body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error("not json"); },
        text: async () => "Internal Server Error",
      } as unknown as Response);

      await expect(client.getFirewallRule("x")).rejects.toThrow("Internal Server Error");
    });
  });

  describe("addHostOverride", () => {
    it("sends POST with correct body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ uuid: "ho-1" }));

      const result = await client.addHostOverride({ hostname: "test", domain: "example.com" });

      expect(result).toEqual({ uuid: "ho-1" });
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/addHostOverride");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual({ hostoverride: { hostname: "test", domain: "example.com" } });
    });
  });

  describe("getHostOverride", () => {
    it("sends GET to correct URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ hostoverride: { hostname: "test" } }));

      await client.getHostOverride("ho-uuid");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/getHostOverride/ho-uuid");
      expect(opts.method).toBe("GET");
    });
  });

  describe("setHostOverride", () => {
    it("sends POST with body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.setHostOverride("ho-2", { hostname: "updated" });

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/setHostOverride/ho-2");
      expect(JSON.parse(opts.body)).toEqual({ hostoverride: { hostname: "updated" } });
    });
  });

  describe("delHostOverride", () => {
    it("sends POST to delete URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.delHostOverride("ho-3");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/delHostOverride/ho-3");
      expect(opts.method).toBe("POST");
    });
  });

  describe("addForward", () => {
    it("sends POST with correct body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ uuid: "fwd-1" }));

      const result = await client.addForward({ server: "8.8.8.8" });

      expect(result).toEqual({ uuid: "fwd-1" });
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/addForward");
      expect(JSON.parse(opts.body)).toEqual({ forward: { server: "8.8.8.8" } });
    });
  });

  describe("getForward", () => {
    it("sends GET to correct URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ forward: { server: "8.8.8.8" } }));

      await client.getForward("fwd-uuid");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/getForward/fwd-uuid");
      expect(opts.method).toBe("GET");
    });
  });

  describe("setForward", () => {
    it("sends POST with body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.setForward("fwd-2", { server: "1.1.1.1" });

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/setForward/fwd-2");
      expect(JSON.parse(opts.body)).toEqual({ forward: { server: "1.1.1.1" } });
    });
  });

  describe("delForward", () => {
    it("sends POST to delete URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.delForward("fwd-3");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/delForward/fwd-3");
      expect(opts.method).toBe("POST");
    });
  });

  describe("addAcl", () => {
    it("sends POST with correct body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ uuid: "acl-1" }));

      const result = await client.addAcl({ name: "lan", networks: "10.0.0.0/8" });

      expect(result).toEqual({ uuid: "acl-1" });
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/addAcl");
      expect(JSON.parse(opts.body)).toEqual({ acl: { name: "lan", networks: "10.0.0.0/8" } });
    });
  });

  describe("getAcl", () => {
    it("sends GET to correct URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ acl: { name: "lan" } }));

      await client.getAcl("acl-uuid");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/getAcl/acl-uuid");
      expect(opts.method).toBe("GET");
    });
  });

  describe("setAcl", () => {
    it("sends POST with body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.setAcl("acl-2", { name: "updated" });

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/setAcl/acl-2");
      expect(JSON.parse(opts.body)).toEqual({ acl: { name: "updated" } });
    });
  });

  describe("delAcl", () => {
    it("sends POST to delete URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.delAcl("acl-3");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/delAcl/acl-3");
      expect(opts.method).toBe("POST");
    });
  });

  describe("addDnsbl", () => {
    it("sends POST with correct body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ uuid: "dnsbl-1" }));

      const result = await client.addDnsbl({ description: "test blocklist" });

      expect(result).toEqual({ uuid: "dnsbl-1" });
      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/addDnsbl");
      expect(JSON.parse(opts.body)).toEqual({ dnsbl: { description: "test blocklist" } });
    });
  });

  describe("getDnsbl", () => {
    it("sends GET to correct URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({ dnsbl: { description: "test" } }));

      await client.getDnsbl("dnsbl-uuid");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/getDnsbl/dnsbl-uuid");
      expect(opts.method).toBe("GET");
    });
  });

  describe("setDnsbl", () => {
    it("sends POST with body", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.setDnsbl("dnsbl-2", { description: "updated" });

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/setDnsbl/dnsbl-2");
      expect(JSON.parse(opts.body)).toEqual({ dnsbl: { description: "updated" } });
    });
  });

  describe("delDnsbl", () => {
    it("sends POST to delete URL", async () => {
      const client = setupConfiguredModule();
      mockedFetch.mockResolvedValueOnce(mockResponse({}));

      await client.delDnsbl("dnsbl-3");

      const [url, opts] = mockedFetch.mock.calls[0] as [string, any];
      expect(url).toBe("https://fw.local/api/unbound/settings/delDnsbl/dnsbl-3");
      expect(opts.method).toBe("POST");
    });
  });
});

describe("withUnboundReconfigure", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  function setupConfiguredModule() {
    const client = require("../src/opnsenseClient");
    client.configureOpnsenseClient({
      url: "https://fw.local",
      apiKey: "testkey",
      apiSecret: "testsecret",
    });
    return client;
  }

  it("calls fn then reconfigure in order", async () => {
    const client = setupConfiguredModule();

    mockedFetch.mockResolvedValueOnce(mockResponse({})); // reconfigure

    const result = await client.withUnboundReconfigure(async () => {
      return "result-value";
    });

    expect(result).toBe("result-value");
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [url] = mockedFetch.mock.calls[0] as [string, any];
    expect(url).toContain("/api/unbound/service/reconfigure");
  });

  it("propagates fn error without calling reconfigure", async () => {
    const client = setupConfiguredModule();

    await expect(
      client.withUnboundReconfigure(async () => {
        throw new Error("mutation failed");
      }),
    ).rejects.toThrow("mutation failed");

    expect(mockedFetch).toHaveBeenCalledTimes(0);
  });
});

describe("hostOverrideToApi", () => {
  it("converts booleans to '1'/'0'", () => {
    const result = hostOverrideToApi({ enabled: true, addptr: false });
    expect(result.enabled).toBe("1");
    expect(result.addptr).toBe("0");
  });

  it("converts numbers to strings", () => {
    const result = hostOverrideToApi({ mxprio: 10, ttl: 300 });
    expect(result.mxprio).toBe("10");
    expect(result.ttl).toBe("300");
  });

  it("passes through string fields", () => {
    const result = hostOverrideToApi({ hostname: "test", domain: "example.com", rr: "A", server: "1.2.3.4", mx: "mail.example.com", txtdata: "v=spf1 ~all" });
    expect(result).toEqual({ hostname: "test", domain: "example.com", rr: "A", server: "1.2.3.4", mx: "mail.example.com", txtdata: "v=spf1 ~all" });
  });

  it("omits undefined fields", () => {
    const result = hostOverrideToApi({ domain: "example.com" });
    expect(result).toEqual({ domain: "example.com" });
  });
});

describe("hostOverrideFromApi", () => {
  it("converts '1'/'0' to booleans", () => {
    const result = hostOverrideFromApi({ enabled: "1", addptr: "0" });
    expect(result.enabled).toBe(true);
    expect(result.addptr).toBe(false);
  });

  it("converts string numbers to integers", () => {
    const result = hostOverrideFromApi({ mxprio: "10", ttl: "300" });
    expect(result.mxprio).toBe(10);
    expect(result.ttl).toBe(300);
  });

  it("round-trips with hostOverrideToApi", () => {
    const original = {
      enabled: true,
      hostname: "myhost",
      domain: "example.com",
      rr: "MX",
      server: "1.2.3.4",
      mxprio: 10,
      mx: "mail.example.com",
      txtdata: "v=spf1 ~all",
      ttl: 300,
      addptr: true,
      description: "Test",
    };
    const api = hostOverrideToApi(original);
    const back = hostOverrideFromApi(api);
    expect(back).toEqual(original);
  });
});

describe("forwardToApi", () => {
  it("converts booleans to '1'/'0'", () => {
    const result = forwardToApi({ enabled: true, forwardTcpUpstream: false, forwardFirst: true });
    expect(result.enabled).toBe("1");
    expect(result.forward_tcp_upstream).toBe("0");
    expect(result.forward_first).toBe("1");
  });

  it("converts port to string", () => {
    const result = forwardToApi({ port: 853 });
    expect(result.port).toBe("853");
  });

  it("passes through string fields", () => {
    const result = forwardToApi({ type: "dot", domain: "example.com", server: "1.1.1.1", verify: "cloudflare-dns.com" });
    expect(result).toEqual({ type: "dot", domain: "example.com", server: "1.1.1.1", verify: "cloudflare-dns.com" });
  });

  it("omits undefined fields", () => {
    const result = forwardToApi({ server: "8.8.8.8" });
    expect(result).toEqual({ server: "8.8.8.8" });
  });
});

describe("forwardFromApi", () => {
  it("converts '1'/'0' to booleans", () => {
    const result = forwardFromApi({ enabled: "1", forward_tcp_upstream: "0", forward_first: "1" });
    expect(result.enabled).toBe(true);
    expect(result.forwardTcpUpstream).toBe(false);
    expect(result.forwardFirst).toBe(true);
  });

  it("converts string port to integer", () => {
    const result = forwardFromApi({ port: "853" });
    expect(result.port).toBe(853);
  });

  it("round-trips with forwardToApi", () => {
    const original = {
      enabled: true,
      type: "dot",
      domain: "example.com",
      server: "1.1.1.1",
      port: 853,
      verify: "cloudflare-dns.com",
      forwardTcpUpstream: true,
      forwardFirst: false,
      description: "CloudFlare DoT",
    };
    const api = forwardToApi(original);
    const back = forwardFromApi(api);
    expect(back).toEqual(original);
  });
});

describe("aclToApi", () => {
  it("converts enabled boolean to '1'/'0'", () => {
    expect(aclToApi({ enabled: true }).enabled).toBe("1");
    expect(aclToApi({ enabled: false }).enabled).toBe("0");
  });

  it("passes through string fields", () => {
    const result = aclToApi({ name: "lan", action: "allow", networks: "10.0.0.0/8", description: "LAN" });
    expect(result).toEqual({ name: "lan", action: "allow", networks: "10.0.0.0/8", description: "LAN" });
  });

  it("omits undefined fields", () => {
    const result = aclToApi({ name: "test" });
    expect(result).toEqual({ name: "test" });
  });
});

describe("aclFromApi", () => {
  it("converts enabled '1'/'0' to boolean", () => {
    expect(aclFromApi({ enabled: "1" }).enabled).toBe(true);
    expect(aclFromApi({ enabled: "0" }).enabled).toBe(false);
  });

  it("round-trips with aclToApi", () => {
    const original = {
      enabled: true,
      name: "myacl",
      action: "allow",
      networks: "10.0.0.0/8",
      description: "LAN access",
    };
    const api = aclToApi(original);
    const back = aclFromApi(api);
    expect(back).toEqual(original);
  });
});

describe("dnsblToApi", () => {
  it("converts booleans to '1'/'0'", () => {
    const result = dnsblToApi({ enabled: true, nxdomain: false });
    expect(result.enabled).toBe("1");
    expect(result.nxdomain).toBe("0");
  });

  it("converts cacheTtl to string", () => {
    const result = dnsblToApi({ cacheTtl: 72000 });
    expect(result.cache_ttl).toBe("72000");
  });

  it("maps camelCase to snake_case", () => {
    const result = dnsblToApi({ sourceNets: "10.0.0.0/8" });
    expect(result.source_nets).toBe("10.0.0.0/8");
  });

  it("passes through string fields unchanged", () => {
    const result = dnsblToApi({ type: "dnsbl", lists: "list1", allowlists: "good.com", blocklists: "bad.com", wildcards: "*.ads.com", address: "127.0.0.1" });
    expect(result.type).toBe("dnsbl");
    expect(result.lists).toBe("list1");
    expect(result.allowlists).toBe("good.com");
    expect(result.blocklists).toBe("bad.com");
    expect(result.wildcards).toBe("*.ads.com");
    expect(result.address).toBe("127.0.0.1");
  });

  it("omits undefined fields", () => {
    const result = dnsblToApi({ description: "test" });
    expect(result).toEqual({ description: "test" });
  });
});

describe("dnsblFromApi", () => {
  it("converts '1'/'0' to booleans", () => {
    const result = dnsblFromApi({ enabled: "1", nxdomain: "0" });
    expect(result.enabled).toBe(true);
    expect(result.nxdomain).toBe(false);
  });

  it("converts cache_ttl to integer", () => {
    const result = dnsblFromApi({ cache_ttl: "72000" });
    expect(result.cacheTtl).toBe(72000);
  });

  it("maps snake_case to camelCase", () => {
    const result = dnsblFromApi({ source_nets: "10.0.0.0/8" });
    expect(result.sourceNets).toBe("10.0.0.0/8");
  });

  it("passes through string fields unchanged", () => {
    const result = dnsblFromApi({ type: "dnsbl", lists: "list1", allowlists: "good.com", blocklists: "bad.com", wildcards: "*.ads.com", address: "127.0.0.1" });
    expect(result.type).toBe("dnsbl");
    expect(result.lists).toBe("list1");
    expect(result.allowlists).toBe("good.com");
    expect(result.blocklists).toBe("bad.com");
    expect(result.wildcards).toBe("*.ads.com");
    expect(result.address).toBe("127.0.0.1");
  });

  it("round-trips with dnsblToApi", () => {
    const original = {
      enabled: true,
      type: "dnsbl",
      lists: "list1,list2",
      allowlists: "good.com",
      blocklists: "bad.com",
      wildcards: "*.ads.com",
      sourceNets: "10.0.0.0/8",
      address: "127.0.0.1",
      nxdomain: true,
      cacheTtl: 72000,
      description: "My blocklist",
    };
    const api = dnsblToApi(original);
    const back = dnsblFromApi(api);
    expect(back).toEqual(original);
  });
});

describe("normalizeGetItemResponse", () => {
  it("passes through flat string fields unchanged", () => {
    const data = { name: "test", description: "desc", enabled: "1" };
    expect(normalizeGetItemResponse(data)).toEqual(data);
  });

  it("extracts single selected key from a selected map", () => {
    const data = {
      name: "NetBirdPorts",
      type: {
        host: { value: "Host(s)", selected: 0 },
        port: { value: "Port(s)", selected: 1 },
        urltable: { value: "URL Table (IPs)", selected: 0 },
        mac: { value: "MAC address", selected: 0 },
      },
    };
    const result = normalizeGetItemResponse(data);
    expect(result.name).toBe("NetBirdPorts");
    expect(result.type).toBe("port");
  });

  it("extracts multiple selected keys joined with newlines", () => {
    const data = {
      content: {
        "portA": { value: "portA", selected: 1 },
        "portB": { value: "portB", selected: 1 },
        "portC": { value: "portC", selected: 0 },
      },
    };
    const result = normalizeGetItemResponse(data);
    expect(result.content).toBe("portA\nportB");
  });

  it("returns empty string when no keys are selected", () => {
    const data = {
      type: {
        host: { value: "Host(s)", selected: 0 },
        network: { value: "Network(s)", selected: 0 },
      },
    };
    const result = normalizeGetItemResponse(data);
    expect(result.type).toBe("");
  });

  it("passes through arrays unchanged", () => {
    const data = { categories: [], name: "test" };
    const result = normalizeGetItemResponse(data);
    expect(result.categories).toEqual([]);
  });

  it("passes through null and undefined values", () => {
    const data = { name: "test", extra: null, missing: undefined };
    const result = normalizeGetItemResponse(data);
    expect(result.extra).toBeNull();
    expect(result.missing).toBeUndefined();
  });

  it("passes through empty objects (no entries to check)", () => {
    const data = { meta: {} };
    const result = normalizeGetItemResponse(data);
    expect(result.meta).toEqual({});
  });

  it("extracts selected key when selected is boolean true", () => {
    const data = {
      type: {
        host: { value: "Host(s)", selected: true },
        network: { value: "Network(s)", selected: false },
      },
    };
    const result = normalizeGetItemResponse(data);
    expect(result.type).toBe("host");
  });

  it("extracts selected key when selected is string '1'", () => {
    const data = {
      type: {
        host: { value: "Host(s)", selected: "0" },
        port: { value: "Port(s)", selected: "1" },
      },
    };
    const result = normalizeGetItemResponse(data);
    expect(result.type).toBe("port");
  });

  it("handles mixed selected value types (number and boolean)", () => {
    const data = {
      action: {
        pass: { value: "Pass", selected: true },
        block: { value: "Block", selected: 0 },
      },
    };
    const result = normalizeGetItemResponse(data);
    expect(result.action).toBe("pass");
  });

  it("handles full alias getItem response", () => {
    const data = {
      enabled: "1",
      name: "NetBirdPorts",
      type: {
        host: { value: "Host(s)", selected: 0 },
        port: { value: "Port(s)", selected: 1 },
        urltable: { value: "URL Table (IPs)", selected: 0 },
        mac: { value: "MAC address", selected: 0 },
      },
      content: {
        "10.0.0.1": { value: "10.0.0.1", selected: 1 },
        "10.0.0.2": { value: "10.0.0.2", selected: 1 },
      },
      updatefreq: "1",
      description: "",
      categories: [],
    };
    const result = normalizeGetItemResponse(data);
    expect(result.enabled).toBe("1");
    expect(result.name).toBe("NetBirdPorts");
    expect(result.type).toBe("port");
    expect(result.content).toBe("10.0.0.1\n10.0.0.2");
    expect(result.updatefreq).toBe("1");
    expect(result.description).toBe("");
    expect(result.categories).toEqual([]);
  });

  it("normalizes selected maps then aliasFromApi produces correct output", () => {
    const raw = {
      enabled: "1",
      name: "blocklist",
      type: {
        host: { value: "Host(s)", selected: 1 },
        network: { value: "Network(s)", selected: 0 },
      },
      content: {
        "1.2.3.4": { value: "1.2.3.4", selected: 1 },
        "5.6.7.8": { value: "5.6.7.8", selected: 1 },
      },
      description: "Bad hosts",
    };
    const normalized = normalizeGetItemResponse(raw);
    const result = aliasFromApi(normalized as any);
    expect(result).toEqual({
      enabled: true,
      name: "blocklist",
      type: "host",
      content: "1.2.3.4\n5.6.7.8",
      description: "Bad hosts",
    });
  });

  it("normalizes selected maps then ruleFromApi produces correct output", () => {
    const raw = {
      action: {
        pass: { value: "Pass", selected: 1 },
        block: { value: "Block", selected: 0 },
        reject: { value: "Reject", selected: 0 },
      },
      interface: {
        lan: { value: "LAN", selected: 1 },
        wan: { value: "WAN", selected: 0 },
      },
      direction: {
        in: { value: "In", selected: 1 },
        out: { value: "Out", selected: 0 },
      },
      description: "Allow LAN",
      log: "0",
      quick: "1",
      disabled: "0",
      sequence: "5",
    };
    const normalized = normalizeGetItemResponse(raw);
    const result = ruleFromApi(normalized as any);
    expect(result.action).toBe("pass");
    expect(result.interface).toBe("lan");
    expect(result.direction).toBe("in");
    expect(result.description).toBe("Allow LAN");
    expect(result.log).toBe(false);
    expect(result.quick).toBe(true);
    expect(result.sequence).toBe(5);
  });

  it("normalizes selected maps then hostOverrideFromApi produces correct output", () => {
    const raw = {
      enabled: "1",
      hostname: "myhost",
      domain: "example.com",
      rr: {
        A: { value: "A (IPv4 address)", selected: 1 },
        AAAA: { value: "AAAA (IPv6 address)", selected: 0 },
        MX: { value: "MX (Mail server)", selected: 0 },
      },
      server: "1.2.3.4",
      addptr: "1",
      mxprio: "10",
      ttl: "300",
    };
    const normalized = normalizeGetItemResponse(raw);
    const result = hostOverrideFromApi(normalized as any);
    expect(result.enabled).toBe(true);
    expect(result.hostname).toBe("myhost");
    expect(result.domain).toBe("example.com");
    expect(result.rr).toBe("A");
    expect(result.server).toBe("1.2.3.4");
    expect(result.addptr).toBe(true);
    expect(result.mxprio).toBe(10);
    expect(result.ttl).toBe(300);
  });

  it("normalizes selected maps then forwardFromApi produces correct output", () => {
    const raw = {
      enabled: "1",
      type: {
        forward: { value: "Forward", selected: 0 },
        dot: { value: "DNS over TLS", selected: 1 },
      },
      server: "1.1.1.1",
      port: "853",
      forward_tcp_upstream: "0",
      forward_first: "1",
    };
    const normalized = normalizeGetItemResponse(raw);
    const result = forwardFromApi(normalized as any);
    expect(result.enabled).toBe(true);
    expect(result.type).toBe("dot");
    expect(result.server).toBe("1.1.1.1");
    expect(result.port).toBe(853);
    expect(result.forwardTcpUpstream).toBe(false);
    expect(result.forwardFirst).toBe(true);
  });

  it("normalizes selected maps then aclFromApi produces correct output", () => {
    const raw = {
      enabled: "1",
      name: "lan-acl",
      action: {
        allow: { value: "Allow", selected: 1 },
        deny: { value: "Deny", selected: 0 },
        refuse: { value: "Refuse", selected: 0 },
      },
      networks: {
        "10.0.0.0/8": { value: "10.0.0.0/8", selected: 1 },
        "192.168.0.0/16": { value: "192.168.0.0/16", selected: 1 },
      },
      description: "LAN access",
    };
    const normalized = normalizeGetItemResponse(raw);
    const result = aclFromApi(normalized as any);
    expect(result.enabled).toBe(true);
    expect(result.name).toBe("lan-acl");
    expect(result.action).toBe("allow");
    expect(result.networks).toBe("10.0.0.0/8\n192.168.0.0/16");
    expect(result.description).toBe("LAN access");
  });

  it("normalizes selected maps then dnsblFromApi produces correct output", () => {
    const raw = {
      enabled: "1",
      type: {
        dnsbl: { value: "DNS Blocklist", selected: 1 },
      },
      lists: {
        listA: { value: "List A", selected: 1 },
        listB: { value: "List B", selected: 1 },
      },
      cache_ttl: "72000",
      nxdomain: "0",
      source_nets: "10.0.0.0/8",
      description: "My DNSBL",
    };
    const normalized = normalizeGetItemResponse(raw);
    const result = dnsblFromApi(normalized as any);
    expect(result.enabled).toBe(true);
    expect(result.type).toBe("dnsbl");
    expect(result.lists).toBe("listA\nlistB");
    expect(result.cacheTtl).toBe(72000);
    expect(result.nxdomain).toBe(false);
    expect(result.sourceNets).toBe("10.0.0.0/8");
    expect(result.description).toBe("My DNSBL");
  });
});

describe("get* functions normalize getItem responses", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  function setupConfiguredModule() {
    const client = require("../src/opnsenseClient");
    client.configureOpnsenseClient({
      url: "https://fw.local",
      apiKey: "mykey",
      apiSecret: "mysecret",
    });
    return client;
  }

  it("getAlias normalizes selected map fields", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({
      alias: {
        enabled: "1",
        name: "NetBirdPorts",
        type: {
          host: { value: "Host(s)", selected: 0 },
          port: { value: "Port(s)", selected: 1 },
        },
        content: {
          "10.0.0.1": { value: "10.0.0.1", selected: 1 },
          "10.0.0.2": { value: "10.0.0.2", selected: 1 },
        },
        description: "",
      },
    }));

    const result = await client.getAlias("test-uuid");

    expect(result.alias.type).toBe("port");
    expect(result.alias.content).toBe("10.0.0.1\n10.0.0.2");
    expect(result.alias.name).toBe("NetBirdPorts");
    expect(result.alias.enabled).toBe("1");
  });

  it("getAlias passes through already-flat responses", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({
      alias: { name: "test", type: "host", content: "1.2.3.4", enabled: "1" },
    }));

    const result = await client.getAlias("test-uuid");

    expect(result.alias.type).toBe("host");
    expect(result.alias.content).toBe("1.2.3.4");
  });

  it("getFirewallRule normalizes selected map fields", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({
      rule: {
        action: {
          pass: { value: "Pass", selected: 1 },
          block: { value: "Block", selected: 0 },
        },
        interface: {
          lan: { value: "LAN", selected: 0 },
          wan: { value: "WAN", selected: 1 },
        },
        description: "Test rule",
        log: "0",
      },
    }));

    const result = await client.getFirewallRule("rule-uuid");

    expect(result.rule.action).toBe("pass");
    expect(result.rule.interface).toBe("wan");
    expect(result.rule.description).toBe("Test rule");
    expect(result.rule.log).toBe("0");
  });

  it("getHostOverride normalizes selected map fields", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({
      hostoverride: {
        hostname: "test",
        domain: "example.com",
        rr: {
          A: { value: "A (IPv4)", selected: 1 },
          AAAA: { value: "AAAA (IPv6)", selected: 0 },
          MX: { value: "MX", selected: 0 },
        },
        enabled: "1",
        server: "1.2.3.4",
      },
    }));

    const result = await client.getHostOverride("ho-uuid");

    expect(result.hostoverride.rr).toBe("A");
    expect(result.hostoverride.hostname).toBe("test");
    expect(result.hostoverride.enabled).toBe("1");
  });

  it("getForward normalizes selected map fields", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({
      forward: {
        type: {
          forward: { value: "Forward", selected: 0 },
          dot: { value: "DNS-over-TLS", selected: 1 },
        },
        server: "1.1.1.1",
        enabled: "1",
      },
    }));

    const result = await client.getForward("fwd-uuid");

    expect(result.forward.type).toBe("dot");
    expect(result.forward.server).toBe("1.1.1.1");
  });

  it("getAcl normalizes selected map fields", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({
      acl: {
        name: "myacl",
        action: {
          allow: { value: "Allow", selected: 1 },
          deny: { value: "Deny", selected: 0 },
          refuse: { value: "Refuse", selected: 0 },
        },
        networks: {
          "10.0.0.0/8": { value: "10.0.0.0/8", selected: 1 },
          "192.168.0.0/16": { value: "192.168.0.0/16", selected: 1 },
        },
        enabled: "1",
      },
    }));

    const result = await client.getAcl("acl-uuid");

    expect(result.acl.action).toBe("allow");
    expect(result.acl.networks).toBe("10.0.0.0/8\n192.168.0.0/16");
    expect(result.acl.name).toBe("myacl");
  });

  it("getDnsbl normalizes selected map fields", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({
      dnsbl: {
        type: {
          dnsbl: { value: "DNSBL", selected: 1 },
          other: { value: "Other", selected: 0 },
        },
        lists: {
          "list1": { value: "List 1", selected: 1 },
          "list2": { value: "List 2", selected: 1 },
        },
        enabled: "1",
        description: "blocklist",
      },
    }));

    const result = await client.getDnsbl("dnsbl-uuid");

    expect(result.dnsbl.type).toBe("dnsbl");
    expect(result.dnsbl.lists).toBe("list1\nlist2");
    expect(result.dnsbl.description).toBe("blocklist");
  });
});

describe("translation edge cases", () => {
  it("ruleToApi returns empty object for empty input", () => {
    expect(ruleToApi({})).toEqual({});
  });

  it("ruleFromApi returns empty object for empty input", () => {
    expect(ruleFromApi({})).toEqual({});
  });

  it("ruleToApi converts undefined boolean to '0' via fromBool", () => {
    // fromBool(undefined) returns "0"
    // But ruleToApi only sets fields when !== undefined, so undefined booleans are omitted
    const result = ruleToApi({ log: undefined });
    expect(result.log).toBeUndefined();
  });

  it("ruleToApi handles sequence 0 correctly", () => {
    const result = ruleToApi({ sequence: 0 });
    expect(result.sequence).toBe("0");
  });

  it("ruleFromApi handles sequence '0' correctly", () => {
    const result = ruleFromApi({ sequence: "0" });
    expect(result.sequence).toBe(0);
  });

  it("hostOverrideToApi handles mxprio 0 correctly", () => {
    const result = hostOverrideToApi({ mxprio: 0, ttl: 0 });
    expect(result.mxprio).toBe("0");
    expect(result.ttl).toBe("0");
  });

  it("hostOverrideFromApi handles '0' for numeric fields", () => {
    const result = hostOverrideFromApi({ mxprio: "0", ttl: "0" });
    expect(result.mxprio).toBe(0);
    expect(result.ttl).toBe(0);
  });

  it("forwardToApi handles port 0 correctly", () => {
    const result = forwardToApi({ port: 0 });
    expect(result.port).toBe("0");
  });

  it("dnsblToApi handles cacheTtl 0 correctly", () => {
    const result = dnsblToApi({ cacheTtl: 0 });
    expect(result.cache_ttl).toBe("0");
  });

  it("dnsblFromApi handles cache_ttl '0' correctly", () => {
    const result = dnsblFromApi({ cache_ttl: "0" });
    expect(result.cacheTtl).toBe(0);
  });

  it("aliasToApi returns empty object for empty input", () => {
    expect(aliasToApi({})).toEqual({});
  });

  it("aliasFromApi returns empty object for empty input", () => {
    expect(aliasFromApi({})).toEqual({});
  });

  it("ruleFromApi returns undefined sequence for empty string", () => {
    const result = ruleFromApi({ sequence: "" });
    expect(result.sequence).toBeUndefined();
  });

  it("ruleFromApi returns undefined sequence for non-numeric string", () => {
    const result = ruleFromApi({ sequence: "abc" });
    expect(result.sequence).toBeUndefined();
  });

  it("hostOverrideFromApi returns undefined for empty mxprio/ttl", () => {
    const result = hostOverrideFromApi({ mxprio: "", ttl: "" });
    expect(result.mxprio).toBeUndefined();
    expect(result.ttl).toBeUndefined();
  });

  it("forwardFromApi returns undefined for empty port", () => {
    const result = forwardFromApi({ port: "" });
    expect(result.port).toBeUndefined();
  });

  it("dnsblFromApi returns undefined for empty cache_ttl", () => {
    const result = dnsblFromApi({ cache_ttl: "" });
    expect(result.cacheTtl).toBeUndefined();
  });

  it("aliasFromApi handles un-normalized selected-map objects gracefully", () => {
    // If normalizeGetItemResponse misses a field, fromApi should still produce strings
    const alias = {
      name: "test",
      type: {
        host: { value: "Host(s)", selected: 1 },
        port: { value: "Port(s)", selected: 0 },
      } as any,
      content: {} as any,
      enabled: "1",
    };
    const result = aliasFromApi(alias);
    // ensureString detects the selected map and extracts "host"
    expect(result.type).toBe("host");
    // empty object → empty string
    expect(result.content).toBe("");
    expect(result.enabled).toBe(true);
  });

  it("ruleFromApi handles un-normalized selected-map objects gracefully", () => {
    const rule = {
      action: {
        pass: { value: "Pass", selected: 1 },
        block: { value: "Block", selected: 0 },
      } as any,
      interface: {
        lan: { value: "LAN", selected: 1 },
      } as any,
      log: {
        "0": { value: "No", selected: 1 },
        "1": { value: "Yes", selected: 0 },
      } as any,
      sequence: "5",
    };
    const result = ruleFromApi(rule);
    expect(result.action).toBe("pass");
    expect(result.interface).toBe("lan");
    expect(result.log).toBe(false); // ensureString extracts "0", toBool("0") = false
    expect(result.sequence).toBe(5);
  });

  it("hostOverrideFromApi handles un-normalized rr object gracefully", () => {
    const data = {
      rr: {
        A: { value: "A (IPv4)", selected: 1 },
        AAAA: { value: "AAAA (IPv6)", selected: 0 },
      } as any,
      hostname: "test",
    };
    const result = hostOverrideFromApi(data);
    expect(result.rr).toBe("A");
    expect(result.hostname).toBe("test");
  });

  it("aclFromApi handles un-normalized action object gracefully", () => {
    const data = {
      action: {
        allow: { value: "Allow", selected: 1 },
        deny: { value: "Deny", selected: 0 },
      } as any,
      name: "test-acl",
    };
    const result = aclFromApi(data);
    expect(result.action).toBe("allow");
    expect(result.name).toBe("test-acl");
  });

  it("forwardFromApi handles un-normalized type object gracefully", () => {
    const data = {
      type: {
        forward: { value: "Forward", selected: 0 },
        dot: { value: "DNS-over-TLS", selected: 1 },
      } as any,
      server: "1.1.1.1",
    };
    const result = forwardFromApi(data);
    expect(result.type).toBe("dot");
    expect(result.server).toBe("1.1.1.1");
  });

  it("dnsblFromApi handles un-normalized type object gracefully", () => {
    const data = {
      type: {
        dnsbl: { value: "DNSBL", selected: 1 },
      } as any,
      lists: {
        listA: { value: "List A", selected: 1 },
        listB: { value: "List B", selected: 1 },
      } as any,
    };
    const result = dnsblFromApi(data);
    expect(result.type).toBe("dnsbl");
    expect(result.lists).toBe("listA\nlistB");
  });

  it("ensureString converts numbers to strings", () => {
    // Simulate a numeric field being passed as a number
    const result = ruleFromApi({ sequence: 42 as any });
    expect(result.sequence).toBe(42); // safeParseInt(ensureString(42)) = safeParseInt("42") = 42
  });

  it("ensureString converts null to empty string", () => {
    const result = aliasFromApi({ type: null as any });
    expect(result.type).toBe("");
  });
});

describe("request error handling edge cases", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  function setupConfiguredModule() {
    const client = require("../src/opnsenseClient");
    client.configureOpnsenseClient({
      url: "https://fw.local/",
      apiKey: "mykey",
      apiSecret: "mysecret",
    });
    return client;
  }

  it("strips trailing slashes from base URL", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({ uuid: "test" }));

    await client.addFirewallRule({ action: "pass" });

    const [url] = mockedFetch.mock.calls[0] as [string, any];
    expect(url).toBe("https://fw.local/api/firewall/filter/addRule");
    expect(url).not.toContain("//api");
  });

  it("handles 204 response as undefined", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => { throw new Error("no body"); },
      text: async () => "",
    } as unknown as Response);

    await client.delFirewallRule("uuid-test");
    // Should not throw
  });

  it("parses JSON error response with 'error' field", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({ error: "unauthorized" }, 401));

    await expect(client.addFirewallRule({})).rejects.toThrow("unauthorized");
  });

  it("does not send Content-Type header on GET requests (prevents OPNsense 'Invalid JSON syntax')", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({
      alias: { name: "test", type: "host", enabled: "1" },
    }));

    await client.getAlias("test-uuid");

    const [, opts] = mockedFetch.mock.calls[0] as [string, any];
    expect(opts.method).toBe("GET");
    expect(opts.headers["Content-Type"]).toBeUndefined();
    expect(opts.headers["Authorization"]).toBeDefined();
  });

  it("sends Content-Type header on POST requests with body", async () => {
    const client = setupConfiguredModule();
    mockedFetch.mockResolvedValueOnce(mockResponse({ uuid: "new-uuid" }));

    await client.addFirewallRule({ action: "pass" });

    const [, opts] = mockedFetch.mock.calls[0] as [string, any];
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.body).toBeDefined();
  });
});
