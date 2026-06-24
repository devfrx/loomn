<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    type?: string;
    placeholder?: string;
    mono?: boolean;
    invalid?: boolean;
    disabled?: boolean;
  }>(),
  { type: 'text', mono: false, invalid: false, disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <input
    class="loomn-input"
    :class="{ 'is-mono': mono, 'is-invalid': invalid }"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.loomn-input {
  font-family: var(--f-sans);
  font-size: var(--fs-sm);
  color: var(--text);
  background: var(--well);
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  padding: 9px 12px;
  transition: border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.loomn-input.is-mono {
  font-family: var(--f-mono);
}
.loomn-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.loomn-input.is-invalid {
  border-color: var(--bad);
}
.loomn-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
