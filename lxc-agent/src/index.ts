import { createAgentServer } from "./server";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../package.json") as { version: string };

const port = parseInt(process.env.HOMELAB_AGENT_PORT ?? "5002", 10);
const hostname = process.env.HOMELAB_AGENT_HOSTNAME ?? "0.0.0.0";
const username = process.env.HOMELAB_AGENT_USERNAME ?? "admin";
const password = process.env.HOMELAB_AGENT_PASSWORD ?? "";

if (!password) {
    console.error("Error: HOMELAB_AGENT_PASSWORD is required.");
    console.error("");
    console.error("Set it via environment variable:");
    console.error("  HOMELAB_AGENT_PASSWORD=secret homelab-lxc-agent");
    console.error("");
    console.error("Optional variables:");
    console.error("  HOMELAB_AGENT_PORT      (default: 5002)");
    console.error("  HOMELAB_AGENT_HOSTNAME  (default: 0.0.0.0)");
    console.error("  HOMELAB_AGENT_USERNAME  (default: admin)");
    process.exit(1);
}

const { httpServer } = createAgentServer({ username,
    password,
    version: pkg.version });

httpServer.listen(port, hostname, () => {
    console.log(`Homelab LXC Agent v${pkg.version}`);
    console.log(`Listening on ${hostname}:${port}`);
    console.log(`Username: ${username}`);
    console.log("");
    console.log("Add this agent in the Homelab UI:");
    console.log(`  URL: http://<this-host>:${port}`);
    console.log(`  Username: ${username}`);
});
