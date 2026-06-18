import { describe, it, expect } from 'vitest';
import {
  orderedEntries,
  resourceBars,
  resolveSelectedActor,
  toSheetView,
  type VocabularyView,
} from './sheet-view';
import type { ActorView } from '../stores/read-model';

function actor(over: Partial<ActorView> & { id: string }): ActorView {
  return {
    id: over.id,
    name: over.name ?? over.id,
    kind: over.kind ?? 'pc',
    attributes: over.attributes ?? {},
    skills: over.skills ?? {},
    resources: over.resources ?? {},
    conditions: over.conditions ?? [],
    items: over.items ?? [],
    progression: over.progression ?? { xp: 0, level: 1 },
  };
}

const vocab: VocabularyView = {
  attributes: ['forza', 'agilita'],
  skills: ['lame'],
  resources: ['hp', 'mana'],
  defenses: ['difesa'],
  defaultResources: {},
};

describe('orderedEntries', () => {
  it('rispetta l ordine del vocabolario', () => {
    const out = orderedEntries({ agilita: 2, forza: 3 }, ['forza', 'agilita']);
    expect(out).toEqual([
      { key: 'forza', value: 3 },
      { key: 'agilita', value: 2 },
    ]);
  });

  it('appende le chiavi extra in coda ordinate', () => {
    const out = orderedEntries({ forza: 1, zelo: 9, audacia: 5 }, ['forza']);
    expect(out.map((e) => e.key)).toEqual(['forza', 'audacia', 'zelo']);
  });

  it('salta le chiavi del vocabolario assenti nell attore', () => {
    const out = orderedEntries({ forza: 1 }, ['forza', 'agilita']);
    expect(out.map((e) => e.key)).toEqual(['forza']);
  });
});

describe('resourceBars', () => {
  it('calcola la percentuale e rispetta l ordine del vocabolario', () => {
    const out = resourceBars({ mana: { current: 1, max: 4 }, hp: { current: 5, max: 10 } }, ['hp', 'mana']);
    expect(out).toEqual([
      { key: 'hp', current: 5, max: 10, pct: 0.5 },
      { key: 'mana', current: 1, max: 4, pct: 0.25 },
    ]);
  });

  it('con max 0 la percentuale e 0 (niente divisione per zero)', () => {
    const out = resourceBars({ hp: { current: 0, max: 0 } }, ['hp']);
    expect(out[0]!.pct).toBe(0);
  });

  it('clampa la percentuale in [0,1] anche con current oltre max', () => {
    const out = resourceBars({ hp: { current: 15, max: 10 } }, ['hp']);
    expect(out[0]!.pct).toBe(1);
  });

  it('clampa la percentuale a 0 con current negativo', () => {
    const out = resourceBars({ hp: { current: -3, max: 10 } }, ['hp']);
    expect(out[0]!.pct).toBe(0);
  });
});

describe('toSheetView', () => {
  it('riporta identita, livello e xp', () => {
    const view = toSheetView(actor({ id: 'eroe', name: 'Eroe', kind: 'pc', progression: { xp: 120, level: 3 } }), vocab);
    expect(view.name).toBe('Eroe');
    expect(view.kind).toBe('pc');
    expect(view.level).toBe(3);
    expect(view.xp).toBe(120);
  });

  it('ordina attributi e abilita dal vocabolario', () => {
    const view = toSheetView(actor({ id: 'a', attributes: { agilita: 1, forza: 2 }, skills: { lame: 4 } }), vocab);
    expect(view.attributes.map((e) => e.key)).toEqual(['forza', 'agilita']);
    expect(view.skills).toEqual([{ key: 'lame', value: 4 }]);
  });

  it('formatta le condizioni (checkModifier con e senza appliesTo)', () => {
    const view = toSheetView(
      actor({
        id: 'a',
        conditions: [
          {
            key: 'benedetto',
            source: 'rito',
            effects: [
              { kind: 'checkModifier', value: 2 },
              { kind: 'checkModifier', value: -1, appliesTo: 'lame' },
            ],
            duration: { kind: 'turns', remaining: 3 },
          },
        ],
      }),
      vocab,
    );
    expect(view.conditions[0]!.key).toBe('benedetto');
    expect(view.conditions[0]!.detail).toContain('+2');
    expect(view.conditions[0]!.detail).toContain('lame -1');
    expect(view.conditions[0]!.duration).toBe('3 turni');
  });

  it('formatta resourcePerTurn e le durate scene/permanente', () => {
    const view = toSheetView(
      actor({
        id: 'a',
        conditions: [
          { key: 'avvelenato', source: 'trappola', effects: [{ kind: 'resourcePerTurn', resource: 'hp', delta: -2 }], duration: { kind: 'scenes', remaining: 1 } },
          { key: 'maledetto', source: 'strega', effects: [], duration: { kind: 'permanent' } },
        ],
      }),
      vocab,
    );
    expect(view.conditions[0]!.detail).toContain('hp -2');
    expect(view.conditions[0]!.duration).toBe('1 scene');
    expect(view.conditions[1]!.duration).toBe('permanente');
  });

  it('formatta gli effetti degli oggetti e il flag equipaggiato', () => {
    const view = toSheetView(
      actor({
        id: 'a',
        items: [
          {
            id: 'spada',
            name: 'Spada lunga',
            equipped: true,
            effects: [
              { kind: 'contributeDice', dice: [{ count: 1, sides: 8 }], mode: 'effect' },
              { kind: 'checkModifier', value: 1, appliesTo: 'lame' },
              { kind: 'defenseModifier', defense: 'difesa', value: 2 },
            ],
          },
          { id: 'sasso', name: 'Sasso', equipped: false, effects: [] },
        ],
      }),
      vocab,
    );
    expect(view.items[0]!.name).toBe('Spada lunga');
    expect(view.items[0]!.equipped).toBe(true);
    expect(view.items[0]!.effects[0]).toContain('1d8');
    expect(view.items[0]!.effects[1]).toContain('lame +1');
    expect(view.items[0]!.effects[2]).toContain('difesa +2');
    expect(view.items[1]!.equipped).toBe(false);
    expect(view.items[1]!.effects).toEqual([]);
  });

  it('senza vocabolario rende comunque le chiavi dell attore', () => {
    const view = toSheetView(actor({ id: 'a', attributes: { mente: 3, forza: 1 } }), null);
    expect(view.attributes.map((e) => e.key)).toEqual(['forza', 'mente']);
  });
});

describe('resolveSelectedActor', () => {
  const roster = [actor({ id: 'png', kind: 'npc' }), actor({ id: 'pg1', kind: 'pc' }), actor({ id: 'pg2', kind: 'pc' })];

  it('preferisce l id selezionato se ancora presente', () => {
    expect(resolveSelectedActor(roster, 'pg2')?.id).toBe('pg2');
  });

  it('ripiega sul primo PG quando l id e stantio o nullo', () => {
    expect(resolveSelectedActor(roster, 'sparito')?.id).toBe('pg1');
    expect(resolveSelectedActor(roster, null)?.id).toBe('pg1');
  });

  it('senza PG usa il primo attore; roster vuoto -> null', () => {
    expect(resolveSelectedActor([actor({ id: 'png', kind: 'npc' })], null)?.id).toBe('png');
    expect(resolveSelectedActor([], null)).toBeNull();
  });
});
