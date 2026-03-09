import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "github://api.github.com/tyevco/pulumi-homelab";

export interface UnraidVmArgs {
  /** The VM name as reported by Unraid/virsh. */
  name: pulumi.Input<string>;
  /** The agent endpoint name for the Unraid host. Triggers replacement on change. */
  endpoint: pulumi.Input<string>;
  /** Whether the VM should be running (default: true). */
  running?: pulumi.Input<boolean>;
}

/**
 * Manages an Unraid VM via the homelab agent REST API.
 * Supports starting and stopping VMs. Unraid VMs are always agent-based —
 * an `endpoint` pointing to the Unraid agent is required.
 *
 * ## Example Usage
 *
 * ```typescript
 * const vm = new homelab.UnraidVm("ubuntu-vm", {
 *   name: "ubuntu",
 *   endpoint: "unraid-agent",
 *   running: true,
 * });
 * ```
 */
export class UnraidVm extends pulumi.CustomResource {
  public readonly name!: pulumi.Output<string>;
  public readonly endpoint!: pulumi.Output<string>;
  public readonly running!: pulumi.Output<boolean>;
  /** Current VM state as reported by Unraid (started, stopped, unknown). */
  public readonly state!: pulumi.Output<string>;

  constructor(name: string, args: UnraidVmArgs, opts?: pulumi.CustomResourceOptions) {
    super("homelab:index:UnraidVm", name, {
      state: undefined,
      ...args,
    }, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      ...opts,
    });
  }
}
