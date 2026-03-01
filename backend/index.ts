import { HomelabServer } from "./homelab-server";
import { log } from "./log";

log.info("server", "Welcome to Homelab!");
const server = new HomelabServer();
await server.serve();
