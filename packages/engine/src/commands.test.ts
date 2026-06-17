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

describe('decide RequestCheck', () => {
  it('risolve una prova: emette CheckResolved con la CD dalla band e l outcome corretto', () => {
    const s = withActors(hero());
    const events = decide(
      s,
      { type: 'RequestCheck', actorId: 'eroe', attribute: 'forza', difficulty: 'moderate' },
      stub([0.95]), // d20 = 20
    );
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('CheckResolved');
    if (ev.type === 'CheckResolved') {
      expect(ev.actorId).toBe('eroe');
      expect(ev.attribute).toBe('forza');
      expect(ev.difficulty).toBe('moderate');
      expect(ev.result.dc).toBe(15); // dcForDifficulty('moderate')
      expect(ev.result.total).toBe(23); // 20 (d20) + 3 (forza)
      expect(ev.result.margin).toBe(8); // 23 - 15
      expect(ev.result.outcome).toBe('success'); // margin >= 5
    }
  });

  it('omette attribute e skill quando assenti', () => {
    const s = withActors(hero());
    const ev = decide(s, { type: 'RequestCheck', actorId: 'eroe', difficulty: 'easy' }, stub([0.5]))[0]!;
    expect(ev.type).toBe('CheckResolved');
    expect('attribute' in ev).toBe(false);
    expect('skill' in ev).toBe(false);
  });

  it('lancia se l attore e sconosciuto, senza eventi', () => {
    expect(() =>
      decide(initialState, { type: 'RequestCheck', actorId: 'ignoto', difficulty: 'hard' }, stub([0.5])),
    ).toThrow('Attore sconosciuto: ignoto');
  });
});

describe('decide ApplyEffect', () => {
  it('restore: emette ResourceEffectApplied con delta positivo e roll registrato', () => {
    const s = withActors(actor('eroe'));
    const events = decide(
      s,
      { type: 'ApplyEffect', targetId: 'eroe', resource: 'hp', direction: 'restore', dice: [{ count: 2, sides: 6 }] },
      stub([0.5]), // ogni d6 = 4 -> 2d6 = 8
    );
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('ResourceEffectApplied');
    if (ev.type === 'ResourceEffectApplied') {
      expect(ev.targetId).toBe('eroe');
      expect(ev.resource).toBe('hp');
      expect(ev.delta).toBe(8); // +8 (restore)
      expect(ev.roll.total).toBe(8);
      expect(ev.roll.mode).toBe('effect');
    }
  });

  it('drain: emette ResourceEffectApplied con delta negativo', () => {
    const s = withActors(actor('eroe'));
    const ev = decide(
      s,
      { type: 'ApplyEffect', targetId: 'eroe', resource: 'hp', direction: 'drain', dice: [{ count: 2, sides: 6 }] },
      stub([0.5]),
    )[0]!;
    expect(ev.type).toBe('ResourceEffectApplied');
    if (ev.type === 'ResourceEffectApplied') {
      expect(ev.delta).toBe(-8); // -8 (drain)
    }
  });

  it('il bonus piatto entra nel roll e nel delta', () => {
    const s = withActors(actor('eroe'));
    const ev = decide(
      s,
      { type: 'ApplyEffect', targetId: 'eroe', resource: 'hp', direction: 'restore', dice: [{ count: 1, sides: 6 }], bonus: 3 },
      stub([0.5]), // 1d6 = 4, + bonus 3 = 7
    )[0]!;
    if (ev.type !== 'ResourceEffectApplied') throw new Error('atteso ResourceEffectApplied');
    expect(ev.roll.modifierTotal).toBe(3);
    expect(ev.roll.total).toBe(7);
    expect(ev.delta).toBe(7);
  });

  it('magnitudine clampata a >=0: un bonus molto negativo non inverte la direzione del restore', () => {
    const s = withActors(actor('eroe'));
    const ev = decide(
      s,
      { type: 'ApplyEffect', targetId: 'eroe', resource: 'hp', direction: 'restore', dice: [{ count: 1, sides: 6 }], bonus: -100 },
      stub([0.5]), // 1d6 = 4, + (-100) = -96 -> magnitudine max(0, -96) = 0
    )[0]!;
    if (ev.type !== 'ResourceEffectApplied') throw new Error('atteso ResourceEffectApplied');
    expect(ev.delta).toBe(0); // restore non drena mai
  });

  it('magnitudine clampata anche in drain: un bonus molto negativo non inverte la direzione del drain', () => {
    const s = withActors(actor('eroe'));
    const ev = decide(
      s,
      { type: 'ApplyEffect', targetId: 'eroe', resource: 'hp', direction: 'drain', dice: [{ count: 1, sides: 6 }], bonus: -100 },
      stub([0.5]), // 1d6 = 4, + (-100) = -96 -> magnitudine max(0, -96) = 0
    )[0]!;
    if (ev.type !== 'ResourceEffectApplied') throw new Error('atteso ResourceEffectApplied');
    expect(ev.delta + 0).toBe(0); // + 0 normalizza -0 a +0: drain clampato a esattamente 0 (mai positivo)
  });

  it('lancia se l attore e sconosciuto, senza eventi', () => {
    expect(() =>
      decide(initialState, { type: 'ApplyEffect', targetId: 'ignoto', resource: 'hp', direction: 'restore', dice: [{ count: 1, sides: 6 }] }, stub([0.5])),
    ).toThrow('Attore sconosciuto: ignoto');
  });

  it('lancia se la risorsa e sconosciuta, senza eventi', () => {
    const s = withActors(actor('eroe'));
    expect(() =>
      decide(s, { type: 'ApplyEffect', targetId: 'eroe', resource: 'mana', direction: 'restore', dice: [{ count: 1, sides: 6 }] }, stub([0.5])),
    ).toThrow('Risorsa sconosciuta: mana');
  });
});

describe('decide StartQuest', () => {
  it('emette QuestStarted attiva con description', () => {
    const events = decide(
      initialState,
      { type: 'StartQuest', id: 'q1', title: 'Trova l amuleto', description: 'Per il Barone' },
      rng,
    );
    expect(events).toEqual([
      { type: 'QuestStarted', quest: { id: 'q1', title: 'Trova l amuleto', description: 'Per il Barone', status: 'active' } },
    ]);
  });

  it('omette description quando assente', () => {
    const events = decide(initialState, { type: 'StartQuest', id: 'q1', title: 'Trova l amuleto' }, rng);
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    if (ev.type !== 'QuestStarted') throw new Error('atteso QuestStarted');
    expect(ev.quest).toEqual({ id: 'q1', title: 'Trova l amuleto', status: 'active' });
    expect('description' in ev.quest).toBe(false);
  });

  it('lancia su id gia presente, senza eventi', () => {
    const started = applyEvent(initialState, {
      type: 'QuestStarted',
      quest: { id: 'q1', title: 'X', status: 'active' },
    });
    expect(() => decide(started, { type: 'StartQuest', id: 'q1', title: 'Y' }, rng)).toThrow('Quest già presente: q1');
  });
});

describe('decide AdvanceQuest', () => {
  function withQuest(): GameState {
    return applyEvent(initialState, { type: 'QuestStarted', quest: { id: 'q1', title: 'X', status: 'active' } });
  }

  it('quest attiva -> QuestAdvanced con lo stato richiesto', () => {
    expect(decide(withQuest(), { type: 'AdvanceQuest', questId: 'q1', status: 'completed' }, rng)).toEqual([
      { type: 'QuestAdvanced', questId: 'q1', status: 'completed' },
    ]);
  });

  it('puo portare a failed', () => {
    expect(decide(withQuest(), { type: 'AdvanceQuest', questId: 'q1', status: 'failed' }, rng)).toEqual([
      { type: 'QuestAdvanced', questId: 'q1', status: 'failed' },
    ]);
  });

  it('lancia su quest sconosciuta, senza eventi', () => {
    expect(() => decide(initialState, { type: 'AdvanceQuest', questId: 'ignota', status: 'completed' }, rng)).toThrow(
      'Quest sconosciuta: ignota',
    );
  });

  it('lancia su quest gia terminata, senza eventi', () => {
    let s = withQuest();
    s = applyEvent(s, { type: 'QuestAdvanced', questId: 'q1', status: 'completed' });
    expect(() => decide(s, { type: 'AdvanceQuest', questId: 'q1', status: 'failed' }, rng)).toThrow(
      'Quest già terminata',
    );
  });

  it('ciclo decide->apply: start poi advance, lo stato riflette il terminale', () => {
    let s = initialState;
    for (const e of decide(s, { type: 'StartQuest', id: 'q1', title: 'X' }, rng)) s = applyEvent(s, e);
    for (const e of decide(s, { type: 'AdvanceQuest', questId: 'q1', status: 'completed' }, rng)) s = applyEvent(s, e);
    expect(s.quests['q1']?.status).toBe('completed');
  });
});
