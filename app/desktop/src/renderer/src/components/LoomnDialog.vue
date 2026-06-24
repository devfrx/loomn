<script setup lang="ts">
import { computed } from 'vue';
import {
  DialogRoot,
  DialogTrigger,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from 'reka-ui';

// open omesso => Reka in modalita non-controllata (passive), il trigger gestisce lo stato interno.
// open presente => controllato via v-model:open dal genitore.
const props = withDefaults(defineProps<{ title: string; open?: boolean; variant?: 'center' | 'drawer' }>(), {
  variant: 'center',
});
defineEmits<{ 'update:open': [value: boolean] }>();

// exactOptionalPropertyTypes: passare open=undefined a DialogRoot genera un errore TS perche il suo
// tipo e `open?: boolean` (non `boolean | undefined`). Esportiamo solo le chiavi definite.
const rootProps = computed(() => (props.open !== undefined ? { open: props.open } : {}));
</script>

<template>
  <DialogRoot v-bind="rootProps" @update:open="$emit('update:open', $event)">
    <DialogTrigger v-if="$slots.trigger" class="loomn-dialog__trigger"><slot name="trigger" /></DialogTrigger>
    <DialogOverlay class="loomn-dialog__overlay" />
    <DialogContent class="loomn-dialog__content" :class="`loomn-dialog__content--${variant}`">
      <DialogTitle class="loomn-dialog__title">{{ title }}</DialogTitle>
      <div class="loomn-dialog__body"><slot /></div>
      <DialogClose class="loomn-dialog__close" aria-label="chiudi">&#x2715;</DialogClose>
    </DialogContent>
  </DialogRoot>
</template>

<style scoped>
.loomn-dialog__trigger {
  font: inherit;
  cursor: pointer;
  background: none;
  border: none;
  color: inherit;
}
.loomn-dialog__overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  z-index: 50;
}
.loomn-dialog__content {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line-2);
  box-shadow: var(--shadow-2);
  z-index: 51;
}
.loomn-dialog__content--center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, 92vw);
  max-height: 86vh;
  overflow: auto;
  border-radius: var(--r);
  padding: 20px 22px;
}
.loomn-dialog__content--drawer {
  top: 0;
  right: 0;
  height: 100%;
  width: 380px;
  max-width: 92vw;
  overflow: auto;
  border-left: 1px solid var(--line-2);
  border-radius: 0;
  padding: 18px 20px;
}
.loomn-dialog__title {
  font-family: var(--f-sans);
  font-size: 18px;
  color: var(--text);
  margin-bottom: 12px;
}
.loomn-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.loomn-dialog__close {
  position: absolute;
  top: 14px;
  right: 14px;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  line-height: 1;
  padding: 4px 6px;
}
.loomn-dialog__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-xs);
}
</style>
