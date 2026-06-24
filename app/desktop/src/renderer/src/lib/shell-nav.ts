// Vocabolario di navigazione della shell (D-02c): single source per rail + topbar.
export type IconName =
  | 'game'
  | 'journal'
  | 'sheet'
  | 'company'
  | 'settings'
  | 'theme-system'
  | 'theme-light'
  | 'theme-dark'
  | 'chevron';

export interface NavItem {
  readonly name: string;
  readonly to: string;
  readonly label: string;
  readonly icon: IconName;
}

export const navItems: readonly NavItem[] = [
  { name: 'game', to: '/', label: 'Gioco', icon: 'game' },
  { name: 'journal', to: '/diario', label: 'Diario', icon: 'journal' },
  { name: 'sheet', to: '/scheda', label: 'Scheda', icon: 'sheet' },
  { name: 'company', to: '/compagnia', label: 'Compagnia', icon: 'company' },
  { name: 'settings', to: '/impostazioni', label: 'Impostazioni', icon: 'settings' },
];

// Titolo della superficie per nome di route. Deriva le 5 destinazioni da navItems (DRY) e
// aggiunge l onboarding, che non e una voce del rail ma ha un titolo nella topbar.
const ROUTE_TITLES: Record<string, string> = {
  ...Object.fromEntries(navItems.map((i) => [i.name, i.label])),
  onboarding: 'Nuova campagna',
};

export function routeTitle(name: string | null | undefined): string {
  if (name == null) return '';
  return ROUTE_TITLES[name] ?? '';
}
