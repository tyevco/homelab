import * as grpc from "@grpc/grpc-js";
import {
  dispatchCheck,
  dispatchDiff,
  dispatchCreate,
  dispatchRead,
  dispatchUpdate,
  dispatchDelete,
} from "../src/provider";

const structProto = require("google-protobuf/google/protobuf/struct_pb");

/**
 * callDispatch wraps a sync dispatch function (void return) in a promise.
 * The dispatch functions call the callback asynchronously via .catch(),
 * so we need to wait for the callback to be invoked.
 */
function callDispatch(
  handler: (call: any, callback: any) => void,
  call: any,
): Promise<{ err: any; response: any }> {
  return new Promise((resolve) => {
    handler(call, (err: any, response: any) => {
      resolve({ err, response });
    });
  });
}

// Mock all resource modules to prevent real imports
jest.mock("../src/resources/stack", () => ({
  stackResource: {
    check: jest.fn(async (_call: any, cb: any) => cb(null, "check-ok")),
    diff: jest.fn(async (_call: any, cb: any) => cb(null, "diff-ok")),
    create: jest.fn(async (_call: any, cb: any) => cb(null, "create-ok")),
    read: jest.fn(async (_call: any, cb: any) => cb(null, "read-ok")),
    update: jest.fn(async (_call: any, cb: any) => cb(null, "update-ok")),
    delete: jest.fn(async (_call: any, cb: any) => cb(null, "delete-ok")),
  },
}));

jest.mock("../src/resources/traefikStaticConfig", () => ({
  traefikStaticConfigResource: {
    check: jest.fn(), diff: jest.fn(), create: jest.fn(),
    read: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
}));
jest.mock("../src/resources/traefikRoute", () => ({
  traefikRouteResource: {
    check: jest.fn(), diff: jest.fn(), create: jest.fn(),
    read: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
}));
jest.mock("../src/resources/opnsenseFirewallRule", () => ({
  opnsenseFirewallRuleResource: {
    check: jest.fn(), diff: jest.fn(), create: jest.fn(),
    read: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
}));
jest.mock("../src/resources/opnsenseAlias", () => ({
  opnsenseAliasResource: {
    check: jest.fn(), diff: jest.fn(), create: jest.fn(),
    read: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
}));
jest.mock("../src/resources/opnsenseUnboundHostOverride", () => ({
  opnsenseUnboundHostOverrideResource: {
    check: jest.fn(), diff: jest.fn(), create: jest.fn(),
    read: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
}));
jest.mock("../src/resources/opnsenseUnboundForward", () => ({
  opnsenseUnboundForwardResource: {
    check: jest.fn(), diff: jest.fn(), create: jest.fn(),
    read: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
}));
jest.mock("../src/resources/opnsenseUnboundAcl", () => ({
  opnsenseUnboundAclResource: {
    check: jest.fn(), diff: jest.fn(), create: jest.fn(),
    read: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
}));
jest.mock("../src/resources/opnsenseUnboundDnsbl", () => ({
  opnsenseUnboundDnsblResource: {
    check: jest.fn(), diff: jest.fn(), create: jest.fn(),
    read: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
}));
jest.mock("../src/resources/lxcContainer", () => ({
  lxcContainerResource: {
    check: jest.fn(), diff: jest.fn(), create: jest.fn(),
    read: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
}));

function makeCall(type: string, extras: Record<string, any> = {}) {
  const emptyStruct = structProto.Struct.fromJavaScript({});
  return {
    request: {
      getType: () => type,
      getUrn: () => "",
      getNews: () => emptyStruct,
      getOlds: () => emptyStruct,
      getProperties: () => emptyStruct,
      getInputs: () => emptyStruct,
      getId: () => "test-id",
      getPreview: () => false,
      ...extras,
    },
  };
}

describe("provider dispatch", () => {
  describe("unknown resource type", () => {
    it("returns UNIMPLEMENTED for unknown type on check", async () => {
      const call = makeCall("homelab:index:NonExistent");
      const { err } = await callDispatch(dispatchCheck, call);

      expect(err).not.toBeNull();
      expect(err.code).toBe(grpc.status.UNIMPLEMENTED);
      expect(err.message).toContain("Unknown resource type");
      expect(err.message).toContain("NonExistent");
    });

    it("returns UNIMPLEMENTED for unknown type on create", async () => {
      const call = makeCall("homelab:index:Bogus");
      const { err } = await callDispatch(dispatchCreate, call);

      expect(err).not.toBeNull();
      expect(err.code).toBe(grpc.status.UNIMPLEMENTED);
    });

    it("returns UNIMPLEMENTED for unknown type on diff", async () => {
      const call = makeCall("homelab:index:Bogus");
      const { err } = await callDispatch(dispatchDiff, call);
      expect(err).not.toBeNull();
      expect(err.code).toBe(grpc.status.UNIMPLEMENTED);
    });

    it("returns UNIMPLEMENTED for unknown type on read", async () => {
      const call = makeCall("homelab:index:Bogus");
      const { err } = await callDispatch(dispatchRead, call);
      expect(err).not.toBeNull();
      expect(err.code).toBe(grpc.status.UNIMPLEMENTED);
    });

    it("returns UNIMPLEMENTED for unknown type on update", async () => {
      const call = makeCall("homelab:index:Bogus");
      const { err } = await callDispatch(dispatchUpdate, call);
      expect(err).not.toBeNull();
      expect(err.code).toBe(grpc.status.UNIMPLEMENTED);
    });

    it("returns UNIMPLEMENTED for unknown type on delete", async () => {
      const call = makeCall("homelab:index:Bogus");
      const { err } = await callDispatch(dispatchDelete, call);
      expect(err).not.toBeNull();
      expect(err.code).toBe(grpc.status.UNIMPLEMENTED);
    });

    it("returns UNIMPLEMENTED for empty type", async () => {
      const call = makeCall("");
      const { err } = await callDispatch(dispatchCheck, call);
      expect(err).not.toBeNull();
      expect(err.code).toBe(grpc.status.UNIMPLEMENTED);
    });
  });

  describe("successful routing", () => {
    it("routes Stack check to stackResource.check", async () => {
      const call = makeCall("homelab:index:Stack");
      const { err, response } = await callDispatch(dispatchCheck, call);

      expect(err).toBeNull();
      expect(response).toBe("check-ok");
    });

    it("routes Stack diff to stackResource.diff", async () => {
      const call = makeCall("homelab:index:Stack");
      const { err, response } = await callDispatch(dispatchDiff, call);
      expect(err).toBeNull();
      expect(response).toBe("diff-ok");
    });

    it("routes Stack create to stackResource.create", async () => {
      const call = makeCall("homelab:index:Stack");
      const { err, response } = await callDispatch(dispatchCreate, call);
      expect(err).toBeNull();
      expect(response).toBe("create-ok");
    });

    it("routes Stack read to stackResource.read", async () => {
      const call = makeCall("homelab:index:Stack");
      const { err, response } = await callDispatch(dispatchRead, call);
      expect(err).toBeNull();
      expect(response).toBe("read-ok");
    });

    it("routes Stack update to stackResource.update", async () => {
      const call = makeCall("homelab:index:Stack");
      const { err, response } = await callDispatch(dispatchUpdate, call);
      expect(err).toBeNull();
      expect(response).toBe("update-ok");
    });

    it("routes Stack delete to stackResource.delete", async () => {
      const call = makeCall("homelab:index:Stack");
      const { err, response } = await callDispatch(dispatchDelete, call);
      expect(err).toBeNull();
      expect(response).toBe("delete-ok");
    });
  });

  describe("handler crash recovery", () => {
    it("catches unhandled handler errors and returns INTERNAL", async () => {
      const { stackResource } = require("../src/resources/stack");
      stackResource.check.mockImplementationOnce(async () => {
        throw new Error("unexpected handler crash");
      });

      const call = makeCall("homelab:index:Stack");
      const { err } = await callDispatch(dispatchCheck, call);

      expect(err).not.toBeNull();
      expect(err.code).toBe(grpc.status.INTERNAL);
      expect(err.message).toContain("unexpected handler crash");
    });

    it("handles non-Error throws gracefully", async () => {
      const { stackResource } = require("../src/resources/stack");
      stackResource.create.mockImplementationOnce(async () => {
        throw "string error";
      });

      const call = makeCall("homelab:index:Stack");
      const { err } = await callDispatch(dispatchCreate, call);

      expect(err).not.toBeNull();
      expect(err.code).toBe(grpc.status.INTERNAL);
      expect(err.message).toContain("string error");
    });
  });
});
