import * as pulumi from "@pulumi/pulumi";

const PLUGIN_VERSION: string = require("./package.json").version;
const PLUGIN_DOWNLOAD_URL = "https://github.com/tyevco/homelab/releases/download/pulumi-v${VERSION}";

export interface NotificationSettingsArgs {
  /** Whether ntfy notifications are enabled. */
  ntfyEnabled?: pulumi.Input<boolean>;
  /** ntfy server URL (required when ntfyEnabled is true). */
  ntfyUrl?: pulumi.Input<string>;
  /** Whether Discord notifications are enabled. */
  discordEnabled?: pulumi.Input<boolean>;
  /** Discord webhook URL (required when discordEnabled is true). */
  discordWebhookUrl?: pulumi.Input<string>;
  /** Whether Gotify notifications are enabled. */
  gotifyEnabled?: pulumi.Input<boolean>;
  /** Gotify server URL (required when gotifyEnabled is true). */
  gotifyUrl?: pulumi.Input<string>;
  /** Gotify application token (required when gotifyEnabled is true). */
  gotifyToken?: pulumi.Input<string>;
  /** Whether generic webhook notifications are enabled. */
  webhookEnabled?: pulumi.Input<boolean>;
  /** Webhook URL (required when webhookEnabled is true). */
  webhookUrl?: pulumi.Input<string>;
}

/**
 * Manages notification provider settings on the homelab server.
 * This is a singleton resource — only one instance should exist per provider.
 *
 * ## Example Usage
 *
 * ```typescript
 * const notifications = new homelab.NotificationSettings("notifications", {
 *   ntfyEnabled: true,
 *   ntfyUrl: "https://ntfy.sh/my-homelab-alerts",
 * });
 * ```
 */
export class NotificationSettings extends pulumi.CustomResource {
  public readonly ntfyEnabled!: pulumi.Output<boolean | undefined>;
  public readonly ntfyUrl!: pulumi.Output<string | undefined>;
  public readonly discordEnabled!: pulumi.Output<boolean | undefined>;
  public readonly discordWebhookUrl!: pulumi.Output<string | undefined>;
  public readonly gotifyEnabled!: pulumi.Output<boolean | undefined>;
  public readonly gotifyUrl!: pulumi.Output<string | undefined>;
  public readonly gotifyToken!: pulumi.Output<string | undefined>;
  public readonly webhookEnabled!: pulumi.Output<boolean | undefined>;
  public readonly webhookUrl!: pulumi.Output<string | undefined>;

  constructor(name: string, args?: NotificationSettingsArgs, opts?: pulumi.CustomResourceOptions) {
    super("homelab:index:NotificationSettings", name, {
      ...args,
    }, {
      version: PLUGIN_VERSION,
      pluginDownloadURL: PLUGIN_DOWNLOAD_URL,
      additionalSecretOutputs: ["gotifyToken"],
      ...opts,
    });
  }
}
