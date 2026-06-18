import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import type { ReadModelPush } from '@loomn/shared';
import { createAppRouter } from './router';
import { useReadModelStore } from './stores/read-model';
import App from './App.vue';

function push(phase: ReadModelPush['state']['phase']): ReadModelPush {
  return { version: 1, state: { version: 1, actors: {}, encounter: null, quests: {}, phase } };
}

async function mountApp() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createAppRouter(createMemoryHistory());
  router.push('/');
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [pinia, router] } });
  return { wrapper, router };
}

describe('App shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // App monta GmConsole nella topbar -> onMounted chiama ruleset.load()/getRuleset. Stub minimo
    // per evitare unhandled rejection (i test di App non asseriscono sulla Regia).
    window.loomn = {
      getRuleset: () =>
        Promise.resolve({
          ok: true,
          vocabulary: { attributes: [], skills: [], resources: [], defenses: [], defaultResources: {} },
          difficulties: [],
          softPhases: [],
          questOutcomes: [],
          directions: [],
          commandPhaseRules: { combatOnly: [], nonCombatOnly: [] },
        }),
    } as unknown as typeof window.loomn;
  });

  it('rende le 5 voci di navigazione', async () => {
    const { wrapper } = await mountApp();
    expect(wrapper.findAll('.nav-btn')).toHaveLength(5);
  });

  it('parte sul Gioco e naviga al Diario', async () => {
    const { wrapper, router } = await mountApp();
    expect(router.currentRoute.value.name).toBe('game');
    await router.push('/diario');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('journal');
    expect(wrapper.text()).toContain('Diario');
  });

  it('riflette la fase del read-model su data-phase', async () => {
    const { wrapper } = await mountApp();
    const store = useReadModelStore();
    store.applyPush(push('combat'));
    await flushPromises();
    expect(wrapper.find('.app-shell').attributes('data-phase')).toBe('combat');
  });

  it('solo il link corrente ha nav-btn--active', async () => {
    const { wrapper, router } = await mountApp();
    await router.push('/diario');
    await flushPromises();
    const active = wrapper.findAll('.nav-btn--active');
    expect(active).toHaveLength(1);
    expect(active[0]?.attributes('href')).toContain('diario');
  });
});
