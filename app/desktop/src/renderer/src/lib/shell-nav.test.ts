import { describe, it, expect } from 'vitest';
import { navItems, routeTitle, type IconName } from './shell-nav';

describe('shell-nav', () => {
  it('espone le 5 destinazioni con path unici', () => {
    expect(navItems).toHaveLength(5);
    const paths = navItems.map((i) => i.to);
    expect(new Set(paths).size).toBe(5);
    expect(paths).toContain('/');
    expect(paths).toContain('/diario');
  });

  it('routeTitle mappa i nomi di route noti', () => {
    expect(routeTitle('game')).toBe('Gioco');
    expect(routeTitle('journal')).toBe('Diario');
    expect(routeTitle('onboarding')).toBe('Nuova campagna');
  });

  it('routeTitle ritorna stringa vuota per nomi sconosciuti o nulli', () => {
    expect(routeTitle('boh')).toBe('');
    expect(routeTitle(null)).toBe('');
    expect(routeTitle(undefined)).toBe('');
  });

  it('ogni nav item usa un IconName valido del sottoinsieme nav', () => {
    const navIcons: IconName[] = ['game', 'journal', 'sheet', 'company', 'settings'];
    for (const it of navItems) expect(navIcons).toContain(it.icon);
  });
});
