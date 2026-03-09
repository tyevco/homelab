import * as grpc from "@grpc/grpc-js";
import { structToObject, objectToStruct, makeCheckFailure, valuesEqual, GrpcCallback, GrpcCall } from "../helpers";
import {
  ensureOpnsenseConfigured,
  withFirewallApply,
  addAlias,
  getAlias,
  setAlias,
  delAlias,
  aliasToApi,
  aliasFromApi,
} from "../opnsenseClient";

const providerProto = require("@pulumi/pulumi/proto/provider_pb");
const emptyProto = require("google-protobuf/google/protobuf/empty_pb");

const INPUT_FIELDS = ["name", "type", "content", "description", "enabled"];

export const opnsenseAliasResource = {
  async check(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());
    const failures: any[] = [];

    if (!inputs.name) {
      failures.push(makeCheckFailure("name", "name is required"));
    }
    const VALID_TYPES = ["host", "network", "port", "mac", "url", "urltable"];
    if (!inputs.type) {
      failures.push(makeCheckFailure("type", "type is required (host, network, port, mac, url, or urltable)"));
    } else if (!VALID_TYPES.includes(inputs.type)) {
      failures.push(makeCheckFailure("type", `type must be one of: ${VALID_TYPES.join(", ")}`));
    }

    // Apply defaults
    if (inputs.enabled === undefined) inputs.enabled = true;

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

    for (const field of INPUT_FIELDS) {
      const oldVal = olds[field];
      const newVal = news[field];
      if (!valuesEqual(oldVal, newVal)) {
        diffs.push(field);
        const propDiff = new providerProto.PropertyDiff();
        propDiff.setKind(providerProto.PropertyDiff.Kind.UPDATE);
        propDiff.setInputdiff(true);
        detailedDiffMap.set(field, propDiff);
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
      response.setId("preview");
      response.setProperties(objectToStruct({
        ...inputs,
        uuid: "",
      }));
      callback(null, response);
      return;
    }

    try {
      ensureOpnsenseConfigured();
      const apiAlias = aliasToApi(inputs);
      const { uuid } = await withFirewallApply(() => addAlias(apiAlias));

      const response = new providerProto.CreateResponse();
      response.setId(uuid);
      response.setProperties(objectToStruct({
        ...inputs,
        uuid,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to create alias: ${err.message}` });
    }
  },

  async read(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();

    try {
      ensureOpnsenseConfigured();
      const { alias } = await getAlias(id);
      const props = aliasFromApi(alias);

      const response = new providerProto.ReadResponse();
      response.setId(id);
      response.setProperties(objectToStruct({ ...props, uuid: id }));

      const inputProps: Record<string, any> = {};
      for (const field of INPUT_FIELDS) {
        if (props[field] !== undefined) inputProps[field] = props[field];
      }
      response.setInputs(objectToStruct(inputProps));
      callback(null, response);
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        const response = new providerProto.ReadResponse();
        callback(null, response);
        return;
      }
      callback({ code: grpc.status.INTERNAL, message: `Failed to read alias: ${err.message}` });
    }
  },

  async update(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    const inputs = structToObject(call.request.getNews());

    if (call.request.getPreview()) {
      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        ...inputs,
        uuid: id,
      }));
      callback(null, response);
      return;
    }

    try {
      ensureOpnsenseConfigured();
      const apiAlias = aliasToApi(inputs);
      await withFirewallApply(() => setAlias(id, apiAlias));

      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        ...inputs,
        uuid: id,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to update alias: ${err.message}` });
    }
  },

  async delete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    try {
      ensureOpnsenseConfigured();
      await withFirewallApply(() => delAlias(id));
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        // Already gone — treat as success
      } else {
        callback({ code: grpc.status.INTERNAL, message: `Failed to delete alias: ${err.message}` });
        return;
      }
    }
    callback(null, new emptyProto.Empty());
  },
};
