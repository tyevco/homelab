<template>
    <div>
        <div v-if="settingsLoaded" class="my-4">
            <!-- Change Password -->
            <template v-if="!settings.disableAuth">
                <p>
                    {{ $t("Current User") }}: <strong>{{ $root.username }}</strong>
                    <button v-if="! settings.disableAuth" id="logout-btn" class="btn btn-danger ms-4 me-2 mb-2" @click="$root.logout">{{ $t("Logout") }}</button>
                </p>

                <h5 class="my-4 settings-subheading">{{ $t("Change Password") }}</h5>
                <form class="mb-3" @submit.prevent="savePassword">
                    <div class="mb-3">
                        <label for="current-password" class="form-label">
                            {{ $t("Current Password") }}
                        </label>
                        <input
                            id="current-password"
                            v-model="password.currentPassword"
                            type="password"
                            class="form-control"
                            autocomplete="current-password"
                            required
                        />
                    </div>

                    <div class="mb-3">
                        <label for="new-password" class="form-label">
                            {{ $t("New Password") }}
                        </label>
                        <input
                            id="new-password"
                            v-model="password.newPassword"
                            type="password"
                            class="form-control"
                            autocomplete="new-password"
                            required
                        />
                    </div>

                    <div class="mb-3">
                        <label for="repeat-new-password" class="form-label">
                            {{ $t("Repeat New Password") }}
                        </label>
                        <input
                            id="repeat-new-password"
                            v-model="password.repeatNewPassword"
                            type="password"
                            class="form-control"
                            :class="{ 'is-invalid': invalidPassword }"
                            autocomplete="new-password"
                            required
                        />
                        <div class="invalid-feedback">
                            {{ $t("passwordNotMatchMsg") }}
                        </div>
                    </div>

                    <div>
                        <button class="btn btn-primary" type="submit">
                            {{ $t("Update Password") }}
                        </button>
                    </div>
                </form>
            </template>

            <!-- TODO: Hidden for now -->
            <div v-if="! settings.disableAuth && false" class="mt-5 mb-3">
                <h5 class="my-4 settings-subheading">
                    {{ $t("Two Factor Authentication") }}
                </h5>
                <div class="mb-4">
                    <button
                        class="btn btn-primary me-2"
                        type="button"
                        @click="$refs.TwoFADialog.show()"
                    >
                        {{ $t("2FA Settings") }}
                    </button>
                </div>
            </div>

            <!-- OIDC SSO Configuration -->
            <div class="my-4">
                <h5 class="my-4 settings-subheading">{{ $t("oidcSsoSettings") }}</h5>
                <p class="text-muted small">{{ $t("oidcSsoDescription") }}</p>

                <form @submit.prevent="saveOidcSettings">
                    <div class="mb-3 form-check form-switch">
                        <input
                            id="oidc-enabled"
                            v-model="oidcSettings.oidcEnabled"
                            type="checkbox"
                            class="form-check-input"
                        />
                        <label for="oidc-enabled" class="form-check-label">
                            {{ $t("oidcEnable") }}
                        </label>
                    </div>

                    <div v-if="oidcSettings.oidcEnabled">
                        <div class="mb-3">
                            <label for="oidc-issuer-url" class="form-label">
                                {{ $t("oidcIssuerUrl") }}
                            </label>
                            <input
                                id="oidc-issuer-url"
                                v-model="oidcSettings.oidcIssuerUrl"
                                type="url"
                                class="form-control"
                                placeholder="https://idp.example.com/realms/myrealm"
                                required
                            />
                            <div class="form-text">{{ $t("oidcIssuerUrlHint") }}</div>
                        </div>

                        <div class="mb-3">
                            <label for="oidc-client-id" class="form-label">
                                {{ $t("oidcClientId") }}
                            </label>
                            <input
                                id="oidc-client-id"
                                v-model="oidcSettings.oidcClientId"
                                type="text"
                                class="form-control"
                                placeholder="homelab"
                                required
                            />
                        </div>

                        <div class="mb-3">
                            <label for="oidc-client-secret" class="form-label">
                                {{ $t("oidcClientSecret") }}
                            </label>
                            <input
                                id="oidc-client-secret"
                                v-model="oidcSettings.oidcClientSecret"
                                type="password"
                                class="form-control"
                                :placeholder="oidcSettings.oidcClientSecret === '********' ? '********' : ''"
                                required
                            />
                        </div>

                        <div class="mb-3">
                            <label for="oidc-scopes" class="form-label">
                                {{ $t("oidcScopes") }}
                            </label>
                            <input
                                id="oidc-scopes"
                                v-model="oidcSettings.oidcScopes"
                                type="text"
                                class="form-control"
                                placeholder="openid profile email"
                            />
                            <div class="form-text">{{ $t("oidcScopesHint") }}</div>
                        </div>

                        <div class="mb-3">
                            <label for="oidc-username-claim" class="form-label">
                                {{ $t("oidcUsernameClaim") }}
                            </label>
                            <input
                                id="oidc-username-claim"
                                v-model="oidcSettings.oidcUsernameClaim"
                                type="text"
                                class="form-control"
                                placeholder="preferred_username"
                            />
                            <div class="form-text">{{ $t("oidcUsernameClaimHint") }}</div>
                        </div>

                        <div class="mb-3 form-check form-switch">
                            <input
                                id="oidc-auto-create"
                                v-model="oidcSettings.oidcAutoCreateUsers"
                                type="checkbox"
                                class="form-check-input"
                            />
                            <label for="oidc-auto-create" class="form-check-label">
                                {{ $t("oidcAutoCreateUsers") }}
                            </label>
                            <div class="form-text">{{ $t("oidcAutoCreateUsersHint") }}</div>
                        </div>
                    </div>

                    <div>
                        <button class="btn btn-primary" type="submit">
                            {{ $t("Save") }}
                        </button>
                    </div>
                </form>
            </div>

            <div class="my-4">
                <!-- Advanced -->
                <h5 class="my-4 settings-subheading">{{ $t("Advanced") }}</h5>

                <div class="mb-4">
                    <button v-if="settings.disableAuth" id="enableAuth-btn" class="btn btn-outline-primary me-2 mb-2" @click="enableAuth">{{ $t("Enable Auth") }}</button>
                    <button v-if="! settings.disableAuth" id="disableAuth-btn" class="btn btn-primary me-2 mb-2" @click="confirmDisableAuth">{{ $t("Disable Auth") }}</button>
                </div>
            </div>
        </div>

        <TwoFADialog ref="TwoFADialog" />

        <Confirm ref="confirmDisableAuth" btn-style="btn-danger" :yes-text="$t('I understand, please disable')" :no-text="$t('Leave')" @yes="disableAuth">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <p v-html="$t('disableauth.message1')"></p>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <p v-html="$t('disableauth.message2')"></p>
            <p>{{ $t("Please use this option carefully!") }}</p>

            <div class="mb-3">
                <label for="current-password2" class="form-label">
                    {{ $t("Current Password") }}
                </label>
                <input
                    id="current-password2"
                    v-model="password.currentPassword"
                    type="password"
                    class="form-control"
                    required
                />
            </div>
        </Confirm>
    </div>
</template>

<script>
import Confirm from "../../components/Confirm.vue";
import TwoFADialog from "../../components/TwoFADialog.vue";

export default {
    components: {
        Confirm,
        TwoFADialog
    },

    data() {
        return {
            invalidPassword: false,
            password: {
                currentPassword: "",
                newPassword: "",
                repeatNewPassword: "",
            },
            oidcSettings: {
                oidcEnabled: false,
                oidcIssuerUrl: "",
                oidcClientId: "",
                oidcClientSecret: "",
                oidcScopes: "openid profile email",
                oidcUsernameClaim: "preferred_username",
                oidcAutoCreateUsers: true,
            },
        };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        }
    },

    watch: {
        "password.repeatNewPassword"() {
            this.invalidPassword = false;
        },
    },

    mounted() {
        this.loadOidcSettings();
    },

    methods: {
        /** Load OIDC settings from server */
        loadOidcSettings() {
            this.$root
                .getSocket()
                .emit("getOidcSettings", (res) => {
                    if (res.ok && res.data) {
                        this.oidcSettings = {
                            oidcEnabled: res.data.oidcEnabled || false,
                            oidcIssuerUrl: res.data.oidcIssuerUrl || "",
                            oidcClientId: res.data.oidcClientId || "",
                            oidcClientSecret: res.data.oidcClientSecret || "",
                            oidcScopes: res.data.oidcScopes || "openid profile email",
                            oidcUsernameClaim: res.data.oidcUsernameClaim || "preferred_username",
                            oidcAutoCreateUsers: res.data.oidcAutoCreateUsers !== undefined ? res.data.oidcAutoCreateUsers : true,
                        };
                    }
                });
        },

        /** Save OIDC settings to server */
        saveOidcSettings() {
            this.$root
                .getSocket()
                .emit("saveOidcSettings", this.oidcSettings, (res) => {
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.loadOidcSettings();
                    }
                });
        },

        /** Check new passwords match before saving them */
        savePassword() {
            if (this.password.newPassword !== this.password.repeatNewPassword) {
                this.invalidPassword = true;
            } else {
                this.$root
                    .getSocket()
                    .emit("changePassword", this.password, (res) => {
                        this.$root.toastRes(res);
                        if (res.ok) {
                            this.password.currentPassword = "";
                            this.password.newPassword = "";
                            this.password.repeatNewPassword = "";
                        }
                    });
            }
        },

        /** Disable authentication for web app access */
        disableAuth() {
            this.settings.disableAuth = true;

            // Need current password to disable auth
            // Set it to empty if done
            this.saveSettings(() => {
                this.password.currentPassword = "";
                this.$root.username = null;
                this.$root.socketIO.token = "autoLogin";
            }, this.password.currentPassword);
        },

        /** Enable authentication for web app access */
        enableAuth() {
            this.settings.disableAuth = false;
            this.saveSettings();
            this.$root.storage().removeItem("token");
            location.reload();
        },

        /** Show confirmation dialog for disable auth */
        confirmDisableAuth() {
            this.$refs.confirmDisableAuth.show();
        },

    },
};
</script>
