<script setup lang="ts">
const props = withDefaults(defineProps<{ variant?: 'solid' | 'ghost'; disabled?: boolean }>(), {
  variant: 'ghost',
  disabled: false,
});
const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>();

function onClick(ev: MouseEvent): void {
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
  font-family: var(--f-ui);
  font-size: 12px;
  padding: 8px 15px;
  border-radius: 10px;
  cursor: pointer;
  transition: 0.15s;
}
.loomn-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.loomn-btn--ghost {
  color: var(--text);
  border: 1px solid var(--line-2);
  background: #101216;
}
.loomn-btn--ghost:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--brass-hi);
  background: var(--accent-dim);
}
.loomn-btn--solid {
  color: #1a140a;
  border: none;
  background: linear-gradient(180deg, #d8b76b, #b88f43);
}
.loomn-btn--solid:hover:not(:disabled) {
  filter: brightness(1.08);
}
</style>
