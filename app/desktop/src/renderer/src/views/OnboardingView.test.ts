import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import OnboardingView from './OnboardingView.vue';
import { useOnboardingStore } from '../stores/onboarding';

describe('OnboardingView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('mostra il BriefStep allo step brief', () => {
    const w = mount(OnboardingView, { global: { stubs: { BriefStep: true, ReviewStep: true, OpeningStep: true } } });
    expect(w.findComponent({ name: 'BriefStep' }).exists()).toBe(true);
    expect(w.findComponent({ name: 'ReviewStep' }).exists()).toBe(false);
  });

  it('mostra il ReviewStep allo step review', () => {
    const s = useOnboardingStore();
    s.step = 'review';
    const w = mount(OnboardingView, { global: { stubs: { BriefStep: true, ReviewStep: true, OpeningStep: true } } });
    expect(w.findComponent({ name: 'ReviewStep' }).exists()).toBe(true);
  });

  it('mostra l OpeningStep allo step opening', () => {
    const s = useOnboardingStore();
    s.step = 'opening';
    const w = mount(OnboardingView, { global: { stubs: { BriefStep: true, ReviewStep: true, OpeningStep: true } } });
    expect(w.findComponent({ name: 'OpeningStep' }).exists()).toBe(true);
  });
});
