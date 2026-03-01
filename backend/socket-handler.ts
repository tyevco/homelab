import { HomelabServer } from "./homelab-server";
import { HomelabSocket } from "./util-server";

export abstract class SocketHandler {
    abstract create(socket : HomelabSocket, server : HomelabServer): void;
}
