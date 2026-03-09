import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "github://api.github.com/tyevco/pulumi-homelab";

export interface OpnsenseFirewallRuleArgs {
  /** Rule action: pass, block, or reject. */
  action: pulumi.Input<string>;
  /** Network interface (e.g., lan, wan, opt1). */
  interface: pulumi.Input<string>;
  /** Description of the firewall rule. */
  description?: pulumi.Input<string>;
  /** IP protocol version: inet (IPv4), inet6 (IPv6), or inet46 (both). Default: inet. */
  ipprotocol?: pulumi.Input<string>;
  /** Protocol to match (e.g., any, TCP, UDP, TCP/UDP, ICMP). Default: any. */
  protocol?: pulumi.Input<string>;
  /** Source network or address (e.g., any, 192.168.1.0/24, or an alias name). */
  sourceNet?: pulumi.Input<string>;
  /** Source port or port range. */
  sourcePort?: pulumi.Input<string>;
  /** Destination network or address. */
  destinationNet?: pulumi.Input<string>;
  /** Destination port or port range. */
  destinationPort?: pulumi.Input<string>;
  /** Traffic direction: in or out. Default: in. */
  direction?: pulumi.Input<string>;
  /** Whether to log packets matching this rule. */
  log?: pulumi.Input<boolean>;
  /** Apply quick match (stop processing after this rule). Default: true. */
  quick?: pulumi.Input<boolean>;
  /** Whether the rule is disabled. */
  disabled?: pulumi.Input<boolean>;
  /** Rule priority/order sequence number. */
  sequence?: pulumi.Input<number>;
}

export class OpnsenseFirewallRule extends pulumi.CustomResource {
  public readonly uuid!: pulumi.Output<string>;
  public readonly action!: pulumi.Output<string>;
  public readonly interface!: pulumi.Output<string>;
  public readonly description!: pulumi.Output<string | undefined>;
  public readonly ipprotocol!: pulumi.Output<string>;
  public readonly protocol!: pulumi.Output<string>;
  public readonly sourceNet!: pulumi.Output<string | undefined>;
  public readonly sourcePort!: pulumi.Output<string | undefined>;
  public readonly destinationNet!: pulumi.Output<string | undefined>;
  public readonly destinationPort!: pulumi.Output<string | undefined>;
  public readonly direction!: pulumi.Output<string>;
  public readonly log!: pulumi.Output<boolean | undefined>;
  public readonly quick!: pulumi.Output<boolean>;
  public readonly disabled!: pulumi.Output<boolean | undefined>;
  public readonly sequence!: pulumi.Output<number | undefined>;

  constructor(name: string, args: OpnsenseFirewallRuleArgs, opts?: pulumi.CustomResourceOptions) {
    super("homelab:index:OpnsenseFirewallRule", name, {
      uuid: undefined,
      ...args,
    }, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      ...opts,
    });
  }
}
