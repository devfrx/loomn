<script setup lang="ts">
import { useOnboardingStore } from '../stores/onboarding';
import BriefStep from '../components/onboarding/BriefStep.vue';
import ReviewStep from '../components/onboarding/ReviewStep.vue';
import OpeningStep from '../components/onboarding/OpeningStep.vue';

const store = useOnboardingStore();
const steps = ['brief', 'review', 'opening'] as const;
const labels: Record<(typeof steps)[number], string> = { brief: 'Brief', review: 'Revisione', opening: 'Apertura' };
</script>

<template>
  <main class="route-view onboarding">
    <nav class="stepper" aria-label="Passi onboarding">
      <span v-for="(s, i) in steps" :key="s" class="stepper__item" :class="{ 'stepper__item--active': store.step === s }">
        {{ i + 1 }} · {{ labels[s] }}
      </span>
    </nav>
    <BriefStep v-if="store.step === 'brief'" />
    <ReviewStep v-else-if="store.step === 'review'" />
    <OpeningStep v-else-if="store.step === 'opening'" />
  </main>
</template>

<style scoped>
.onboarding { flex: 1; min-height: 0; padding: 16px; max-width: 760px; }
.stepper { display: flex; gap: 12px; margin-bottom: 16px; font-size: 12px; color: var(--text-3); }
.stepper__item--active { color: var(--accent); font-weight: 500; }
</style>
