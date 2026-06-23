import {
  createRouter,
  createWebHashHistory,
  type Router,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router';
import GameView from '../views/GameView.vue';
import JournalView from '../views/JournalView.vue';
import SheetView from '../views/SheetView.vue';
import CompanyView from '../views/CompanyView.vue';
import SettingsView from '../views/SettingsView.vue';
import OnboardingView from '../views/OnboardingView.vue';

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'game', component: GameView },
  { path: '/diario', name: 'journal', component: JournalView },
  { path: '/scheda', name: 'sheet', component: SheetView },
  { path: '/compagnia', name: 'company', component: CompanyView },
  { path: '/impostazioni', name: 'settings', component: SettingsView },
  { path: '/nuova-campagna', name: 'onboarding', component: OnboardingView },
];

// Hash history: l app gira da file:// (la web history richiede un server). history iniettabile ->
// i test usano createMemoryHistory.
export function createAppRouter(history: RouterHistory = createWebHashHistory()): Router {
  return createRouter({ history, routes });
}
