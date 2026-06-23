<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useOnboardingStore } from '../../stores/onboarding';

defineOptions({ name: 'OpeningStep' });
const store = useOnboardingStore();
const router = useRouter();
const opening = computed<string>(() => store.opening ?? store.draft?.frame.openingScene ?? '');
const name = computed<string>(() => store.draft?.frame.name ?? 'La tua campagna');
</script>

<template>
  <div class="opening">
    <h2>{{ name }} e pronta</h2>
    <p class="narration">{{ opening }}</p>
    <div class="actions">
      <button class="enter" type="button" @click="router.push('/')">Entra nella campagna</button>
    </div>
  </div>
</template>

<style scoped>
.opening { display: flex; flex-direction: column; gap: 16px; }
.narration { font-family: var(--f-serif, serif); line-height: 1.7; color: var(--text); }
.actions { display: flex; justify-content: flex-end; }
</style>
