import * as grpc from "@grpc/grpc-js";
import { structToObject, objectToStruct, makeCheckFailure, GrpcCallback, GrpcCall } from "../helpers";
import { getTraefikStatic, putTraefikStatic, ensureConfigured } from "../homelabClient";
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

export const traefikStaticConfigResource = {
  async check(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());
    const failures: any[] = [];

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
    const detailedDiffMap = response.getDetaileddiffMap();

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
    callback(null, response);
  },

  async create(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getProperties());

    if (call.request.getPreview()) {
      const response = new providerProto.CreateResponse();
      response.setId("traefik-static");
      response.setProperties(objectToStruct({
        ...inputs,
        lastModified: "",
      }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();
      const info = await putTraefikStatic(inputs.content);
      const response = new providerProto.CreateResponse();
      response.setId("traefik-static");
      response.setProperties(objectToStruct({
        content: info.content,
        lastModified: info.lastModified,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to create traefik static config: ${err.message}` });
    }
  },

  async read(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    try {
      ensureConfigured();
      const info = await getTraefikStatic();

      const response = new providerProto.ReadResponse();
      response.setId("traefik-static");
      response.setProperties(objectToStruct({
        content: info.content,
        lastModified: info.lastModified,
      }));
      response.setInputs(objectToStruct({
        content: info.content,
      }));
      callback(null, response);
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found") || err.message.includes("503"))) {
        const response = new providerProto.ReadResponse();
        callback(null, response);
        return;
      }
      callback({ code: grpc.status.INTERNAL, message: `Failed to read traefik static config: ${err.message}` });
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
      const info = await putTraefikStatic(inputs.content);
      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        content: info.content,
        lastModified: info.lastModified,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to update traefik static config: ${err.message}` });
    }
  },

  async delete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    // Traefik static config is typically protected — delete is a no-op
    callback(null, new emptyProto.Empty());
  },
};
