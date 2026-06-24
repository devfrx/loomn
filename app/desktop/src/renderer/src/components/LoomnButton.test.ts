import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnButton from './LoomnButton.vue';

describe('LoomnButton', () => {
  it('rende il contenuto dello slot', () => {
    const w = mount(LoomnButton, { slots: { default: 'Invia' } });
    expect(w.text()).toContain('Invia');
  });

  it('emette click quando premuto', async () => {
    const w = mount(LoomnButton);
    await w.trigger('click');
    expect(w.emitted('click')).toHaveLength(1);
  });

  it('non emette click quando disabled', async () => {
    const w = mount(LoomnButton, { props: { disabled: true } });
    await w.trigger('click');
    expect(w.emitted('click')).toBeUndefined();
  });

  it('applica la classe della variant', () => {
    const w = mount(LoomnButton, { props: { variant: 'solid' } });
    expect(w.find('button').classes()).toContain('loomn-btn--solid');
  });

  it('applica la classe della variant danger', () => {
    const w = mount(LoomnButton, { props: { variant: 'danger' } });
    expect(w.find('button').classes()).toContain('loomn-btn--danger');
  });

  it('default e ghost', () => {
    const w = mount(LoomnButton);
    expect(w.find('button').classes()).toContain('loomn-btn--ghost');
  });
});
