import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { routes } from '../router';
import LoomnRail from './LoomnRail.vue';

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

async function mountRail() {
  const router = makeRouter();
  router.push('/');
  await router.isReady();
  const wrapper = mount(LoomnRail, { global: { plugins: [router] } });
  return { wrapper, router };
}

describe('LoomnRail', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rende le 5 voci di navigazione', async () => {
    const { wrapper } = await mountRail();
    expect(wrapper.findAll('.nav-btn')).toHaveLength(5);
  });

  it('parte compresso (niente etichette) quando localStorage e vuoto', async () => {
    const { wrapper } = await mountRail();
    expect(wrapper.find('.rail--expanded').exists()).toBe(false);
    expect(wrapper.findAll('.nav-btn__label')).toHaveLength(0);
  });

  it('il toggle espande, mostra le etichette e persiste lo stato', async () => {
    const { wrapper } = await mountRail();
    await wrapper.find('.rail__collapse').trigger('click');
    expect(wrapper.find('.rail--expanded').exists()).toBe(true);
    expect(wrapper.findAll('.nav-btn__label')).toHaveLength(5);
    expect(localStorage.getItem('loomn-rail')).toBe('expanded');
  });

  it('parte espanso se localStorage e expanded', async () => {
    localStorage.setItem('loomn-rail', 'expanded');
    const { wrapper } = await mountRail();
    expect(wrapper.find('.rail--expanded').exists()).toBe(true);
  });

  it('solo la voce corrente ha nav-btn--active', async () => {
    const { wrapper, router } = await mountRail();
    await router.push('/diario');
    await wrapper.vm.$nextTick();
    const active = wrapper.findAll('.nav-btn--active');
    expect(active).toHaveLength(1);
    expect(active[0]!.attributes('href')).toContain('diario');
  });
});
