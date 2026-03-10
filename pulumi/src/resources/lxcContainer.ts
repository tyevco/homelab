import * as grpc from "@grpc/grpc-js";
import { structToObject, objectToStruct, makeCheckFailure, valuesEqual, GrpcCallback, GrpcCall } from "../helpers";
import {
  getLxcContainer,
  createLxcContainer,
  cloneLxcContainer,
  deleteLxcContainer,
  saveLxcConfig,
  startLxcContainer,
  stopLxcContainer,
  ensureConfigured,
  LxcContainerInfo,
} from "../homelabClient";

const providerProto = require("@pulumi/pulumi/proto/provider_pb");
const emptyProto = require("google-protobuf/google/protobuf/empty_pb");

const REPLACE_FIELDS = ["name", "dist", "release", "arch", "autostart", "sourceContainer", "snapshotName", "initialConfig"];
const UPDATE_FIELDS = ["config"];

function statusToStateText(status: number): string {
  switch (status) {
    case 3: return "running";
    case 4: return "stopped";
    case 5: return "frozen";
    default: return "unknown";
  }
}

function containerToOutputs(info: LxcContainerInfo, inputs: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {
    name: inputs.name,
    dist: inputs.dist || "",
    release: inputs.release || "",
    arch: inputs.arch || "",
    config: inputs.config !== undefined ? inputs.config : (info.config || ""),
    autostart: inputs.autostart !== undefined ? inputs.autostart : (info.autostart || false),
    status: info.status,
    stateText: statusToStateText(info.status),
    ip: info.ip || "",
    pid: info.pid || 0,
    memory: info.memory || "",
  };
  if (inputs.sourceContainer !== undefined) {
    out.sourceContainer = inputs.sourceContainer;
  }
  if (inputs.snapshotName !== undefined) {
    out.snapshotName = inputs.snapshotName;
  }
  if (inputs.initialConfig !== undefined) {
    out.initialConfig = inputs.initialConfig;
  }
  return out;
}

export const lxcContainerResource = {
  async check(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());
    const failures: any[] = [];

    if (!inputs.name) {
      failures.push(makeCheckFailure("name", "name is required"));
    } else if (!/^[a-z0-9_.-]+$/.test(inputs.name)) {
      failures.push(makeCheckFailure("name", "name must match ^[a-z0-9_.-]+$"));
    }

    const isClone = !!inputs.sourceContainer;

    if (isClone) {
      if (!/^[a-z0-9_.-]+$/.test(inputs.sourceContainer)) {
        failures.push(makeCheckFailure("sourceContainer", "sourceContainer must match ^[a-z0-9_.-]+$"));
      }
      if (inputs.snapshotName !== undefined && !/^[a-z0-9_.-]+$/.test(inputs.snapshotName)) {
        failures.push(makeCheckFailure("snapshotName", "snapshotName must match ^[a-z0-9_.-]+$"));
      }
    } else {
      if (inputs.snapshotName !== undefined) {
        failures.push(makeCheckFailure("snapshotName", "snapshotName can only be used with sourceContainer"));
      }
      if (!inputs.dist) {
        failures.push(makeCheckFailure("dist", "dist is required"));
      }
      if (!inputs.release) {
        failures.push(makeCheckFailure("release", "release is required"));
      }
      if (!inputs.arch) {
        failures.push(makeCheckFailure("arch", "arch is required"));
      }
    }

    // Default autostart to false if not specified
    if (inputs.autostart === undefined || inputs.autostart === null) {
      inputs.autostart = false;
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

    // Fields that require replacement
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

    // Fields that can be updated in-place
    for (const field of UPDATE_FIELDS) {
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
        status: 0,
        stateText: "unknown",
        ip: "",
        pid: 0,
        memory: "",
      }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();

      if (inputs.sourceContainer) {
        await cloneLxcContainer(inputs.sourceContainer, inputs.name, inputs.snapshotName, inputs.initialConfig);
      } else {
        await createLxcContainer(inputs.name, inputs.dist, inputs.release, inputs.arch);
      }

      if (inputs.config) {
        await saveLxcConfig(inputs.name, inputs.config);
      }

      await startLxcContainer(inputs.name);

      const info = await getLxcContainer(inputs.name);
      const outputs = containerToOutputs(info, inputs);

      const response = new providerProto.CreateResponse();
      response.setId(inputs.name);
      response.setProperties(objectToStruct(outputs));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to create LXC container: ${err.message}` });
    }
  },

  async read(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    const currentInputs = structToObject(call.request.getInputs());

    try {
      ensureConfigured();
      const info = await getLxcContainer(id);

      const outputs: Record<string, any> = {
        name: info.name,
        dist: currentInputs.dist || "",
        release: currentInputs.release || "",
        arch: currentInputs.arch || "",
        config: info.config || "",
        autostart: info.autostart || false,
        status: info.status,
        stateText: statusToStateText(info.status),
        ip: info.ip || "",
        pid: info.pid || 0,
        memory: info.memory || "",
      };
      if (currentInputs.sourceContainer !== undefined) {
        outputs.sourceContainer = currentInputs.sourceContainer;
      }
      if (currentInputs.snapshotName !== undefined) {
        outputs.snapshotName = currentInputs.snapshotName;
      }
      if (currentInputs.initialConfig !== undefined) {
        outputs.initialConfig = currentInputs.initialConfig;
      }

      const inputsRecord: Record<string, any> = {
        name: info.name,
        dist: currentInputs.dist || "",
        release: currentInputs.release || "",
        arch: currentInputs.arch || "",
        config: info.config || "",
        autostart: info.autostart || false,
      };
      if (currentInputs.sourceContainer !== undefined) {
        inputsRecord.sourceContainer = currentInputs.sourceContainer;
      }
      if (currentInputs.snapshotName !== undefined) {
        inputsRecord.snapshotName = currentInputs.snapshotName;
      }
      if (currentInputs.initialConfig !== undefined) {
        inputsRecord.initialConfig = currentInputs.initialConfig;
      }

      const response = new providerProto.ReadResponse();
      response.setId(id);
      response.setProperties(objectToStruct(outputs));
      response.setInputs(objectToStruct(inputsRecord));
      callback(null, response);
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        const response = new providerProto.ReadResponse();
        callback(null, response);
        return;
      }
      callback({ code: grpc.status.INTERNAL, message: `Failed to read LXC container: ${err.message}` });
    }
  },

  async update(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const olds = structToObject(call.request.getOlds());
    const inputs = structToObject(call.request.getNews());

    if (call.request.getPreview()) {
      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        ...inputs,
        status: olds.status || 0,
        stateText: olds.stateText || "unknown",
        ip: olds.ip || "",
        pid: olds.pid || 0,
        memory: olds.memory || "",
      }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();

      if ((olds.config || "") !== (inputs.config || "") && inputs.config !== undefined) {
        await saveLxcConfig(inputs.name, inputs.config);
      }

      const info = await getLxcContainer(inputs.name);
      const outputs = containerToOutputs(info, inputs);

      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct(outputs));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to update LXC container: ${err.message}` });
    }
  },

  async delete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    try {
      ensureConfigured();
      // Stop the container before deleting (ignore errors if already stopped)
      try {
        await stopLxcContainer(id);
      } catch {
        // Container may already be stopped or not exist
      }
      await deleteLxcContainer(id);
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        // Already gone — treat as success
      } else {
        callback({ code: grpc.status.INTERNAL, message: `Failed to delete LXC container: ${err.message}` });
        return;
      }
    }
    callback(null, new emptyProto.Empty());
  },
};
