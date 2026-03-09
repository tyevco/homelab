import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "https://github.com/tyevco/homelab/releases/download/pulumi-v${VERSION}";

export interface OpnsenseUnboundHostOverrideArgs {
  /** Whether the host override is enabled. Default: true. */
  enabled?: pulumi.Input<boolean>;
  /** Hostname (e.g., "myhost"). */
  hostname?: pulumi.Input<string>;
  /** Domain name (e.g., "example.com"). */
  domain: pulumi.Input<string>;
  /** DNS record type (A, AAAA, MX, TXT). Default: "A". */
  rr?: pulumi.Input<string>;
  /** IP address or target for the override. */
  server?: pulumi.Input<string>;
  /** MX priority (for MX records). */
  mxprio?: pulumi.Input<number>;
  /** MX mail server hostname. */
  mx?: pulumi.Input<string>;
  /** TXT record data. */
  txtdata?: pulumi.Input<string>;
  /** TTL in seconds. */
  ttl?: pulumi.Input<number>;
  /** Whether to create a PTR record. Default: true. */
  addptr?: pulumi.Input<boolean>;
  /** Description of the host override. */
  description?: pulumi.Input<string>;
}

export class OpnsenseUnboundHostOverride extends pulumi.CustomResource {
  public readonly uuid!: pulumi.Output<string>;
  public readonly enabled!: pulumi.Output<boolean>;
  public readonly hostname!: pulumi.Output<string | undefined>;
  public readonly domain!: pulumi.Output<string>;
  public readonly rr!: pulumi.Output<string>;
  public readonly server!: pulumi.Output<string | undefined>;
  public readonly mxprio!: pulumi.Output<number | undefined>;
  public readonly mx!: pulumi.Output<string | undefined>;
  public readonly txtdata!: pulumi.Output<string | undefined>;
  public readonly ttl!: pulumi.Output<number | undefined>;
  public readonly addptr!: pulumi.Output<boolean>;
  public readonly description!: pulumi.Output<string | undefined>;

  constructor(name: string, args: OpnsenseUnboundHostOverrideArgs, opts?: pulumi.CustomResourceOptions) {
    super("homelab:index:OpnsenseUnboundHostOverride", name, {
      uuid: undefined,
      ...args,
    }, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      ...opts,
    });
  }
}
