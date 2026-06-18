import { describe, it, expect } from 'vitest';
import { createLocalStoragePersistence, resolveLayout } from './persistence';
import { presetFor } from './presets';
import type { LayoutItem } from './presets';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
}

const sample: LayoutItem[] = [{ i: 'narrative', x: 1, y: 2, w: 3, h: 4 }];

describe('createLocalStoragePersistence', () => {
  it('salva e rilegge lo stesso layout (round-trip)', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    p.save('combat', sample);
    expect(p.load('combat')).toEqual(sample);
  });

  it('load di una fase mai salvata e null', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    expect(p.load('exploration')).toBeNull();
  });

  it('load di JSON corrotto e null (resiliente)', () => {
    const storage = fakeStorage();
    storage.setItem('loomn:layout:combat', '{ non json');
    expect(createLocalStoragePersistence(storage).load('combat')).toBeNull();
  });

  it('load di JSON valido ma forma sbagliata e null', () => {
    const storage = fakeStorage();
    storage.setItem('loomn:layout:combat', JSON.stringify([{ i: 'x', x: 'no' }]));
    expect(createLocalStoragePersistence(storage).load('combat')).toBeNull();
  });

  it('le fasi non si calpestano (chiave per fase)', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    p.save('combat', sample);
    expect(p.load('exploration')).toBeNull();
  });
});

describe('resolveLayout', () => {
  it('ricade sul preset quando non c e nulla di persistito', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    expect(resolveLayout('exploration', p)).toEqual(presetFor('exploration'));
  });

  it('usa l override persistito quando presente', () => {
    const p = createLocalStoragePersistence(fakeStorage());
    p.save('combat', sample);
    expect(resolveLayout('combat', p)).toEqual(sample);
  });
});
