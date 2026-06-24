import { ref } from 'vue';

export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_KEY = 'loomn-theme';

const theme = ref<ThemeChoice>('system');

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Tema light/dark renderer-only (D-02a): 'system' segue prefers-color-scheme (nessun data-theme),
 *  'light'/'dark' forzano via data-theme sul root e persistono in localStorage. */
export function useTheme(): {
  theme: typeof theme;
  set: (choice: ThemeChoice) => void;
  init: () => void;
} {
  function set(choice: ThemeChoice): void {
    theme.value = choice;
    localStorage.setItem(THEME_KEY, choice);
    apply(choice);
  }
  function init(): void {
    const saved = localStorage.getItem(THEME_KEY);
    const choice: ThemeChoice = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    theme.value = choice;
    apply(choice);
  }
  return { theme, set, init };
}
