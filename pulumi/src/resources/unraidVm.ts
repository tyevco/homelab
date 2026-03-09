import * as grpc from "@grpc/grpc-js";
import { structToObject, objectToStruct, makeCheckFailure, GrpcCallback, GrpcCall } from "../helpers";
import {
  listUnraidVms,
  startUnraidVm,
  stopUnraidVm,
  ensureConfigured,
} from "../homelabClient";

const providerProto = require("@pulumi/pulumi/proto/provider_pb");
const emptyProto = require("google-protobuf/google/protobuf/empty_pb");

const REPLACE_FIELDS = ["name", "endpoint"];

export const unraidVmResource = {
  async check(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());
    const failures: any[] = [];

    if (!inputs.name || typeof inputs.name !== "string" || inputs.name.trim() === "") {
      failures.push(makeCheckFailure("name", "name is required"));
    }
    if (!inputs.endpoint || typeof inputs.endpoint !== "string" || inputs.endpoint.trim() === "") {
      failures.push(makeCheckFailure("endpoint", "endpoint is required (Unraid VMs are always agent-based)"));
    }

    // Default running to true if not specified
    if (inputs.running === undefined || inputs.running === null) {
      inputs.running = true;
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

    for (const field of REPLACE_FIELDS) {
      if (olds[field] !== news[field]) {
        diffs.push(field);
        replaces.push(field);
        const propDiff = new providerProto.PropertyDiff();
        propDiff.setKind(providerProto.PropertyDiff.Kind.UPDATE_REPLACE);
        propDiff.setInputdiff(true);
        detailedDiffMap.set(field, propDiff);
      }
    }

    if (olds.running !== news.running) {
      diffs.push("running");
      const propDiff = new providerProto.PropertyDiff();
      propDiff.setKind(providerProto.PropertyDiff.Kind.UPDATE);
      propDiff.setInputdiff(true);
      detailedDiffMap.set("running", propDiff);
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
        state: "unknown",
      }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();
      const { name, endpoint } = inputs;

      if (inputs.running !== false) {
        await startUnraidVm(name, endpoint);
      }

      const vms = await listUnraidVms(endpoint);
      const vm = vms.find((v) => v.name === name);
      const state = vm ? vm.state : "unknown";

      const response = new providerProto.CreateResponse();
      response.setId(name);
      response.setProperties(objectToStruct({
        name,
        endpoint,
        running: inputs.running !== false,
        state,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to create Unraid VM: ${err.message}` });
    }
  },

  async read(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    const currentInputs = structToObject(call.request.getInputs());

    try {
      ensureConfigured();
      const endpoint = currentInputs.endpoint;
      const vms = await listUnraidVms(endpoint);
      const vm = vms.find((v) => v.name === id);

      if (!vm) {
        // VM not found — signal deleted externally
        const response = new providerProto.ReadResponse();
        callback(null, response);
        return;
      }

      const running = vm.state === "started";
      const response = new providerProto.ReadResponse();
      response.setId(id);
      response.setProperties(objectToStruct({
        name: id,
        endpoint,
        running,
        state: vm.state,
      }));
      response.setInputs(objectToStruct({
        name: id,
        endpoint,
        running,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to read Unraid VM: ${err.message}` });
    }
  },

  async update(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const olds = structToObject(call.request.getOlds());
    const inputs = structToObject(call.request.getNews());

    if (call.request.getPreview()) {
      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        ...inputs,
        state: olds.state || "unknown",
      }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();
      const { name, endpoint } = inputs;
      const runningChanged = olds.running !== inputs.running;

      if (runningChanged) {
        if (inputs.running !== false) {
          await startUnraidVm(name, endpoint);
        } else {
          await stopUnraidVm(name, endpoint);
        }
      }

      const vms = await listUnraidVms(endpoint);
      const vm = vms.find((v) => v.name === name);
      const state = vm ? vm.state : "unknown";

      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        name,
        endpoint,
        running: inputs.running !== false,
        state,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to update Unraid VM: ${err.message}` });
    }
  },

  async delete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    const inputsStruct = typeof (call.request as any).getInputs === "function" ? (call.request as any).getInputs() : null;
    const currentInputs = structToObject(inputsStruct);
    const endpoint = currentInputs.endpoint;

    try {
      ensureConfigured();
      await stopUnraidVm(id, endpoint);
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        // Already gone — treat as success
      } else {
        callback({ code: grpc.status.INTERNAL, message: `Failed to delete Unraid VM: ${err.message}` });
        return;
      }
    }
    callback(null, new emptyProto.Empty());
  },
};
