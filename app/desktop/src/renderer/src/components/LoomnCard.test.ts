import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnCard from './LoomnCard.vue';

describe('LoomnCard', () => {
  it('rende lo slot del corpo', () => {
    const w = mount(LoomnCard, { slots: { default: 'corpo' } });
    expect(w.text()).toContain('corpo');
  });

  it('rende l header solo se title o eyebrow o meta', () => {
    const senza = mount(LoomnCard, { slots: { default: 'x' } });
    expect(senza.find('.loomn-card__head').exists()).toBe(false);
    const con = mount(LoomnCard, { props: { title: 'Titolo' }, slots: { default: 'x' } });
    expect(con.find('.loomn-card__head').exists()).toBe(true);
    expect(con.text()).toContain('Titolo');
  });

  it('applica la classe raised', () => {
    const w = mount(LoomnCard, { props: { raised: true }, slots: { default: 'x' } });
    expect(w.find('.loomn-card').classes()).toContain('is-raised');
  });
});
