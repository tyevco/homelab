import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "https://github.com/tyevco/homelab/releases/download/pulumi-v${VERSION}";

export interface OpnsenseAliasArgs {
  /** The alias name. Must be unique. */
  name: pulumi.Input<string>;
  /** Alias type: host, network, port, mac, url, or urltable. */
  type: pulumi.Input<string>;
  /** Alias content (newline-separated entries, e.g., IP addresses, networks, ports, or URLs). */
  content?: pulumi.Input<string>;
  /** Description of the alias. */
  description?: pulumi.Input<string>;
  /** Whether the alias is enabled. Default: true. */
  enabled?: pulumi.Input<boolean>;
}

export class OpnsenseAlias extends pulumi.CustomResource {
  public readonly uuid!: pulumi.Output<string>;
  public readonly name!: pulumi.Output<string>;
  public readonly type!: pulumi.Output<string>;
  public readonly content!: pulumi.Output<string | undefined>;
  public readonly description!: pulumi.Output<string | undefined>;
  public readonly enabled!: pulumi.Output<boolean>;

  constructor(name: string, args: OpnsenseAliasArgs, opts?: pulumi.CustomResourceOptions) {
    super("homelab:index:OpnsenseAlias", name, {
      uuid: undefined,
      ...args,
    }, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      ...opts,
    });
  }
}
