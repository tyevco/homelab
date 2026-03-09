import { diffCompose, diffYaml } from "../src/composeDiff";

describe("diffCompose", () => {
  it("returns empty array when both are identical", () => {
    const yaml = "services:\n  web:\n    image: nginx";
    expect(diffCompose(yaml, undefined, yaml, undefined)).toEqual([]);
  });

  it("detects added service", () => {
    const oldYaml = "services:\n  web:\n    image: nginx";
    const newYaml = "services:\n  web:\n    image: nginx\n  db:\n    image: postgres";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "ADD", path: "services.db" });
  });

  it("detects removed service", () => {
    const oldYaml = "services:\n  web:\n    image: nginx\n  db:\n    image: postgres";
    const newYaml = "services:\n  web:\n    image: nginx";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "DELETE", path: "services.db" });
  });

  it("detects updated field", () => {
    const oldYaml = "services:\n  web:\n    image: nginx:1.0";
    const newYaml = "services:\n  web:\n    image: nginx:2.0";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "UPDATE", path: "services.web.image" });
  });

  it("merges override with scalar replacement", () => {
    const main = "services:\n  web:\n    image: nginx:1.0";
    const override = "services:\n  web:\n    image: nginx:2.0";
    // Old has no override, new has override changing the image
    const changes = diffCompose(main, undefined, main, override);
    expect(changes).toContainEqual({ kind: "UPDATE", path: "services.web.image" });
  });

  it("merges override with deep map merge", () => {
    const main = "services:\n  web:\n    labels:\n      app: web";
    const override = "services:\n  web:\n    labels:\n      env: prod";
    // Override adds a new label key
    const changes = diffCompose(main, undefined, main, override);
    expect(changes).toContainEqual({ kind: "ADD", path: "services.web.labels.env" });
  });

  it("merges override with array replacement", () => {
    const main = "services:\n  web:\n    ports:\n      - '3000:3000'";
    const override = "services:\n  web:\n    ports:\n      - '8080:8080'";
    const changes = diffCompose(main, undefined, main, override);
    expect(changes).toContainEqual({ kind: "UPDATE", path: "services.web.ports[0]" });
  });

  it("normalizes environment list to map form", () => {
    const oldYaml = 'services:\n  web:\n    environment:\n      - FOO=bar';
    const newYaml = 'services:\n  web:\n    environment:\n      FOO: bar';
    // Both represent the same thing after normalization
    expect(diffCompose(oldYaml, undefined, newYaml, undefined)).toEqual([]);
  });

  it("normalizes labels list to map form", () => {
    const oldYaml = 'services:\n  web:\n    labels:\n      - "app=web"';
    const newYaml = 'services:\n  web:\n    labels:\n      app: web';
    expect(diffCompose(oldYaml, undefined, newYaml, undefined)).toEqual([]);
  });

  it("coerces number vs string to no diff (e.g. port)", () => {
    // YAML parses bare 3000 as number, "3000" as string
    const oldYaml = 'services:\n  web:\n    ports:\n      - 3000';
    const newYaml = 'services:\n  web:\n    ports:\n      - "3000"';
    expect(diffCompose(oldYaml, undefined, newYaml, undefined)).toEqual([]);
  });

  it("handles empty old YAML as empty object", () => {
    const newYaml = "services:\n  web:\n    image: nginx";
    const changes = diffCompose("", undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "ADD", path: "services" });
  });

  it("handles undefined override as no override", () => {
    const yaml = "services:\n  web:\n    image: nginx";
    expect(diffCompose(yaml, undefined, yaml, undefined)).toEqual([]);
  });

  it("handles empty override string as no override", () => {
    const yaml = "services:\n  web:\n    image: nginx";
    expect(diffCompose(yaml, "", yaml, "")).toEqual([]);
  });

  it("reports nested path with dot notation", () => {
    const oldYaml = "services:\n  web:\n    image: nginx";
    const newYaml = "services:\n  web:\n    image: apache";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes[0].path).toBe("services.web.image");
  });

  it("reports array element paths with bracket notation", () => {
    const oldYaml = "services:\n  web:\n    ports:\n      - '80:80'\n      - '443:443'";
    const newYaml = "services:\n  web:\n    ports:\n      - '80:80'\n      - '8443:443'";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "UPDATE", path: "services.web.ports[1]" });
  });
});

describe("diffYaml", () => {
  it("returns empty array when both are identical", () => {
    const yaml = "key: value\nnested:\n  a: 1";
    expect(diffYaml(yaml, yaml)).toEqual([]);
  });

  it("detects scalar change as UPDATE", () => {
    const oldYaml = "entryPoints:\n  web:\n    address: ':80'";
    const newYaml = "entryPoints:\n  web:\n    address: ':8080'";
    const changes = diffYaml(oldYaml, newYaml);
    expect(changes).toContainEqual({ kind: "UPDATE", path: "entryPoints.web.address" });
  });

  it("detects added key as ADD", () => {
    const oldYaml = "http:\n  routers: {}";
    const newYaml = "http:\n  routers: {}\n  services:\n    myapp: {}";
    const changes = diffYaml(oldYaml, newYaml);
    expect(changes).toContainEqual({ kind: "ADD", path: "http.services" });
  });

  it("detects removed key as DELETE", () => {
    const oldYaml = "http:\n  routers:\n    myapp: {}\n  services:\n    myapp: {}";
    const newYaml = "http:\n  routers:\n    myapp: {}";
    const changes = diffYaml(oldYaml, newYaml);
    expect(changes).toContainEqual({ kind: "DELETE", path: "http.services" });
  });

  it("handles empty old YAML as empty object", () => {
    const newYaml = "key: value";
    const changes = diffYaml("", newYaml);
    expect(changes).toContainEqual({ kind: "ADD", path: "key" });
  });

  it("handles empty new YAML as empty object", () => {
    const oldYaml = "key: value";
    const changes = diffYaml(oldYaml, "");
    expect(changes).toContainEqual({ kind: "DELETE", path: "key" });
  });

  it("does not apply compose-specific normalization", () => {
    // diffYaml should NOT normalize environment lists to maps
    const oldYaml = 'services:\n  web:\n    environment:\n      - FOO=bar';
    const newYaml = 'services:\n  web:\n    environment:\n      FOO: bar';
    const changes = diffYaml(oldYaml, newYaml);
    // These are structurally different (array vs object), so there should be changes
    expect(changes.length).toBeGreaterThan(0);
  });
});

describe("diffCompose edge cases", () => {
  it("handles YAML merge keys (anchors/aliases)", () => {
    const yaml = `
defaults: &defaults
  image: nginx
  restart: always
services:
  web:
    <<: *defaults
    ports:
      - "80:80"`;
    // Same YAML, no diff
    expect(diffCompose(yaml, undefined, yaml, undefined)).toEqual([]);
  });

  it("detects diff when anchor-merged value changes", () => {
    const oldYaml = `
defaults: &defaults
  image: nginx
services:
  web:
    <<: *defaults`;
    const newYaml = `
defaults: &defaults
  image: apache
services:
  web:
    <<: *defaults`;
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "UPDATE", path: "defaults.image" });
    expect(changes).toContainEqual({ kind: "UPDATE", path: "services.web.image" });
  });

  it("normalizes environment entry without value (bare name)", () => {
    const oldYaml = 'services:\n  web:\n    environment:\n      - DEBUG';
    const newYaml = 'services:\n  web:\n    environment:\n      DEBUG: ""';
    // Both should normalize to { DEBUG: "" }
    expect(diffCompose(oldYaml, undefined, newYaml, undefined)).toEqual([]);
  });

  it("detects array element additions (longer new array)", () => {
    const oldYaml = "services:\n  web:\n    ports:\n      - '80:80'";
    const newYaml = "services:\n  web:\n    ports:\n      - '80:80'\n      - '443:443'";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "ADD", path: "services.web.ports[1]" });
  });

  it("detects array element deletions (shorter new array)", () => {
    const oldYaml = "services:\n  web:\n    ports:\n      - '80:80'\n      - '443:443'";
    const newYaml = "services:\n  web:\n    ports:\n      - '80:80'";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "DELETE", path: "services.web.ports[1]" });
  });

  it("detects type change from scalar to object", () => {
    const oldYaml = "services:\n  web:\n    image: nginx";
    const newYaml = "services:\n  web:\n    image:\n      name: nginx\n      tag: latest";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes).toContainEqual({ kind: "UPDATE", path: "services.web.image" });
  });

  it("detects type change from object to scalar", () => {
    const oldYaml = "services:\n  web:\n    image:\n      name: nginx";
    const newYaml = "services:\n  web:\n    image: nginx:latest";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "UPDATE", path: "services.web.image" });
  });

  it("handles both old and new overrides", () => {
    const main = "services:\n  web:\n    image: nginx";
    const oldOverride = "services:\n  web:\n    image: nginx:1.0";
    const newOverride = "services:\n  web:\n    image: nginx:2.0";
    const changes = diffCompose(main, oldOverride, main, newOverride);
    expect(changes).toContainEqual({ kind: "UPDATE", path: "services.web.image" });
  });

  it("returns no diff when both overrides produce same result", () => {
    const main = "services:\n  web:\n    image: nginx";
    const override = "services:\n  web:\n    image: nginx:1.0";
    expect(diffCompose(main, override, main, override)).toEqual([]);
  });

  it("does not normalize non-environment/labels fields in services", () => {
    const oldYaml = "services:\n  web:\n    ports:\n      - '80:80'";
    const newYaml = "services:\n  web:\n    ports:\n      - '8080:80'";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    // ports should NOT be normalized from array to map
    expect(changes).toContainEqual({ kind: "UPDATE", path: "services.web.ports[0]" });
  });

  it("handles non-service top-level keys unchanged", () => {
    const yaml = "version: '3'\nservices:\n  web:\n    image: nginx\nvolumes:\n  data: {}";
    expect(diffCompose(yaml, undefined, yaml, undefined)).toEqual([]);
  });

  it("detects changes in non-service top-level keys", () => {
    const oldYaml = "services:\n  web:\n    image: nginx\nvolumes:\n  data: {}";
    const newYaml = "services:\n  web:\n    image: nginx\nvolumes:\n  logs: {}";
    const changes = diffCompose(oldYaml, undefined, newYaml, undefined);
    expect(changes).toContainEqual({ kind: "DELETE", path: "volumes.data" });
    expect(changes).toContainEqual({ kind: "ADD", path: "volumes.logs" });
  });
});
