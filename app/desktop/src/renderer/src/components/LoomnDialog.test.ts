import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import LoomnDialog from './LoomnDialog.vue';

describe('LoomnDialog', () => {
  it('monta e rende il contenuto dello slot trigger (Reka integra)', () => {
    const w = mount(LoomnDialog, { props: { title: 'Conferma' }, slots: { trigger: 'Apri' } });
    expect(w.text()).toContain('Apri');
  });

  it('in modalita controllata rende il contenuto quando open e true', () => {
    const w = mount(LoomnDialog, { props: { title: 'Conferma', open: true }, slots: { default: 'Corpo del dialog' } });
    expect(w.text()).toContain('Corpo del dialog');
  });

  it('in modalita controllata non rende il contenuto quando open e false', () => {
    const w = mount(LoomnDialog, { props: { title: 'Conferma', open: false }, slots: { default: 'Corpo del dialog' } });
    expect(w.text()).not.toContain('Corpo del dialog');
  });

  it('chiude via Escape emettendo update:open false', async () => {
    const w = mount(LoomnDialog, {
      props: { title: 'Conferma', open: true },
      slots: { default: 'Corpo del dialog' },
      attachTo: document.body,
    });
    await nextTick();
    await w.find('.loomn-dialog__content').trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(w.emitted('update:open')?.at(-1)).toEqual([false]);
    w.unmount();
  });
});
