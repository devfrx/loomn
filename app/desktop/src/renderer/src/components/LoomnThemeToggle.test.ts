import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LoomnThemeToggle from './LoomnThemeToggle.vue';
import { useTheme } from '../composables/use-theme';

describe('LoomnThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    useTheme().set('system');
  });

  it('compresso: un bottone che cicla system -> light -> dark -> system', async () => {
    const { theme } = useTheme();
    const w = mount(LoomnThemeToggle, { props: { expanded: false } });
    const btn = w.find('.theme-cycle');
    expect(btn.exists()).toBe(true);
    await btn.trigger('click');
    expect(theme.value).toBe('light');
    await btn.trigger('click');
    expect(theme.value).toBe('dark');
    await btn.trigger('click');
    expect(theme.value).toBe('system');
  });

  it('espanso: tre segmenti, click su scuro imposta dark', async () => {
    const { theme } = useTheme();
    const w = mount(LoomnThemeToggle, { props: { expanded: true } });
    const segs = w.findAll('.theme-seg__btn');
    expect(segs).toHaveLength(3);
    await segs[2]!.trigger('click');
    expect(theme.value).toBe('dark');
    expect(segs[2]!.classes()).toContain('is-active');
  });

  it('compresso: il bottone mostra l icona e l etichetta del tema corrente', async () => {
    const w = mount(LoomnThemeToggle, { props: { expanded: false } });
    const btn = w.find('.theme-cycle');
    // stato iniziale: system (impostato in beforeEach)
    expect(btn.find('svg').attributes('data-icon')).toBe('theme-system');
    expect(btn.attributes('aria-label')).toContain('auto');
    // dopo un ciclo -> light
    await btn.trigger('click');
    expect(btn.find('svg').attributes('data-icon')).toBe('theme-light');
    expect(btn.attributes('aria-label')).toContain('chiaro');
  });
});
