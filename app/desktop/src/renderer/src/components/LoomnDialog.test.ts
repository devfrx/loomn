import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnDialog from './LoomnDialog.vue';

describe('LoomnDialog', () => {
  it('monta e rende il contenuto dello slot trigger (Reka integra)', () => {
    const w = mount(LoomnDialog, { props: { title: 'Conferma' }, slots: { trigger: 'Apri' } });
    expect(w.text()).toContain('Apri');
  });
});
