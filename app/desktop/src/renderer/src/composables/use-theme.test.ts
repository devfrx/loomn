import { describe, it, expect, beforeEach } from 'vitest';
import { useTheme, THEME_KEY } from './use-theme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('default e system e non imposta data-theme', () => {
    const t = useTheme();
    t.init();
    expect(t.theme.value).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('set light applica data-theme=light e persiste', () => {
    const t = useTheme();
    t.set('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(t.theme.value).toBe('light');
  });

  it('set dark applica data-theme=dark e persiste', () => {
    const t = useTheme();
    t.set('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('set system rimuove data-theme e persiste system', () => {
    const t = useTheme();
    t.set('dark');
    t.set('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
  });

  it('init ripristina la preferenza persistita', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const t = useTheme();
    t.init();
    expect(t.theme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
