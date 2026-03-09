import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "https://github.com/tyevco/homelab/releases/download/pulumi-v${VERSION}";

export interface OpnsenseUnboundForwardArgs {
  /** Whether the forward is enabled. Default: true. */
  enabled?: pulumi.Input<boolean>;
  /** Forward type: "forward" or "dot" (DNS over TLS). Default: "forward". */
  type?: pulumi.Input<string>;
  /** Domain to forward queries for (empty for all). */
  domain?: pulumi.Input<string>;
  /** DNS server IP address. */
  server: pulumi.Input<string>;
  /** DNS server port. */
  port?: pulumi.Input<number>;
  /** TLS verification hostname (for DoT). */
  verify?: pulumi.Input<string>;
  /** Whether to use TCP for upstream queries. Default: false. */
  forwardTcpUpstream?: pulumi.Input<boolean>;
  /** Whether to try forwarding first before resolving. Default: false. */
  forwardFirst?: pulumi.Input<boolean>;
  /** Description of the forward entry. */
  description?: pulumi.Input<string>;
}

export class OpnsenseUnboundForward extends pulumi.CustomResource {
  public readonly uuid!: pulumi.Output<string>;
  public readonly enabled!: pulumi.Output<boolean>;
  public readonly type!: pulumi.Output<string>;
  public readonly domain!: pulumi.Output<string | undefined>;
  public readonly server!: pulumi.Output<string>;
  public readonly port!: pulumi.Output<number | undefined>;
  public readonly verify!: pulumi.Output<string | undefined>;
  public readonly forwardTcpUpstream!: pulumi.Output<boolean>;
  public readonly forwardFirst!: pulumi.Output<boolean>;
  public readonly description!: pulumi.Output<string | undefined>;

  constructor(name: string, args: OpnsenseUnboundForwardArgs, opts?: pulumi.CustomResourceOptions) {
    super("homelab:index:OpnsenseUnboundForward", name, {
      uuid: undefined,
      ...args,
    }, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      ...opts,
    });
  }
}
