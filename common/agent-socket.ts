export class AgentSocket {

    eventList : Map<string, (...args : unknown[]) => void> = new Map();

    on(event : string, callback : (...args : unknown[]) => void) {
        this.eventList.set(event, callback);
    }

    call(eventName : string, ...args : unknown[]) {
        const callback = this.eventList.get(eventName);
        if (callback) {
            try {
                callback(...args);
            } catch (e) {
                console.error(`AgentSocket: error in handler for event "${eventName}":`, e instanceof Error ? e.message : e);
            }
        }
    }
}
