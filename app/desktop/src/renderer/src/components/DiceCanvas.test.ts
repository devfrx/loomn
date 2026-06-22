import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

// DiceBox e' WebGL (non disponibile in jsdom): mock con spie sui metodi usati da DiceCanvas.
const { initialize, roll, clear, setDimensions } = vi.hoisted(() => ({
  initialize: vi.fn(() => Promise.resolve()),
  roll: vi.fn(() => Promise.resolve()),
  clear: vi.fn(),
  setDimensions: vi.fn(),
}));
vi.mock('@3d-dice/dice-box-threejs', () => ({
  default: class {
    initialize = initialize;
    roll = roll;
    clear = clear;
    setDimensions = setDimensions;
  },
}));

import DiceCanvas from './DiceCanvas.vue';
import { useDiceStore } from '../stores/dice';

// ResizeObserver non esiste in jsdom: fake che cattura callback e istanza per pilotarli a mano.
let roCb: ResizeObserverCallback | null = null;
let roInstance: FakeResizeObserver | null = null;
class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(cb: ResizeObserverCallback) {
    roCb = cb;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    roInstance = this;
  }
}

async function rollOnce(): Promise<void> {
  const dice = useDiceStore();
  dice.enqueue([{ source: 'attack', tag: 't', notation: '1d20', tokens: [], modifierTotal: 0, total: 10 }]);
  await flushPromises();
}

describe('DiceCanvas', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    roCb = null;
    roInstance = null;
    initialize.mockClear();
    roll.mockClear();
    clear.mockClear();
    setDimensions.mockClear();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    // rAF sincrono per determinismo del test (il componente coalizza i resize in un frame).
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ridimensiona il canvas quando il contenitore cambia (ResizeObserver -> setDimensions)', async () => {
    const w = mount(DiceCanvas);
    await rollOnce(); // init lazy del box
    expect(initialize).toHaveBeenCalled();
    expect(roCb).not.toBeNull();
    // Il pannello e' stato ridimensionato: il contenitore ora misura 640x320.
    const el = w.find('.dice-canvas').element as HTMLElement;
    Object.defineProperty(el, 'clientWidth', { value: 640, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 320, configurable: true });
    roCb!([], {} as ResizeObserver);
    expect(setDimensions).toHaveBeenCalledWith({ x: 640, y: 320 });
    w.unmount();
  });

  it('non ridimensiona se il contenitore e a dimensione zero (pannello nascosto)', async () => {
    const w = mount(DiceCanvas);
    await rollOnce();
    // clientWidth/clientHeight = 0 (default jsdom): nessun resize spurio.
    roCb!([], {} as ResizeObserver);
    expect(setDimensions).not.toHaveBeenCalled();
    w.unmount();
  });

  it('disconnette il ResizeObserver allo smontaggio', async () => {
    const w = mount(DiceCanvas);
    await flushPromises();
    expect(roInstance).not.toBeNull();
    w.unmount();
    expect(roInstance!.disconnect).toHaveBeenCalled();
  });
});
