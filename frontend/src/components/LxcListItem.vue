<template>
    <router-link :to="url" class="item">
        <Uptime :stack="container" :fixed-width="true" class="me-2" />
        <div class="title">
            <span>{{ container.name }}</span>
            <div v-if="$root.agentCount > 1" class="endpoint">{{ endpointDisplay }}</div>
        </div>
    </router-link>
</template>

<script>
import Uptime from "./Uptime.vue";

export default {
    components: {
        Uptime
    },
    props: {
        container: {
            type: Object,
            default: null,
        },
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.container.endpoint);
        },
        url() {
            if (this.container.endpoint) {
                return `/lxc/${this.container.name}/${this.container.endpoint}`;
            } else {
                return `/lxc/${this.container.name}`;
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.item {
    text-decoration: none;
    display: flex;
    align-items: center;
    min-height: 52px;
    border-radius: 10px;
    transition: all ease-in-out 0.15s;
    width: 100%;
    padding: 5px 8px;
    &:hover {
        background-color: $highlight-white;
    }
    &.active {
        background-color: #cdf8f4;
    }
    .title {
        margin-top: -4px;
    }
    .endpoint {
        font-size: 12px;
        color: $dark-font-color3;
    }
}
</style>
