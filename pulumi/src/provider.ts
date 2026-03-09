import { GrpcCallback, GrpcCall, getResourceType } from "./helpers";
import { stackResource } from "./resources/stack";
import { traefikStaticConfigResource } from "./resources/traefikStaticConfig";
import { traefikRouteResource } from "./resources/traefikRoute";
import { opnsenseFirewallRuleResource } from "./resources/opnsenseFirewallRule";
import { opnsenseAliasResource } from "./resources/opnsenseAlias";
import { opnsenseUnboundHostOverrideResource } from "./resources/opnsenseUnboundHostOverride";
import { opnsenseUnboundForwardResource } from "./resources/opnsenseUnboundForward";
import { opnsenseUnboundAclResource } from "./resources/opnsenseUnboundAcl";
import { opnsenseUnboundDnsblResource } from "./resources/opnsenseUnboundDnsbl";
import { lxcContainerResource } from "./resources/lxcContainer";
import { notificationSettingsResource } from "./resources/notificationSettings";
import { unraidVmResource } from "./resources/unraidVm";

import * as grpc from "@grpc/grpc-js";

interface ResourceHandler {
  check: (call: GrpcCall<any, any>, callback: GrpcCallback<any>) => Promise<void>;
  diff: (call: GrpcCall<any, any>, callback: GrpcCallback<any>) => Promise<void>;
  create: (call: GrpcCall<any, any>, callback: GrpcCallback<any>) => Promise<void>;
  read: (call: GrpcCall<any, any>, callback: GrpcCallback<any>) => Promise<void>;
  update: (call: GrpcCall<any, any>, callback: GrpcCallback<any>) => Promise<void>;
  delete: (call: GrpcCall<any, any>, callback: GrpcCallback<any>) => Promise<void>;
}

const resourceHandlers: Record<string, ResourceHandler> = {
  "homelab:index:Stack": stackResource,
  "homelab:index:TraefikStaticConfig": traefikStaticConfigResource,
  "homelab:index:TraefikRoute": traefikRouteResource,
  "homelab:index:OpnsenseFirewallRule": opnsenseFirewallRuleResource,
  "homelab:index:OpnsenseAlias": opnsenseAliasResource,
  "homelab:index:OpnsenseUnboundHostOverride": opnsenseUnboundHostOverrideResource,
  "homelab:index:OpnsenseUnboundForward": opnsenseUnboundForwardResource,
  "homelab:index:OpnsenseUnboundAcl": opnsenseUnboundAclResource,
  "homelab:index:OpnsenseUnboundDnsbl": opnsenseUnboundDnsblResource,
  "homelab:index:LxcContainer": lxcContainerResource,
  "homelab:index:NotificationSettings": notificationSettingsResource,
  "homelab:index:UnraidVm": unraidVmResource,
};

function getHandler(call: GrpcCall<any, any>): ResourceHandler | undefined {
  const resourceType = getResourceType(call);
  return resourceHandlers[resourceType];
}

function unknownResourceError(call: GrpcCall<any, any>): grpc.ServiceError {
  const resourceType = getResourceType(call);
  return {
    code: grpc.status.UNIMPLEMENTED,
    details: `Unknown resource type: ${resourceType}`,
    message: `Unknown resource type: ${resourceType}`,
    metadata: new grpc.Metadata(),
    name: "ServiceError",
  };
}

function safeDispatch(
  call: GrpcCall<any, any>,
  callback: GrpcCallback<any>,
  method: keyof ResourceHandler,
) {
  const handler = getHandler(call);
  if (!handler) {
    callback(unknownResourceError(call));
    return;
  }
  handler[method](call, callback).catch((err: any) => {
    callback({
      code: grpc.status.INTERNAL,
      details: err.message || String(err),
      message: err.message || String(err),
      metadata: new grpc.Metadata(),
      name: "ServiceError",
    });
  });
}

export function dispatchCheck(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
  safeDispatch(call, callback, "check");
}

export function dispatchDiff(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
  safeDispatch(call, callback, "diff");
}

export function dispatchCreate(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
  safeDispatch(call, callback, "create");
}

export function dispatchRead(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
  safeDispatch(call, callback, "read");
}

export function dispatchUpdate(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
  safeDispatch(call, callback, "update");
}

export function dispatchDelete(call: GrpcCall<any, any>, callback: GrpcCallback<any>) {
  safeDispatch(call, callback, "delete");
}
