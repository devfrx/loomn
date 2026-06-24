import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnTextInput from './LoomnTextInput.vue';

describe('LoomnTextInput', () => {
  it('riflette modelValue nel valore dell input', () => {
    const w = mount(LoomnTextInput, { props: { modelValue: 'ciao' } });
    expect((w.find('input').element as HTMLInputElement).value).toBe('ciao');
  });

  it('emette update:modelValue sull input', async () => {
    const w = mount(LoomnTextInput, { props: { modelValue: '' } });
    await w.find('input').setValue('x');
    expect(w.emitted('update:modelValue')).toEqual([['x']]);
  });

  it('applica la classe mono', () => {
    const w = mount(LoomnTextInput, { props: { modelValue: '', mono: true } });
    expect(w.find('input').classes()).toContain('is-mono');
  });

  it('applica la classe invalid', () => {
    const w = mount(LoomnTextInput, { props: { modelValue: '', invalid: true } });
    expect(w.find('input').classes()).toContain('is-invalid');
  });
});
