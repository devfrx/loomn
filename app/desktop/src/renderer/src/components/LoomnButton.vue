<script setup lang="ts">
const props = withDefaults(defineProps<{ variant?: 'solid' | 'ghost' | 'danger'; disabled?: boolean }>(), {
  variant: 'ghost',
  disabled: false,
});
const emit = defineEmits<{ click: [ev: MouseEvent] }>();

function onClick(ev: MouseEvent): void {
  // Belt-and-suspenders: il browser sopprime click su :disabled, ma la guardia tiene i test
  // deterministici (trigger click in jsdom bypassa il gate nativo).
  if (props.disabled) return;
  emit('click', ev);
}
</script>

<template>
  <button class="loomn-btn" :class="`loomn-btn--${variant}`" :disabled="disabled" @click="onClick">
    <slot />
  </button>
</template>

<style scoped>
.loomn-btn {
  font-family: var(--f-sans);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  padding: 8px 15px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.loomn-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.loomn-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.loomn-btn--solid {
  color: var(--on-accent);
  background: var(--accent);
}
.loomn-btn--solid:hover:not(:disabled) {
  background: var(--accent-press);
}
.loomn-btn--ghost {
  color: var(--text);
  border-color: var(--line-2);
  background: var(--well);
}
.loomn-btn--ghost:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.loomn-btn--danger {
  color: var(--bad);
  border-color: var(--bad);
  background: transparent;
}
.loomn-btn--danger:hover:not(:disabled) {
  background: var(--bad-soft);
}
</style>
