import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnField from './LoomnField.vue';

describe('LoomnField', () => {
  it('rende label e slot del controllo', () => {
    const w = mount(LoomnField, { props: { label: 'Nome' }, slots: { default: '<input>' } });
    expect(w.find('.loomn-field__label').text()).toBe('Nome');
    expect(w.find('input').exists()).toBe(true);
  });

  it('mostra hint quando non c e errore', () => {
    const w = mount(LoomnField, { props: { hint: 'aiuto' } });
    expect(w.find('.loomn-field__hint').text()).toBe('aiuto');
    expect(w.find('.loomn-field__hint--error').exists()).toBe(false);
  });

  it('mostra error e nasconde hint quando error e valorizzato', () => {
    const w = mount(LoomnField, { props: { hint: 'aiuto', error: 'obbligatorio' } });
    const msg = w.find('.loomn-field__hint');
    expect(msg.text()).toBe('obbligatorio');
    expect(msg.classes()).toContain('loomn-field__hint--error');
  });
});
