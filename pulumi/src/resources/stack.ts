import * as grpc from "@grpc/grpc-js";
import { structToObject, objectToStruct, makeCheckFailure, GrpcCallback, GrpcCall } from "../helpers";
import {
  getStack,
  createStack,
  updateStack,
  deleteStack,
  startStack,
  stopStack,
  ensureConfigured,
  StackInfo,
  ExtraFile,
} from "../homelabClient";
import { diffCompose } from "../composeDiff";
import { diffEnvFile } from "../envDiff";

const providerProto = require("@pulumi/pulumi/proto/provider_pb");
const emptyProto = require("google-protobuf/google/protobuf/empty_pb");

function setDetailedDiff(
  map: any,
  path: string,
  kind: "ADD" | "DELETE" | "UPDATE" | "UPDATE_REPLACE",
): void {
  const propDiff = new providerProto.PropertyDiff();
  propDiff.setKind(providerProto.PropertyDiff.Kind[kind]);
  propDiff.setInputdiff(true);
  map.set(path, propDiff);
}

function stackToOutputs(info: StackInfo, inputs: Record<string, any>): Record<string, any> {
  return {
    name: info.name,
    composeYaml: inputs.composeYaml !== undefined ? inputs.composeYaml : info.composeYaml,
    envFile: inputs.envFile !== undefined ? inputs.envFile : (info.envFile || ""),
    composeOverride: inputs.composeOverride !== undefined ? inputs.composeOverride : (info.composeOverride || ""),
    autostart: inputs.autostart !== undefined ? inputs.autostart : (info.autostart || false),
    displayName: inputs.displayName !== undefined ? inputs.displayName : (info.displayName || ""),
    running: inputs.running !== false,
    status: info.status,
    containers: info.containers || [],
    extraFiles: info.extraFiles || [],
  };
}

export const stackResource = {
  async check(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());
    const failures: any[] = [];

    if (!inputs.name) {
      failures.push(makeCheckFailure("name", "name is required"));
    }
    if (!inputs.composeYaml) {
      failures.push(makeCheckFailure("composeYaml", "composeYaml is required"));
    }

    // Validate extraFiles names if provided
    if (Array.isArray(inputs.extraFiles)) {
      for (let i = 0; i < inputs.extraFiles.length; i++) {
        const file = inputs.extraFiles[i];
        if (!file || typeof file.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file.name)) {
          failures.push(makeCheckFailure(`extraFiles[${i}].name`, `extraFiles[${i}].name must match ^[a-zA-Z0-9][a-zA-Z0-9._-]*$`));
        }
      }
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

    // Name change requires replacement
    if (olds.name !== news.name) {
      diffs.push("name");
      replaces.push("name");
      setDetailedDiff(detailedDiffMap, "name", "UPDATE_REPLACE");
    }

    // Compose (main + override merged) → granular diff
    const composeChanged = olds.composeYaml !== news.composeYaml;
    const overrideChanged = (olds.composeOverride || "") !== (news.composeOverride || "");
    if (composeChanged || overrideChanged) {
      if (composeChanged) diffs.push("composeYaml");
      if (overrideChanged) diffs.push("composeOverride");
      try {
        const changes = diffCompose(
          olds.composeYaml || "", olds.composeOverride,
          news.composeYaml || "", news.composeOverride,
        );
        for (const change of changes) {
          setDetailedDiff(detailedDiffMap, `compose.${change.path}`, change.kind);
        }
      } catch {
        if (composeChanged) setDetailedDiff(detailedDiffMap, "composeYaml", "UPDATE");
        if (overrideChanged) setDetailedDiff(detailedDiffMap, "composeOverride", "UPDATE");
      }
    }

    // Env file → per-variable diff
    if ((olds.envFile || "") !== (news.envFile || "")) {
      diffs.push("envFile");
      try {
        const changes = diffEnvFile(olds.envFile || "", news.envFile || "");
        for (const change of changes) {
          setDetailedDiff(detailedDiffMap, `envFile.${change.path}`, change.kind);
        }
      } catch {
        setDetailedDiff(detailedDiffMap, "envFile", "UPDATE");
      }
    }

    // ExtraFiles deep compare
    if (JSON.stringify(olds.extraFiles || []) !== JSON.stringify(news.extraFiles || [])) {
      diffs.push("extraFiles");
      setDetailedDiff(detailedDiffMap, "extraFiles", "UPDATE");
    }

    // Simple properties
    if (olds.running !== news.running) {
      diffs.push("running");
      setDetailedDiff(detailedDiffMap, "running", "UPDATE");
    }

    if ((olds.autostart || false) !== (news.autostart || false)) {
      diffs.push("autostart");
      setDetailedDiff(detailedDiffMap, "autostart", "UPDATE");
    }

    if ((olds.displayName || "") !== (news.displayName || "")) {
      diffs.push("displayName");
      setDetailedDiff(detailedDiffMap, "displayName", "UPDATE");
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
        status: "unknown",
        containers: [],
      }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();
      const shouldStart = inputs.running !== false;
      const info = await createStack(inputs.name, inputs.composeYaml, inputs.envFile, shouldStart, inputs.composeOverride, inputs.autostart, inputs.displayName, inputs.extraFiles);
      const outputs = stackToOutputs(info, inputs);

      const response = new providerProto.CreateResponse();
      response.setId(inputs.name);
      response.setProperties(objectToStruct(outputs));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to create stack: ${err.message}` });
    }
  },

  async read(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    const currentInputs = structToObject(call.request.getInputs());

    try {
      ensureConfigured();
      const info = await getStack(id);

      const isRunning = info.status === "running" || info.status === "partial";
      const outputs = {
        name: info.name,
        composeYaml: info.composeYaml,
        envFile: info.envFile || "",
        composeOverride: info.composeOverride || "",
        autostart: info.autostart || false,
        displayName: info.displayName || "",
        running: isRunning,
        status: info.status,
        containers: info.containers || [],
        extraFiles: info.extraFiles || [],
      };

      const response = new providerProto.ReadResponse();
      response.setId(id);
      response.setProperties(objectToStruct(outputs));
      response.setInputs(objectToStruct({
        name: info.name,
        composeYaml: info.composeYaml,
        envFile: info.envFile || "",
        composeOverride: info.composeOverride || "",
        autostart: info.autostart || false,
        displayName: info.displayName || "",
        running: currentInputs.running !== undefined ? currentInputs.running : isRunning,
        extraFiles: info.extraFiles || [],
      }));
      callback(null, response);
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        const response = new providerProto.ReadResponse();
        callback(null, response);
        return;
      }
      callback({ code: grpc.status.INTERNAL, message: `Failed to read stack: ${err.message}` });
    }
  },

  async update(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const olds = structToObject(call.request.getOlds());
    const inputs = structToObject(call.request.getNews());

    if (call.request.getPreview()) {
      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        ...inputs,
        status: olds.status || "unknown",
        containers: olds.containers || [],
      }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();

      // Check if compose or env changed
      const composeChanged = olds.composeYaml !== inputs.composeYaml;
      const envChanged = (olds.envFile || "") !== (inputs.envFile || "");
      const overrideChanged = (olds.composeOverride || "") !== (inputs.composeOverride || "");
      const autostartChanged = (olds.autostart || false) !== (inputs.autostart || false);
      const displayNameChanged = (olds.displayName || "") !== (inputs.displayName || "");
      const extraFilesChanged = JSON.stringify(olds.extraFiles || []) !== JSON.stringify(inputs.extraFiles || []);
      const runningChanged = olds.running !== inputs.running;

      if (composeChanged || envChanged || overrideChanged || autostartChanged || displayNameChanged || extraFilesChanged) {
        // Update the stack (PUT will restart if it was running)
        await updateStack(inputs.name, inputs.composeYaml, inputs.envFile, inputs.composeOverride, inputs.autostart, inputs.displayName, inputs.extraFiles);
      }

      // Handle running state changes
      if (runningChanged) {
        if (inputs.running) {
          await startStack(inputs.name);
        } else {
          await stopStack(inputs.name);
        }
      }

      const info = await getStack(inputs.name);
      const outputs = stackToOutputs(info, inputs);

      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct(outputs));
      callback(null, response);
    } catch (err: any) {
      // Stack was deleted externally — recreate it and continue
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        try {
          await createStack(
            inputs.name,
            inputs.composeYaml,
            inputs.envFile,
            inputs.running !== false,
            inputs.composeOverride,
            inputs.autostart,
            inputs.displayName,
            inputs.extraFiles,
          );
          const info = await getStack(inputs.name);
          const response = new providerProto.UpdateResponse();
          response.setProperties(objectToStruct(stackToOutputs(info, inputs)));
          callback(null, response);
        } catch (createErr: any) {
          callback({ code: grpc.status.INTERNAL, message: `Failed to recreate stack: ${createErr.message}` });
        }
        return;
      }
      callback({ code: grpc.status.INTERNAL, message: `Failed to update stack: ${err.message}` });
    }
  },

  async delete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    try {
      ensureConfigured();
      await deleteStack(id);
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        // Already gone — treat as success
      } else {
        callback({ code: grpc.status.INTERNAL, message: `Failed to delete stack: ${err.message}` });
        return;
      }
    }
    callback(null, new emptyProto.Empty());
  },
};
