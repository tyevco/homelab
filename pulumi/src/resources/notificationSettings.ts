import * as grpc from "@grpc/grpc-js";
import { structToObject, objectToStruct, makeCheckFailure, valuesEqual, GrpcCallback, GrpcCall } from "../helpers";
import {
  getNotificationSettings,
  saveNotificationSettings,
  ensureConfigured,
  NotificationSettings,
} from "../homelabClient";

const providerProto = require("@pulumi/pulumi/proto/provider_pb");
const emptyProto = require("google-protobuf/google/protobuf/empty_pb");

const NOTIFICATION_ID = "notification-settings";

const SETTINGS_FIELDS: (keyof NotificationSettings)[] = [
  "ntfyEnabled",
  "ntfyUrl",
  "discordEnabled",
  "discordWebhookUrl",
  "gotifyEnabled",
  "gotifyUrl",
  "gotifyToken",
  "webhookEnabled",
  "webhookUrl",
];

function settingsToOutputs(settings: NotificationSettings): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of SETTINGS_FIELDS) {
    if (settings[field] !== undefined) {
      out[field] = settings[field];
    }
  }
  return out;
}

export const notificationSettingsResource = {
  async check(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());
    const failures: any[] = [];

    // Validate: if *Enabled is true, the corresponding URL/token must be set
    if (inputs.ntfyEnabled && !inputs.ntfyUrl) {
      failures.push(makeCheckFailure("ntfyUrl", "ntfyUrl is required when ntfyEnabled is true"));
    }
    if (inputs.discordEnabled && !inputs.discordWebhookUrl) {
      failures.push(makeCheckFailure("discordWebhookUrl", "discordWebhookUrl is required when discordEnabled is true"));
    }
    if (inputs.gotifyEnabled && !inputs.gotifyUrl) {
      failures.push(makeCheckFailure("gotifyUrl", "gotifyUrl is required when gotifyEnabled is true"));
    }
    if (inputs.gotifyEnabled && !inputs.gotifyToken) {
      failures.push(makeCheckFailure("gotifyToken", "gotifyToken is required when gotifyEnabled is true"));
    }
    if (inputs.webhookEnabled && !inputs.webhookUrl) {
      failures.push(makeCheckFailure("webhookUrl", "webhookUrl is required when webhookEnabled is true"));
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

    for (const field of SETTINGS_FIELDS) {
      if (!valuesEqual(olds[field], news[field])) {
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
      response.setId(NOTIFICATION_ID);
      response.setProperties(objectToStruct(inputs));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();
      const saved = await saveNotificationSettings(inputs as NotificationSettings);
      const response = new providerProto.CreateResponse();
      response.setId(NOTIFICATION_ID);
      response.setProperties(objectToStruct(settingsToOutputs(saved)));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to create notification settings: ${err.message}` });
    }
  },

  async read(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    try {
      ensureConfigured();
      const settings = await getNotificationSettings();
      const outputs = settingsToOutputs(settings);

      const response = new providerProto.ReadResponse();
      response.setId(NOTIFICATION_ID);
      response.setProperties(objectToStruct(outputs));
      response.setInputs(objectToStruct(outputs));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to read notification settings: ${err.message}` });
    }
  },

  async update(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    const inputs = structToObject(call.request.getNews());

    if (call.request.getPreview()) {
      const olds = structToObject(call.request.getOlds());
      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct({ ...olds, ...inputs }));
      callback(null, response);
      return;
    }

    try {
      ensureConfigured();
      const saved = await saveNotificationSettings(inputs as NotificationSettings);
      const response = new providerProto.UpdateResponse();
      response.setProperties(objectToStruct(settingsToOutputs(saved)));
      callback(null, response);
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: `Failed to update notification settings: ${err.message}` });
    }
  },

  async delete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
    // Notification settings are a singleton — delete is a no-op
    callback(null, new emptyProto.Empty());
  },
};
