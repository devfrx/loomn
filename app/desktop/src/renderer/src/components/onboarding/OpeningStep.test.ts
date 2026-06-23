import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { routes } from '../../router';
import OpeningStep from './OpeningStep.vue';
import { useOnboardingStore } from '../../stores/onboarding';

function mountStep() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  return mount(OpeningStep, { global: { plugins: [router] } });
}

describe('OpeningStep', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('mostra la narrazione quando presente', () => {
    const s = useOnboardingStore();
    s.opening = 'Notte sul molo.';
    const w = mountStep();
    expect(w.find('.narration').text()).toContain('Notte sul molo.');
  });

  it('degrada alla scena d apertura del frame quando narration e assente', () => {
    const s = useOnboardingStore();
    s.opening = null;
    s.draft = { frame: { openingScene: 'Scena di riserva.' } } as unknown as typeof s.draft;
    const w = mountStep();
    expect(w.find('.narration').text()).toContain('Scena di riserva.');
  });
});
