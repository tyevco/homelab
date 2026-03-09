import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "https://github.com/tyevco/homelab/releases/download/pulumi-v${VERSION}";

export interface TraefikStaticConfigArgs {
  /** The YAML content of the Traefik static configuration file. */
  content: pulumi.Input<string>;
}

/**
 * Manages the Traefik static configuration file (traefik.yml) via the Homelab REST API.
 */
export class TraefikStaticConfig extends pulumi.CustomResource {
  public readonly content!: pulumi.Output<string>;
  public readonly lastModified!: pulumi.Output<string>;

  constructor(name: string, args: TraefikStaticConfigArgs, opts?: pulumi.CustomResourceOptions) {
    super("homelab:index:TraefikStaticConfig", name, {
      lastModified: undefined,
      ...args,
    }, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      ...opts,
    });
  }
}
