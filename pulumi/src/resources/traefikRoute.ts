import * as grpc from "@grpc/grpc-js";
import { structToObject, objectToStruct, makeCheckFailure, GrpcCallback, GrpcCall } from "../helpers";
import {
  getTraefikRoute,
  putTraefikRoute,
  deleteTraefikRoute,
  ensureConfigured,
} from "../homelabClient";
import { diffYaml } from "../composeDiff";
import YAML from "yaml";

const providerProto = require("@pulumi/pulumi/proto/provider_pb");
const emptyProto = require("google-protobuf/google/protobuf/empty_pb");

function setDetailedDiff(
  map: any,
  path: string,
  kind: "ADD" | "DELETE" | "UPDATE",
): void {
  const propDiff = new providerProto.PropertyDiff();
  propDiff.setKind(providerProto.PropertyDiff.Kind[kind]);
  propDiff.setInputdiff(true);
  map.set(path, propDiff);
}

export const traefikRouteResource = {
  async check(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());
    const failures: any[] = [];

    if (!inputs.name) {
      failures.push(makeCheckFailure("name", "name is required"));
    } else if (!/^[a-z0-9_-]+$/.test(inputs.name)) {
      failures.push(makeCheckFailure("name", "name must match ^[a-z0-9_-]+$"));
    }

    if (!inputs.content) {
      failures.push(makeCheckFailure("content", "content is required"));
    } else {
      try {
        YAML.parse(inputs.content);
      } catch (e: any) {
        failures.push(makeCheckFailure("content", `Invalid YAML: ${e.message}`));
      }
    }

    const response = new providerProto.CheckResponse();
    response.setInputs(objectToStruct(inputs));
    failures.forEach((f) => response.addFailures(f));
    callback(null, response);
  },

  async diff(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const olds = structToObject(call.request.getOlds());
    const news = structToObject(call.request.getNews());
    const response = new providerProto.DiffResponse();
    const diffs: string[] = [];
    const replaces: string[] = [];
    const detailedDiffMap = response.getDetaileddiffMap();

    // Name change requires replacement
    if (olds.name !== news.name) {
      diffs.push("name");
      replaces.push("name");
      const propDiff = new providerProto.PropertyDiff();
      propDiff.setKind(providerProto.PropertyDiff.Kind.UPDATE_REPLACE);
      propDiff.setInputdiff(true);
      detailedDiffMap.set("name", propDiff);
    }

    // Content change is in-place update
    if ((olds.content || "") !== (news.content || "")) {
      diffs.push("content");
      try {
        const changes = diffYaml(olds.content || "", news.content || "");
        for (const change of changes) {
          setDetailedDiff(detailedDiffMap, `content.${change.path}`, change.kind);
        }
      } catch {
        setDetailedDiff(detailedDiffMap, "content", "UPDATE");
      }
    }

    response.setHasdetaileddiff(true);
    response.setChanges(
      diffs.length > 0
        ? providerProto.DiffResponse.DiffChanges.DIFF_SOME
        : providerProto.DiffResponse.DiffChanges.DIFF_NONE
    );
    diffs.forEach((d) => response.addDiffs(d));
    replaces.forEach((r) => response.addReplaces(r));
    response.setDeletebeforereplace(true);
    callback(null, response);
  },

  async create(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getProperties());

    if (call.request.getPreview()) {
      const response = new providerProto.CreateResponse();
      response.setId(inputs.name || "preview");
      response.setProperties(objectToStruct({
        ...inputs,
        lastModified: "",
      }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();
      const info = await putTraefikRoute(inputs.name, inputs.content);
      const response = new providerProto.CreateResponse();
      response.setId(inputs.name);
      response.setProperties(objectToStruct({
        name: info.name,
        content: info.content,
        lastModified: info.lastModified,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to create traefik route: ${err.message}` });
    }
  },

  async read(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();

    try {
      ensureConfigured();
      const info = await getTraefikRoute(id);

      const response = new providerProto.ReadResponse();
      response.setId(id);
      response.setProperties(objectToStruct({
        name: info.name,
        content: info.content,
        lastModified: info.lastModified,
      }));
      response.setInputs(objectToStruct({
        name: info.name,
        content: info.content,
      }));
      callback(null, response);
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found") || err.message.includes("503"))) {
        const response = new providerProto.ReadResponse();
        callback(null, response);
        return;
      }
      callback({ code: grpc.status.INTERNAL, message: `Failed to read traefik route: ${err.message}` });
    }
  },

  async update(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());

    if (call.request.getPreview()) {
      const olds = structToObject(call.request.getOlds());
      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        ...inputs,
        lastModified: olds.lastModified || "",
      }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();
      const info = await putTraefikRoute(inputs.name, inputs.content);
      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        name: info.name,
        content: info.content,
        lastModified: info.lastModified,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to update traefik route: ${err.message}` });
    }
  },

  async delete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    try {
      ensureConfigured();
      await deleteTraefikRoute(id);
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        // Already gone — treat as success
      } else {
        callback({ code: grpc.status.INTERNAL, message: `Failed to delete traefik route: ${err.message}` });
        return;
      }
    }
    callback(null, new emptyProto.Empty());
  },
};
