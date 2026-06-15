import { describe, it, expect } from 'vitest';
import type { Actor, Item } from './actor';
import type { RandomSource } from './random';
import { decide } from './commands';
import { applyEvent, initialState, type GameState } from './events';

function actor(id: string): Actor {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

function withActors(...as: Actor[]): GameState {
  let s = initialState;
  for (const a of as) {
    s = applyEvent(s, { type: 'ActorAdded', actor: a });
  }
  return s;
}

const rng: RandomSource = { next: () => 0.5 };

describe('decide AddActor', () => {
  it('emette ActorAdded', () => {
    const events = decide(initialState, { type: 'AddActor', actor: actor('eroe') }, rng);
    expect(events).toEqual([{ type: 'ActorAdded', actor: actor('eroe') }]);
  });
  it('lancia se l attore è già presente', () => {
    const s = withActors(actor('eroe'));
    expect(() => decide(s, { type: 'AddActor', actor: actor('eroe') }, rng)).toThrow('già presente');
  });
});

describe('decide StartEncounter', () => {
  it('emette EncounterStarted con i partecipanti ordinati per iniziativa', () => {
    const s = withActors(actor('eroe'), actor('goblin'));
    const events = decide(
      s,
      {
        type: 'StartEncounter',
        encounterId: 'e',
        participants: [
          { actorId: 'goblin', zone: 'a', initiative: 5 },
          { actorId: 'eroe', zone: 'a', initiative: 10 },
        ],
      },
      rng,
    );
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('EncounterStarted');
    if (ev.type === 'EncounterStarted') {
      expect(ev.encounter.participants.map((p) => p.actorId)).toEqual(['eroe', 'goblin']);
    }
  });
  it('lancia se un partecipante non esiste', () => {
    const s = withActors(actor('eroe'));
    expect(() =>
      decide(s, { type: 'StartEncounter', encounterId: 'e', participants: [{ actorId: 'ignoto', zone: 'a', initiative: 5 }] }, rng),
    ).toThrow('Attore sconosciuto');
  });
});

describe('decide EndTurn e NextRound', () => {
  function withEncounter(): GameState {
    let s = withActors(actor('eroe'));
    s = applyEvent(s, {
      type: 'EncounterStarted',
      encounter: { id: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false }], round: 1, turnIndex: 0 },
    });
    return s;
  }
  it('EndTurn emette TurnEnded quando c è uno scontro', () => {
    expect(decide(withEncounter(), { type: 'EndTurn' }, rng)).toEqual([{ type: 'TurnEnded' }]);
  });
  it('EndTurn lancia senza scontro', () => {
    expect(() => decide(initialState, { type: 'EndTurn' }, rng)).toThrow('Nessuno scontro attivo');
  });
  it('NextRound emette RoundAdvanced', () => {
    expect(decide(withEncounter(), { type: 'NextRound' }, rng)).toEqual([{ type: 'RoundAdvanced' }]);
  });
  it('NextRound lancia senza scontro', () => {
    expect(() => decide(initialState, { type: 'NextRound' }, rng)).toThrow('Nessuno scontro attivo');
  });
});

function stub(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

const weapon: Item = {
  id: 'sword',
  name: 'Spadone',
  equipped: true,
  effects: [{ kind: 'contributeDice', dice: [{ count: 2, sides: 6 }], mode: 'effect' }],
};

function hero(): Actor {
  return {
    id: 'eroe',
    name: 'Eroe',
    kind: 'pc',
    attributes: { forza: 3 },
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [weapon],
    progression: { xp: 0, level: 1 },
  };
}

describe('decide Attack', () => {
  it('colpo a segno: emette AttackResolved, DamageApplied e ActorDowned', () => {
    const s = withActors(hero(), actor('goblin'));
    // d20=0.95 -> 20 (+3 forza = 23 vs CD 10, critico) ; danno 2d6=4+4=8 ; +2 = 10 -> goblin a 0
    const events = decide(
      s,
      {
        type: 'Attack',
        attackerId: 'eroe',
        targetId: 'goblin',
        attribute: 'forza',
        defense: 'difesa',
        defenseBase: 10,
        damageResource: 'hp',
        damageModifiers: [{ value: 2, source: 'forza' }],
      },
      stub([0.95, 0.5, 0.5]),
    );
    expect(events.map((e) => e.type)).toEqual(['AttackResolved', 'DamageApplied', 'ActorDowned']);
  });

  it('colpo mancato: emette solo AttackResolved', () => {
    const s = withActors(hero(), actor('goblin'));
    const events = decide(
      s,
      { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'hp' },
      stub([0]),
    );
    expect(events.map((e) => e.type)).toEqual(['AttackResolved']);
  });

  it('lancia se attaccante o bersaglio sono sconosciuti', () => {
    expect(() =>
      decide(initialState, { type: 'Attack', attackerId: 'x', targetId: 'y', defense: 'difesa', defenseBase: 10, damageResource: 'hp' }, stub([0.5])),
    ).toThrow('sconosciuto');
  });

  it('colpo a segno senza atterramento: emette AttackResolved e DamageApplied (2 eventi)', () => {
    const tank: Actor = { ...actor('orco'), resources: { hp: { current: 50, max: 50 } } };
    const s = withActors(hero(), tank);
    // d20=0.95 -> colpo critico ; danno 2d6 = 8 ; tank a 50 HP non viene atterrato
    const events = decide(
      s,
      { type: 'Attack', attackerId: 'eroe', targetId: 'orco', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'hp' },
      stub([0.95, 0.5, 0.5]),
    );
    expect(events.map((e) => e.type)).toEqual(['AttackResolved', 'DamageApplied']);
  });

  it('ciclo decide->apply: l attacco riduce gli HP nello stato', () => {
    let s = withActors(hero(), actor('goblin'));
    const events = decide(
      s,
      { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'hp' },
      stub([0.95, 0.5, 0.5]),
    );
    for (const e of events) {
      s = applyEvent(s, e);
    }
    expect(s.actors['goblin']?.resources['hp']?.current).toBe(2); // 10 - 8 (2d6, nessun modificatore)
  });
});
