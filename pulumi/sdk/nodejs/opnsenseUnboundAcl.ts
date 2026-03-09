import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "github://api.github.com/tyevco/pulumi-homelab";

export interface OpnsenseUnboundAclArgs {
  /** Whether the ACL is enabled. Default: true. */
  enabled?: pulumi.Input<boolean>;
  /** ACL name. Must be unique. */
  name: pulumi.Input<string>;
  /** ACL action: allow, deny, refuse, allow_snoop, deny_non_local, refuse_non_local. Default: "allow". */
  action?: pulumi.Input<string>;
  /** Networks covered by this ACL (comma-separated CIDR). */
  networks: pulumi.Input<string>;
  /** Description of the ACL. */
  description?: pulumi.Input<string>;
}

export class OpnsenseUnboundAcl extends pulumi.CustomResource {
  public readonly uuid!: pulumi.Output<string>;
  public readonly enabled!: pulumi.Output<boolean>;
  public readonly name!: pulumi.Output<string>;
  public readonly action!: pulumi.Output<string>;
  public readonly networks!: pulumi.Output<string>;
  public readonly description!: pulumi.Output<string | undefined>;

  constructor(name: string, args: OpnsenseUnboundAclArgs, opts?: pulumi.CustomResourceOptions) {
    super("homelab:index:OpnsenseUnboundAcl", name, {
      uuid: undefined,
      ...args,
    }, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      ...opts,
    });
  }
}
