import * as grpc from "@grpc/grpc-js";
import { structToObject, objectToStruct, makeCheckFailure, valuesEqual, GrpcCallback, GrpcCall } from "../helpers";
import {
  ensureOpnsenseConfigured,
  withUnboundReconfigure,
  addForward,
  getForward,
  setForward,
  delForward,
  forwardToApi,
  forwardFromApi,
} from "../opnsenseClient";

const providerProto = require("@pulumi/pulumi/proto/provider_pb");
const emptyProto = require("google-protobuf/google/protobuf/empty_pb");

const INPUT_FIELDS = [
  "enabled", "type", "domain", "server", "port",
  "verify", "forwardTcpUpstream", "forwardFirst", "description",
];

export const opnsenseUnboundForwardResource = {
  async check(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());
    const failures: any[] = [];

    if (!inputs.server) {
      failures.push(makeCheckFailure("server", "server is required"));
    }

    // Apply defaults
    const VALID_TYPES = ["forward", "dot"];
    if (inputs.enabled === undefined) inputs.enabled = true;
    if (inputs.type === undefined) inputs.type = "forward";
    if (inputs.forwardTcpUpstream === undefined) inputs.forwardTcpUpstream = false;
    if (inputs.forwardFirst === undefined) inputs.forwardFirst = false;

    // Validate enum fields
    if (inputs.type && !VALID_TYPES.includes(inputs.type)) {
      failures.push(makeCheckFailure("type", `type must be one of: ${VALID_TYPES.join(", ")}`));
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
      const apiData = forwardToApi(inputs);
      const { uuid } = await withUnboundReconfigure(() => addForward(apiData));

      const response = new providerProto.CreateResponse();
      response.setId(uuid);
      response.setProperties(objectToStruct({
        ...inputs,
        uuid,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to create forward: ${err.message}` });
    }
  },

  async read(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();

    try {
      ensureOpnsenseConfigured();
      const { forward } = await getForward(id);
      const props = forwardFromApi(forward);

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
      callback({ code: grpc.status.INTERNAL, message: `Failed to read forward: ${err.message}` });
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
      const apiData = forwardToApi(inputs);
      await withUnboundReconfigure(() => setForward(id, apiData));

      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        ...inputs,
        uuid: id,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to update forward: ${err.message}` });
    }
  },

  async delete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    try {
      ensureOpnsenseConfigured();
      await withUnboundReconfigure(() => delForward(id));
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        // Already gone — treat as success
      } else {
        callback({ code: grpc.status.INTERNAL, message: `Failed to delete forward: ${err.message}` });
        return;
      }
    }
    callback(null, new emptyProto.Empty());
  },
};
