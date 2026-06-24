import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnIcon from './LoomnIcon.vue';

describe('LoomnIcon', () => {
  it('rende un svg col data-icon del nome', () => {
    const w = mount(LoomnIcon, { props: { name: 'journal' } });
    const svg = w.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('data-icon')).toBe('journal');
  });

  it('usa currentColor per lo stroke (eredita il colore)', () => {
    const w = mount(LoomnIcon, { props: { name: 'game' } });
    expect(w.find('svg').attributes('stroke')).toBe('currentColor');
  });

  it('rende icone diverse per nomi diversi', () => {
    const a = mount(LoomnIcon, { props: { name: 'theme-dark' } });
    const b = mount(LoomnIcon, { props: { name: 'chevron' } });
    expect(a.find('svg').attributes('data-icon')).toBe('theme-dark');
    expect(b.find('svg').attributes('data-icon')).toBe('chevron');
  });
});
