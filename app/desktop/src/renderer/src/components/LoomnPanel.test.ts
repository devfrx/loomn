import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnPanel from './LoomnPanel.vue';

describe('LoomnPanel', () => {
  it('rende eyebrow, titolo e meta quando forniti', () => {
    const w = mount(LoomnPanel, { props: { eyebrow: 'scena', title: 'Il mercato', meta: 'turno 14' } });
    expect(w.text()).toContain('scena');
    expect(w.text()).toContain('Il mercato');
    expect(w.text()).toContain('turno 14');
  });

  it('rende il contenuto dello slot di default nel body', () => {
    const w = mount(LoomnPanel, { props: { title: 'X' }, slots: { default: 'corpo del pannello' } });
    expect(w.text()).toContain('corpo del pannello');
  });

  it('omette la testata quando non ci sono eyebrow/title/meta', () => {
    const w = mount(LoomnPanel, { slots: { default: 'solo corpo' } });
    expect(w.find('.loomn-panel__head').exists()).toBe(false);
  });
});
