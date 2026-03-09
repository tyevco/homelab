import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "https://github.com/tyevco/homelab/releases/download/pulumi-v${VERSION}";

export interface OpnsenseUnboundDnsblArgs {
  /** Whether the DNSBL entry is enabled. Default: true. */
  enabled?: pulumi.Input<boolean>;
  /** DNSBL type. */
  type?: pulumi.Input<string>;
  /** DNSBL lists to use. */
  lists?: pulumi.Input<string>;
  /** Allowlisted domains. */
  allowlists?: pulumi.Input<string>;
  /** Blocklisted domains. */
  blocklists?: pulumi.Input<string>;
  /** Wildcard domain entries. */
  wildcards?: pulumi.Input<string>;
  /** Source networks. */
  sourceNets?: pulumi.Input<string>;
  /** Listen address. */
  address?: pulumi.Input<string>;
  /** Whether to return NXDOMAIN instead of the blocklist address. */
  nxdomain?: pulumi.Input<boolean>;
  /** Cache TTL in seconds. Default: 72000. */
  cacheTtl?: pulumi.Input<number>;
  /** Description of the DNSBL entry. */
  description: pulumi.Input<string>;
}

export class OpnsenseUnboundDnsbl extends pulumi.CustomResource {
  public readonly uuid!: pulumi.Output<string>;
  public readonly enabled!: pulumi.Output<boolean>;
  public readonly type!: pulumi.Output<string | undefined>;
  public readonly lists!: pulumi.Output<string | undefined>;
  public readonly allowlists!: pulumi.Output<string | undefined>;
  public readonly blocklists!: pulumi.Output<string | undefined>;
  public readonly wildcards!: pulumi.Output<string | undefined>;
  public readonly sourceNets!: pulumi.Output<string | undefined>;
  public readonly address!: pulumi.Output<string | undefined>;
  public readonly nxdomain!: pulumi.Output<boolean | undefined>;
  public readonly cacheTtl!: pulumi.Output<number>;
  public readonly description!: pulumi.Output<string>;

  constructor(name: string, args: OpnsenseUnboundDnsblArgs, opts?: pulumi.CustomResourceOptions) {
    super("homelab:index:OpnsenseUnboundDnsbl", name, {
      uuid: undefined,
      ...args,
    }, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      ...opts,
    });
  }
}
