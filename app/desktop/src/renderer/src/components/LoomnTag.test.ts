import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnTag from './LoomnTag.vue';

describe('LoomnTag', () => {
  it('rende lo slot', () => {
    const w = mount(LoomnTag, { slots: { default: 'attivo' } });
    expect(w.text()).toContain('attivo');
  });

  it('default e neutral', () => {
    const w = mount(LoomnTag, { slots: { default: 'x' } });
    expect(w.find('.loomn-tag').classes()).toContain('loomn-tag--neutral');
  });

  it('applica la variant accent', () => {
    const w = mount(LoomnTag, { props: { variant: 'accent' }, slots: { default: 'x' } });
    expect(w.find('.loomn-tag').classes()).toContain('loomn-tag--accent');
  });
});
