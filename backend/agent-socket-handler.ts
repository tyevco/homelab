import { HomelabServer } from "./homelab-server";
import { AgentSocket } from "../common/agent-socket";
import { HomelabSocket } from "./util-server";

export abstract class AgentSocketHandler {
    abstract create(socket : HomelabSocket, server : HomelabServer, agentSocket : AgentSocket): void;
}
