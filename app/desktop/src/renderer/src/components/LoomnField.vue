<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ label?: string; hint?: string; error?: string | null }>();
const message = computed(() => (props.error != null && props.error !== '' ? props.error : props.hint));
const isError = computed(() => props.error != null && props.error !== '');
</script>

<template>
  <div class="loomn-field">
    <span v-if="label" class="loomn-field__label">{{ label }}</span>
    <slot />
    <span v-if="message" class="loomn-field__hint" :class="{ 'loomn-field__hint--error': isError }">{{ message }}</span>
  </div>
</template>

<style scoped>
.loomn-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.loomn-field__label {
  font-size: var(--fs-xs);
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--text-3);
  font-weight: var(--fw-semibold);
}
.loomn-field__hint {
  font-size: var(--fs-sm);
  color: var(--text-3);
}
.loomn-field__hint--error {
  color: var(--bad);
}
</style>
