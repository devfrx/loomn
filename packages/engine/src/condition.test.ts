import { describe, it, expect } from 'vitest';
import type { Actor, Condition } from './actor';
import { addCondition, checkModifierFrom, tickConditions } from './condition';

function baseActor(): Actor {
  return {
    id: 'a',
    name: 'A',
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
  };
}

const inspired: Condition = {
  key: 'inspired',
  source: 'bardo',
  effects: [{ kind: 'checkModifier', value: 2 }],
  duration: { kind: 'scenes', remaining: 1 },
};

const focusedAtletica: Condition = {
  key: 'focused',
  source: 'self',
  effects: [{ kind: 'checkModifier', value: 1, appliesTo: 'atletica' }],
  duration: { kind: 'permanent' },
};

const poisoned: Condition = {
  key: 'poisoned',
  source: 'trappola',
  effects: [{ kind: 'resourcePerTurn', resource: 'hp', delta: -2 }],
  duration: { kind: 'turns', remaining: 2 },
};

describe('addCondition', () => {
  it('aggiunge la condizione restituendo un nuovo attore', () => {
    const original = baseActor();
    const out = addCondition(original, inspired);
    expect(out.conditions).toHaveLength(1);
    expect(original.conditions).toHaveLength(0);
  });
});

describe('checkModifierFrom', () => {
  it('somma i modificatori globali (appliesTo assente)', () => {
    expect(checkModifierFrom([inspired])).toBe(2);
  });
  it('include i modificatori specifici quando il target coincide', () => {
    expect(checkModifierFrom([inspired, focusedAtletica], 'atletica')).toBe(3);
  });
  it('esclude i modificatori specifici quando il target non coincide', () => {
    expect(checkModifierFrom([inspired, focusedAtletica], 'furtività')).toBe(2);
  });
  it('è 0 senza condizioni', () => {
    expect(checkModifierFrom([])).toBe(0);
  });
});

describe('tickConditions', () => {
  it('applica gli effetti per-turno e decrementa la durata', () => {
    const out = tickConditions(addCondition(baseActor(), poisoned));
    expect(out.resources['hp']!.current).toBe(8); // -2 da veleno
    const stillPoisoned = out.conditions.find((c) => c.key === 'poisoned');
    expect(stillPoisoned?.duration).toEqual({ kind: 'turns', remaining: 1 });
  });

  it('rimuove la condizione quando la durata a turni arriva a 0', () => {
    let actor = addCondition(baseActor(), {
      ...poisoned,
      duration: { kind: 'turns', remaining: 1 },
    });
    actor = tickConditions(actor);
    expect(actor.resources['hp']!.current).toBe(8); // effetto applicato in questo turno
    expect(actor.conditions.find((c) => c.key === 'poisoned')).toBeUndefined();
  });

  it('non decrementa le durate non-a-turni (scenes/permanent)', () => {
    const out = tickConditions(addCondition(baseActor(), inspired));
    expect(out.conditions[0]!.duration).toEqual({ kind: 'scenes', remaining: 1 });
  });
});
