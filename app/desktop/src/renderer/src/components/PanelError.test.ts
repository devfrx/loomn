import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PanelError from './PanelError.vue';

describe('PanelError', () => {
  it('non rende nulla quando error e null', () => {
    const w = mount(PanelError, { props: { error: null } });
    expect(w.find('[role="alert"]').exists()).toBe(false);
    expect(w.text()).toBe('');
  });

  it('rende il messaggio con role alert quando error e presente', () => {
    const w = mount(PanelError, { props: { error: 'ledger non leggibile' } });
    const alert = w.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toBe('ledger non leggibile');
  });
});
