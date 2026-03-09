import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "github://api.github.com/tyevco/pulumi-homelab";

/**
 * The provider type for the Homelab package. By default, resources use package-wide configuration
 * settings, however an explicit `Provider` instance may be created and passed during resource
 * construction to achieve fine-grained programmatic control over provider settings.
 */
export class Provider extends pulumi.ProviderResource {
  declare readonly url: pulumi.Output<string>;
  declare readonly apiKey: pulumi.Output<string>;
  declare readonly opnsenseUrl: pulumi.Output<string>;
  declare readonly opnsenseApiKey: pulumi.Output<string>;
  declare readonly opnsenseApiSecret: pulumi.Output<string>;
  declare readonly opnsenseInsecure: pulumi.Output<boolean>;

  constructor(name: string, args?: ProviderArgs, opts?: pulumi.ResourceOptions) {
    const inputs: pulumi.Inputs = {
      url: args?.url,
      apiKey: args?.apiKey,
      opnsenseUrl: args?.opnsenseUrl,
      opnsenseApiKey: args?.opnsenseApiKey,
      opnsenseApiSecret: args?.opnsenseApiSecret,
      opnsenseInsecure: args?.opnsenseInsecure,
    };
    super("homelab", name, inputs, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      ...opts,
    });
  }
}

export interface ProviderArgs {
  /** The URL of the Homelab server (e.g., http://192.168.1.100:5001) */
  url?: pulumi.Input<string>;
  /** API key for authenticating with the Homelab REST API */
  apiKey?: pulumi.Input<string>;
  /** The URL of the OPNsense server (e.g., https://192.168.1.1) */
  opnsenseUrl?: pulumi.Input<string>;
  /** API key for authenticating with the OPNsense REST API */
  opnsenseApiKey?: pulumi.Input<string>;
  /** API secret for authenticating with the OPNsense REST API */
  opnsenseApiSecret?: pulumi.Input<string>;
  /** Skip TLS certificate verification for OPNsense API (default: false) */
  opnsenseInsecure?: pulumi.Input<boolean>;
}
