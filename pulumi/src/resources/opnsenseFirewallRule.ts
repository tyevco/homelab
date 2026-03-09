import * as grpc from "@grpc/grpc-js";
import { structToObject, objectToStruct, makeCheckFailure, valuesEqual, GrpcCallback, GrpcCall } from "../helpers";
import {
  ensureOpnsenseConfigured,
  withFirewallApply,
  addFirewallRule,
  getFirewallRule,
  setFirewallRule,
  delFirewallRule,
  ruleToApi,
  ruleFromApi,
} from "../opnsenseClient";

const providerProto = require("@pulumi/pulumi/proto/provider_pb");
const emptyProto = require("google-protobuf/google/protobuf/empty_pb");

const INPUT_FIELDS = [
  "description", "interface", "ipprotocol", "protocol",
  "sourceNet", "sourcePort", "destinationNet", "destinationPort",
  "action", "direction", "log", "quick", "disabled", "sequence",
];

export const opnsenseFirewallRuleResource = {
  async check(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());
    const failures: any[] = [];

    const VALID_ACTIONS = ["pass", "block", "reject"];
    const VALID_DIRECTIONS = ["in", "out"];
    const VALID_IPPROTOCOLS = ["inet", "inet6", "inet46"];
    if (!inputs.action) {
      failures.push(makeCheckFailure("action", "action is required (pass, block, or reject)"));
    } else if (!VALID_ACTIONS.includes(inputs.action)) {
      failures.push(makeCheckFailure("action", `action must be one of: ${VALID_ACTIONS.join(", ")}`));
    }
    if (!inputs.interface) {
      failures.push(makeCheckFailure("interface", "interface is required (e.g., lan, wan, opt1)"));
    }

    // Apply defaults
    if (inputs.ipprotocol === undefined) inputs.ipprotocol = "inet";
    if (inputs.protocol === undefined) inputs.protocol = "any";
    if (inputs.direction === undefined) inputs.direction = "in";
    if (inputs.quick === undefined) inputs.quick = true;

    // Validate enum fields
    if (inputs.direction && !VALID_DIRECTIONS.includes(inputs.direction)) {
      failures.push(makeCheckFailure("direction", `direction must be one of: ${VALID_DIRECTIONS.join(", ")}`));
    }
    if (inputs.ipprotocol && !VALID_IPPROTOCOLS.includes(inputs.ipprotocol)) {
      failures.push(makeCheckFailure("ipprotocol", `ipprotocol must be one of: ${VALID_IPPROTOCOLS.join(", ")}`));
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
      const apiRule = ruleToApi(inputs);
      const { uuid } = await withFirewallApply(() => addFirewallRule(apiRule));

      const response = new providerProto.CreateResponse();
      response.setId(uuid);
      response.setProperties(objectToStruct({
        ...inputs,
        uuid,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to create firewall rule: ${err.message}` });
    }
  },

  async read(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();

    try {
      ensureOpnsenseConfigured();
      const { rule } = await getFirewallRule(id);
      const props = ruleFromApi(rule);

      const response = new providerProto.ReadResponse();
      response.setId(id);
      response.setProperties(objectToStruct({ ...props, uuid: id }));

      // Build inputs (only input fields, no uuid)
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
      callback({ code: grpc.status.INTERNAL, message: `Failed to read firewall rule: ${err.message}` });
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
      const apiRule = ruleToApi(inputs);
      await withFirewallApply(() => setFirewallRule(id, apiRule));

      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({
        ...inputs,
        uuid: id,
      }));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to update firewall rule: ${err.message}` });
    }
  },

  async delete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const id = call.request.getId();
    try {
      ensureOpnsenseConfigured();
      await withFirewallApply(() => delFirewallRule(id));
    } catch (err: any) {
      if (err.message && (err.message.includes("404") || err.message.includes("not found"))) {
        // Already gone — treat as success
      } else {
        callback({ code: grpc.status.INTERNAL, message: `Failed to delete firewall rule: ${err.message}` });
        return;
      }
    }
    callback(null, new emptyProto.Empty());
  },
};
