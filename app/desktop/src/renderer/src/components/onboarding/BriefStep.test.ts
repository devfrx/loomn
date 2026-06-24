import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { routes } from '../../router';
import BriefStep from './BriefStep.vue';
import { useOnboardingStore } from '../../stores/onboarding';

function mountStep() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  return mount(BriefStep, { global: { plugins: [router] } });
}

describe('BriefStep', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('disabilita Genera bozza quando il testo e vuoto', async () => {
    const w = mountStep();
    expect((w.find('button.loomn-btn').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('abilita Genera bozza quando c e del testo', async () => {
    const s = useOnboardingStore();
    s.text = 'una storia';
    const w = mountStep();
    await w.vm.$nextTick();
    expect((w.find('button.loomn-btn').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('mostra il PanelError quando lo store ha un errore', async () => {
    const s = useOnboardingStore();
    s.error = 'nessun provider';
    const w = mountStep();
    await w.vm.$nextTick();
    expect(w.find('[role="alert"]').text()).toContain('nessun provider');
  });
});
