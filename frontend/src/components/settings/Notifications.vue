<template>
    <div class="my-4">
        <p class="text-muted small">
            Configure webhook providers to receive alerts when agents go offline or online.
        </p>

        <!-- ntfy -->
        <div class="card mb-3">
            <div class="card-body">
                <h6 class="card-title">ntfy</h6>
                <div class="mb-3 form-check form-switch">
                    <input
                        id="ntfy-enabled"
                        v-model="settings.ntfyEnabled"
                        type="checkbox"
                        class="form-check-input"
                    />
                    <label for="ntfy-enabled" class="form-check-label">Enable ntfy</label>
                </div>
                <div v-if="settings.ntfyEnabled">
                    <div class="mb-3">
                        <label for="ntfy-url" class="form-label">ntfy Topic URL</label>
                        <input
                            id="ntfy-url"
                            v-model="settings.ntfyUrl"
                            type="url"
                            class="form-control"
                            placeholder="https://ntfy.sh/my-homelab"
                        />
                        <div class="form-text">Full URL including topic name.</div>
                    </div>
                    <button class="btn btn-sm btn-outline-secondary" :disabled="testing === 'ntfy'" @click="sendTest('ntfy')">
                        {{ testing === 'ntfy' ? 'Sending…' : 'Send test' }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Discord -->
        <div class="card mb-3">
            <div class="card-body">
                <h6 class="card-title">Discord</h6>
                <div class="mb-3 form-check form-switch">
                    <input
                        id="discord-enabled"
                        v-model="settings.discordEnabled"
                        type="checkbox"
                        class="form-check-input"
                    />
                    <label for="discord-enabled" class="form-check-label">Enable Discord</label>
                </div>
                <div v-if="settings.discordEnabled">
                    <div class="mb-3">
                        <label for="discord-url" class="form-label">Webhook URL</label>
                        <input
                            id="discord-url"
                            v-model="settings.discordWebhookUrl"
                            type="url"
                            class="form-control"
                            placeholder="https://discord.com/api/webhooks/..."
                        />
                    </div>
                    <button class="btn btn-sm btn-outline-secondary" :disabled="testing === 'discord'" @click="sendTest('discord')">
                        {{ testing === 'discord' ? 'Sending…' : 'Send test' }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Gotify -->
        <div class="card mb-3">
            <div class="card-body">
                <h6 class="card-title">Gotify</h6>
                <div class="mb-3 form-check form-switch">
                    <input
                        id="gotify-enabled"
                        v-model="settings.gotifyEnabled"
                        type="checkbox"
                        class="form-check-input"
                    />
                    <label for="gotify-enabled" class="form-check-label">Enable Gotify</label>
                </div>
                <div v-if="settings.gotifyEnabled">
                    <div class="mb-3">
                        <label for="gotify-url" class="form-label">Gotify Server URL</label>
                        <input
                            id="gotify-url"
                            v-model="settings.gotifyUrl"
                            type="url"
                            class="form-control"
                            placeholder="https://gotify.example.com"
                        />
                    </div>
                    <div class="mb-3">
                        <label for="gotify-token" class="form-label">App Token</label>
                        <input
                            id="gotify-token"
                            v-model="settings.gotifyToken"
                            type="password"
                            class="form-control"
                        />
                    </div>
                    <button class="btn btn-sm btn-outline-secondary" :disabled="testing === 'gotify'" @click="sendTest('gotify')">
                        {{ testing === 'gotify' ? 'Sending…' : 'Send test' }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Generic Webhook -->
        <div class="card mb-3">
            <div class="card-body">
                <h6 class="card-title">Generic Webhook</h6>
                <div class="mb-3 form-check form-switch">
                    <input
                        id="webhook-enabled"
                        v-model="settings.webhookEnabled"
                        type="checkbox"
                        class="form-check-input"
                    />
                    <label for="webhook-enabled" class="form-check-label">Enable Webhook</label>
                </div>
                <div v-if="settings.webhookEnabled">
                    <div class="mb-3">
                        <label for="webhook-url" class="form-label">Webhook URL</label>
                        <input
                            id="webhook-url"
                            v-model="settings.webhookUrl"
                            type="url"
                            class="form-control"
                            placeholder="https://example.com/webhook"
                        />
                        <div class="form-text">Receives a POST with JSON: <code>{"event":"homelab_alert","message":"..."}</code></div>
                    </div>
                    <button class="btn btn-sm btn-outline-secondary" :disabled="testing === 'webhook'" @click="sendTest('webhook')">
                        {{ testing === 'webhook' ? 'Sending…' : 'Send test' }}
                    </button>
                </div>
            </div>
        </div>

        <button class="btn btn-primary" @click="save">
            Save
        </button>
    </div>
</template>

<script>
export default {
    data() {
        return {
            settings: {
                ntfyEnabled: false,
                ntfyUrl: "",
                discordEnabled: false,
                discordWebhookUrl: "",
                gotifyEnabled: false,
                gotifyUrl: "",
                gotifyToken: "",
                webhookEnabled: false,
                webhookUrl: "",
            },
            testing: null,
        };
    },

    mounted() {
        this.load();
    },

    methods: {
        load() {
            this.$root.getSocket().emit("getNotificationSettings", (res) => {
                if (res.ok && res.data) {
                    this.settings = {
                        ntfyEnabled: res.data.ntfyEnabled || false,
                        ntfyUrl: res.data.ntfyUrl || "",
                        discordEnabled: res.data.discordEnabled || false,
                        discordWebhookUrl: res.data.discordWebhookUrl || "",
                        gotifyEnabled: res.data.gotifyEnabled || false,
                        gotifyUrl: res.data.gotifyUrl || "",
                        gotifyToken: res.data.gotifyToken || "",
                        webhookEnabled: res.data.webhookEnabled || false,
                        webhookUrl: res.data.webhookUrl || "",
                    };
                }
            });
        },

        save() {
            this.$root.getSocket().emit("saveNotificationSettings", this.settings, (res) => {
                this.$root.toastRes(res);
            });
        },

        sendTest(provider) {
            this.testing = provider;
            this.$root.getSocket().emit("testNotification", provider, (res) => {
                this.testing = null;
                this.$root.toastRes(res);
            });
        },
    },
};
</script>
