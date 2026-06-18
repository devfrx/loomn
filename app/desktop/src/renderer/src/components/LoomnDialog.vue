<script setup lang="ts">
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from 'reka-ui';

defineProps<{ title: string }>();
</script>

<template>
  <DialogRoot>
    <DialogTrigger class="loomn-dialog__trigger"><slot name="trigger" /></DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="loomn-dialog__overlay" />
      <DialogContent class="loomn-dialog__content">
        <DialogTitle class="loomn-dialog__title">{{ title }}</DialogTitle>
        <div class="loomn-dialog__body"><slot /></div>
        <DialogClose class="loomn-dialog__close" aria-label="chiudi">&#x2715;</DialogClose>
      </DialogContent>
    </DialogPortal>
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
  background: rgba(7, 8, 9, 0.6);
}
.loomn-dialog__content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-width: 320px;
  background: var(--panel);
  border: 1px solid var(--line-2);
  border-radius: var(--r);
  padding: 20px 22px;
  box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.8);
}
.loomn-dialog__title {
  font-family: var(--f-display);
  font-size: 18px;
  color: var(--text);
  margin-bottom: 12px;
}
.loomn-dialog__close {
  position: absolute;
  top: 14px;
  right: 14px;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
}
</style>
