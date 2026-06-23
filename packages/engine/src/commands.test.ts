import { describe, it, expect } from 'vitest';
import type { Actor, Item } from './actor';
import type { RandomSource } from './random';
import { decide, isCommandLegalInPhase, RESOURCE_DIRECTIONS, COMMAND_TYPES } from './commands';
import { applyEvent, initialState, type GameState } from './events';
import { createRuleset, createVocabulary } from './ruleset';

// Vocabolario di test: copre TUTTI gli id usati nelle fixture di questo file (forza/hp/mana/difesa).
// defaultResources VUOTO: l auto-fill di AddActor (Task 4) non deve perturbare i test esistenti.
const TEST_RULESET = createRuleset({
  vocabulary: createVocabulary({ attributes: ['forza'], skills: [], resources: ['hp', 'mana'], defenses: ['difesa'] }),
});

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

function inCombat(s: GameState): GameState {
  const participants = Object.keys(s.actors).map((actorId, i) => ({ actorId, zone: 'a', initiative: 10 - i, actedThisRound: false }));
  const withEnc = applyEvent(s, { type: 'EncounterStarted', encounter: { id: 'e', participants, round: 1, turnIndex: 0 } });
  return applyEvent(withEnc, { type: 'PhaseChanged', from: withEnc.phase, to: 'combat' });
}

const rng: RandomSource = { next: () => 0.5 };

describe('decide AddActor', () => {
  it('emette ActorAdded', () => {
    const events = decide(initialState, { type: 'AddActor', actor: actor('eroe') }, rng, TEST_RULESET);
    expect(events).toEqual([{ type: 'ActorAdded', actor: actor('eroe') }]);
  });
  it('lancia se l attore è già presente', () => {
    const s = withActors(actor('eroe'));
    expect(() => decide(s, { type: 'AddActor', actor: actor('eroe') }, rng, TEST_RULESET)).toThrow('già presente');
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
      TEST_RULESET,
    );
    expect(events).toHaveLength(2);
    const ev = events[0]!;
    expect(ev.type).toBe('EncounterStarted');
    if (ev.type === 'EncounterStarted') {
      expect(ev.encounter.participants.map((p) => p.actorId)).toEqual(['eroe', 'goblin']);
    }
    expect(events[1]).toEqual({ type: 'PhaseChanged', from: 'exploration', to: 'combat' });
  });
  it('lancia se un partecipante non esiste', () => {
    const s = withActors(actor('eroe'));
    expect(() =>
      decide(s, { type: 'StartEncounter', encounterId: 'e', participants: [{ actorId: 'ignoto', zone: 'a', initiative: 5 }] }, rng, TEST_RULESET),
    ).toThrow('Attore sconosciuto');
  });
  it('lancia su participants vuoto, senza eventi', () => {
    const s = withActors(actor('eroe'));
    expect(() => decide(s, { type: 'StartEncounter', encounterId: 'e', participants: [] }, rng, TEST_RULESET)).toThrow('almeno un partecipante');
  });
});

describe('decide EndTurn e NextRound — FSM round/turno (il motore e l arbitro)', () => {
  // Scontro a 2 partecipanti, turnIndex pilotabile, in fase combat.
  function enc(turnIndex: number): GameState {
    let s = withActors(actor('eroe'), actor('goblin'));
    s = applyEvent(s, {
      type: 'EncounterStarted',
      encounter: {
        id: 'e',
        participants: [
          { actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false },
          { actorId: 'goblin', zone: 'a', initiative: 5, actedThisRound: false },
        ],
        round: 1,
        turnIndex,
      },
    });
    return applyEvent(s, { type: 'PhaseChanged', from: s.phase, to: 'combat' });
  }

  it('EndTurn su un partecipante non-ultimo emette solo TurnEnded', () => {
    expect(decide(enc(0), { type: 'EndTurn' }, rng, TEST_RULESET)).toEqual([{ type: 'TurnEnded' }]);
  });

  it('EndTurn sull ultimo partecipante auto-avanza il round: [TurnEnded, RoundAdvanced]', () => {
    expect(decide(enc(1), { type: 'EndTurn' }, rng, TEST_RULESET)).toEqual([
      { type: 'TurnEnded' },
      { type: 'RoundAdvanced' },
    ]);
  });

  it('ciclo decide->apply sull ultimo turno: round+1, turnIndex 0, actedThisRound azzerati', () => {
    let s = enc(1);
    for (const e of decide(s, { type: 'EndTurn' }, rng, TEST_RULESET)) s = applyEvent(s, e);
    expect(s.encounter?.round).toBe(2);
    expect(s.encounter?.turnIndex).toBe(0);
    expect(s.encounter?.participants.every((p) => p.actedThisRound === false)).toBe(true);
  });

  it('EndTurn quando il round e gia completo e illegale', () => {
    // turnIndex === participants.length (stato raggiungibile solo da dati storici col vecchio bug)
    expect(() => decide(enc(2), { type: 'EndTurn' }, rng, TEST_RULESET)).toThrow('Round gia completo');
  });

  it('NextRound a meta round e illegale (throw, 0 eventi)', () => {
    expect(() => decide(enc(1), { type: 'NextRound' }, rng, TEST_RULESET)).toThrow('Round non ancora completo');
  });

  it('NextRound a round completo emette RoundAdvanced (recupero esplicito)', () => {
    expect(decide(enc(2), { type: 'NextRound' }, rng, TEST_RULESET)).toEqual([{ type: 'RoundAdvanced' }]);
  });

  it('EndTurn lancia fuori dalla fase combat', () => {
    expect(() => decide(initialState, { type: 'EndTurn' }, rng, TEST_RULESET)).toThrow('non disponibile in fase exploration');
  });

  it('NextRound lancia fuori dalla fase combat', () => {
    expect(() => decide(initialState, { type: 'NextRound' }, rng, TEST_RULESET)).toThrow('non disponibile in fase exploration');
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
    const s = inCombat(withActors(hero(), actor('goblin')));
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
      TEST_RULESET,
    );
    expect(events.map((e) => e.type)).toEqual(['AttackResolved', 'DamageApplied', 'ActorDowned']);
  });

  it('colpo mancato: emette solo AttackResolved', () => {
    const s = inCombat(withActors(hero(), actor('goblin')));
    const events = decide(
      s,
      { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'hp' },
      stub([0]),
      TEST_RULESET,
    );
    expect(events.map((e) => e.type)).toEqual(['AttackResolved']);
  });

  it('lancia se attaccante o bersaglio sono sconosciuti', () => {
    expect(() =>
      decide(inCombat(initialState), { type: 'Attack', attackerId: 'x', targetId: 'y', defense: 'difesa', defenseBase: 10, damageResource: 'hp' }, stub([0.5]), TEST_RULESET),
    ).toThrow('sconosciuto');
  });

  it('colpo a segno senza atterramento: emette AttackResolved e DamageApplied (2 eventi)', () => {
    const tank: Actor = { ...actor('orco'), resources: { hp: { current: 50, max: 50 } } };
    const s = inCombat(withActors(hero(), tank));
    // d20=0.95 -> colpo critico ; danno 2d6 = 8 ; tank a 50 HP non viene atterrato
    const events = decide(
      s,
      { type: 'Attack', attackerId: 'eroe', targetId: 'orco', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'hp' },
      stub([0.95, 0.5, 0.5]),
      TEST_RULESET,
    );
    expect(events.map((e) => e.type)).toEqual(['AttackResolved', 'DamageApplied']);
  });

  it('ciclo decide->apply: l attacco riduce gli HP nello stato', () => {
    let s = inCombat(withActors(hero(), actor('goblin')));
    const events = decide(
      s,
      { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'hp' },
      stub([0.95, 0.5, 0.5]),
      TEST_RULESET,
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
      TEST_RULESET,
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
    const ev = decide(s, { type: 'RequestCheck', actorId: 'eroe', difficulty: 'easy' }, stub([0.5]), TEST_RULESET)[0]!;
    expect(ev.type).toBe('CheckResolved');
    expect('attribute' in ev).toBe(false);
    expect('skill' in ev).toBe(false);
  });

  it('lancia se l attore e sconosciuto, senza eventi', () => {
    expect(() =>
      decide(initialState, { type: 'RequestCheck', actorId: 'ignoto', difficulty: 'hard' }, stub([0.5]), TEST_RULESET),
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
      TEST_RULESET,
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
      TEST_RULESET,
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
      TEST_RULESET,
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
      TEST_RULESET,
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
      TEST_RULESET,
    )[0]!;
    if (ev.type !== 'ResourceEffectApplied') throw new Error('atteso ResourceEffectApplied');
    expect(ev.delta + 0).toBe(0); // + 0 normalizza -0 a +0: drain clampato a esattamente 0 (mai positivo)
  });

  it('lancia se l attore e sconosciuto, senza eventi', () => {
    expect(() =>
      decide(initialState, { type: 'ApplyEffect', targetId: 'ignoto', resource: 'hp', direction: 'restore', dice: [{ count: 1, sides: 6 }] }, stub([0.5]), TEST_RULESET),
    ).toThrow('Attore sconosciuto: ignoto');
  });

  it('lancia se la risorsa e sconosciuta, senza eventi', () => {
    const s = withActors(actor('eroe'));
    expect(() =>
      decide(s, { type: 'ApplyEffect', targetId: 'eroe', resource: 'mana', direction: 'restore', dice: [{ count: 1, sides: 6 }] }, stub([0.5]), TEST_RULESET),
    ).toThrow('Risorsa sconosciuta: mana');
  });
});

describe('decide StartQuest', () => {
  it('emette QuestStarted attiva con description', () => {
    const events = decide(
      initialState,
      { type: 'StartQuest', id: 'q1', title: 'Trova l amuleto', description: 'Per il Barone' },
      rng,
      TEST_RULESET,
    );
    expect(events).toEqual([
      { type: 'QuestStarted', quest: { id: 'q1', title: 'Trova l amuleto', description: 'Per il Barone', status: 'active' } },
    ]);
  });

  it('omette description quando assente', () => {
    const events = decide(initialState, { type: 'StartQuest', id: 'q1', title: 'Trova l amuleto' }, rng, TEST_RULESET);
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
    expect(() => decide(started, { type: 'StartQuest', id: 'q1', title: 'Y' }, rng, TEST_RULESET)).toThrow('Quest già presente: q1');
  });
});

describe('decide AdvanceQuest', () => {
  function withQuest(): GameState {
    return applyEvent(initialState, { type: 'QuestStarted', quest: { id: 'q1', title: 'X', status: 'active' } });
  }

  it('quest attiva -> QuestAdvanced con lo stato richiesto', () => {
    expect(decide(withQuest(), { type: 'AdvanceQuest', questId: 'q1', status: 'completed' }, rng, TEST_RULESET)).toEqual([
      { type: 'QuestAdvanced', questId: 'q1', status: 'completed' },
    ]);
  });

  it('puo portare a failed', () => {
    expect(decide(withQuest(), { type: 'AdvanceQuest', questId: 'q1', status: 'failed' }, rng, TEST_RULESET)).toEqual([
      { type: 'QuestAdvanced', questId: 'q1', status: 'failed' },
    ]);
  });

  it('lancia su quest sconosciuta, senza eventi', () => {
    expect(() => decide(initialState, { type: 'AdvanceQuest', questId: 'ignota', status: 'completed' }, rng, TEST_RULESET)).toThrow(
      'Quest sconosciuta: ignota',
    );
  });

  it('lancia su quest gia terminata, senza eventi', () => {
    let s = withQuest();
    s = applyEvent(s, { type: 'QuestAdvanced', questId: 'q1', status: 'completed' });
    expect(() => decide(s, { type: 'AdvanceQuest', questId: 'q1', status: 'failed' }, rng, TEST_RULESET)).toThrow(
      'Quest già terminata (completed): q1',
    );
  });

  it('ciclo decide->apply: start poi advance, lo stato riflette il terminale', () => {
    let s = initialState;
    for (const e of decide(s, { type: 'StartQuest', id: 'q1', title: 'X' }, rng, TEST_RULESET)) s = applyEvent(s, e);
    for (const e of decide(s, { type: 'AdvanceQuest', questId: 'q1', status: 'completed' }, rng, TEST_RULESET)) s = applyEvent(s, e);
    expect(s.quests['q1']?.status).toBe('completed');
  });
});

describe('isCommandLegalInPhase', () => {
  it('i comandi combat-only sono legali solo in combat', () => {
    for (const t of ['Attack', 'EndTurn', 'NextRound', 'EndEncounter'] as const) {
      expect(isCommandLegalInPhase('combat', t)).toBe(true);
      expect(isCommandLegalInPhase('exploration', t)).toBe(false);
      expect(isCommandLegalInPhase('dialogue', t)).toBe(false);
      expect(isCommandLegalInPhase('downtime', t)).toBe(false);
    }
  });
  it('i comandi di ingresso sono legali in ogni fase tranne combat', () => {
    for (const t of ['StartEncounter', 'EnterPhase'] as const) {
      expect(isCommandLegalInPhase('exploration', t)).toBe(true);
      expect(isCommandLegalInPhase('dialogue', t)).toBe(true);
      expect(isCommandLegalInPhase('downtime', t)).toBe(true);
      expect(isCommandLegalInPhase('combat', t)).toBe(false);
    }
  });
  it('i comandi phase-agnostic sono legali ovunque', () => {
    for (const t of ['AddActor', 'RequestCheck', 'ApplyEffect', 'StartQuest', 'AdvanceQuest'] as const) {
      expect(isCommandLegalInPhase('exploration', t)).toBe(true);
      expect(isCommandLegalInPhase('combat', t)).toBe(true);
      expect(isCommandLegalInPhase('downtime', t)).toBe(true);
    }
  });
});

describe('decide gate di fase, EnterPhase, EndEncounter', () => {
  it('StartEncounter in combat e rifiutato (niente doppio scontro)', () => {
    const s = inCombat(withActors(actor('eroe')));
    expect(() =>
      decide(s, { type: 'StartEncounter', encounterId: 'e2', participants: [{ actorId: 'eroe', zone: 'a', initiative: 5 }] }, rng, TEST_RULESET),
    ).toThrow('non disponibile in fase combat');
  });

  it('EndEncounter in combat emette EncounterEnded e PhaseChanged verso exploration', () => {
    const s = inCombat(withActors(actor('eroe')));
    expect(decide(s, { type: 'EndEncounter' }, rng, TEST_RULESET)).toEqual([
      { type: 'EncounterEnded', encounterId: 'e' },
      { type: 'PhaseChanged', from: 'combat', to: 'exploration' },
    ]);
  });

  it('EndEncounter fuori combat e rifiutato dal gate', () => {
    expect(() => decide(initialState, { type: 'EndEncounter' }, rng, TEST_RULESET)).toThrow('non disponibile in fase exploration');
  });

  it('EndEncounter difende da uno stato incoerente combat-senza-scontro', () => {
    // Stato che viola l invariante (phase=combat ma encounter=null): impossibile da sequenze
    // legali, ma il guard difensivo in decide deve scattare comunque (defense in depth).
    const broken: GameState = { ...initialState, phase: 'combat' };
    expect(() => decide(broken, { type: 'EndEncounter' }, rng, TEST_RULESET)).toThrow('Nessuno scontro attivo');
  });

  it('EnterPhase tra fasi soft emette PhaseChanged', () => {
    expect(decide(initialState, { type: 'EnterPhase', to: 'dialogue' }, rng, TEST_RULESET)).toEqual([
      { type: 'PhaseChanged', from: 'exploration', to: 'dialogue' },
    ]);
  });

  it('EnterPhase verso la stessa fase e rifiutato', () => {
    expect(() => decide(initialState, { type: 'EnterPhase', to: 'exploration' }, rng, TEST_RULESET)).toThrow('Transizione di fase non valida');
  });

  it('EnterPhase in combat e rifiutato dal gate', () => {
    const s = inCombat(withActors(actor('eroe')));
    expect(() => decide(s, { type: 'EnterPhase', to: 'downtime' }, rng, TEST_RULESET)).toThrow('non disponibile in fase combat');
  });
});

describe('invariante phase=combat <=> encounter!=null', () => {
  function holds(s: GameState): boolean {
    return (s.phase === 'combat') === (s.encounter !== null);
  }
  it('vale su initialState e lungo il ciclo di vita di uno scontro', () => {
    let s: GameState = withActors(actor('eroe'));
    expect(holds(s)).toBe(true); // exploration, nessuno scontro
    for (const e of decide(s, { type: 'StartEncounter', encounterId: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 5 }] }, rng, TEST_RULESET)) s = applyEvent(s, e);
    expect(s.phase).toBe('combat');
    expect(holds(s)).toBe(true);
    for (const e of decide(s, { type: 'EndEncounter' }, rng, TEST_RULESET)) s = applyEvent(s, e);
    expect(s.phase).toBe('exploration');
    expect(s.encounter).toBeNull();
    expect(holds(s)).toBe(true);
  });
});

describe('decide(AddActor) — vocabolario e auto-fill', () => {
  const VOCAB = createRuleset({
    vocabulary: createVocabulary({
      attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: [],
      defaultResources: { hp: { current: 10, max: 10 } },
    }),
  });
  const npc = (over: Partial<Actor> = {}): Actor => ({
    id: 'png', name: 'PNG', kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [],
    progression: { xp: 0, level: 0 }, ...over,
  });

  it('rifiuta un attributo fuori vocabolario', () => {
    expect(() => decide(initialState, { type: 'AddActor', actor: npc({ attributes: { magia: 2 } }) }, stub([0.5]), VOCAB)).toThrow(/magia/);
  });

  it('rifiuta una risorsa fuori vocabolario', () => {
    expect(() => decide(initialState, { type: 'AddActor', actor: npc({ resources: { oro: { current: 1, max: 1 } } }) }, stub([0.5]), VOCAB)).toThrow(/oro/);
  });

  it('riempie hp dal template quando il modello non lo fornisce (combat-ready)', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ resources: {} }) }, stub([0.5]), VOCAB);
    const added = events[0];
    if (added?.type !== 'ActorAdded') throw new Error('atteso ActorAdded');
    expect(added.actor.resources.hp).toEqual({ current: 10, max: 10 });
  });

  it('le risorse fornite dal modello sovrascrivono il default', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ resources: { hp: { current: 30, max: 30 } } }) }, stub([0.5]), VOCAB);
    const added = events[0];
    if (added?.type !== 'ActorAdded') throw new Error('atteso ActorAdded');
    expect(added.actor.resources.hp).toEqual({ current: 30, max: 30 });
  });

  it('accetta attributi/abilita/risorse tutti in vocabolario', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ attributes: { forza: 3 }, skills: { arcano: 1 } }) }, stub([0.5]), VOCAB);
    expect(events).toHaveLength(1);
  });

  it('clampa una risorsa fornita fuori range (current > max)', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ resources: { hp: { current: 999, max: 10 } } }) }, stub([0.5]), VOCAB);
    const added = events[0];
    if (added?.type !== 'ActorAdded') throw new Error('atteso ActorAdded');
    expect(added.actor.resources['hp']).toEqual({ current: 10, max: 10 });
  });

  it('clampa una risorsa con current negativo a 0', () => {
    const events = decide(initialState, { type: 'AddActor', actor: npc({ resources: { hp: { current: -5, max: 10 } } }) }, stub([0.5]), VOCAB);
    const added = events[0];
    if (added?.type !== 'ActorAdded') throw new Error('atteso ActorAdded');
    expect(added.actor.resources['hp']).toEqual({ current: 0, max: 10 });
  });
});

describe('decide(Attack) — vocabolario', () => {
  const BVOCAB = createRuleset({
    vocabulary: createVocabulary({ attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: ['difesa'] }),
  });
  const combatState = () => inCombat(withActors(hero(), actor('goblin')));

  it('rifiuta una difesa fuori vocabolario', () => {
    expect(() =>
      decide(combatState(), { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', defense: 'parata', defenseBase: 10, damageResource: 'hp' }, stub([0.5]), BVOCAB),
    ).toThrow(/parata/);
  });

  it('rifiuta un damageResource fuori vocabolario', () => {
    expect(() =>
      decide(combatState(), { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'danno' }, stub([0.5]), BVOCAB),
    ).toThrow(/danno/);
  });

  it('rifiuta un attributo fuori vocabolario', () => {
    expect(() =>
      decide(combatState(), { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'magia', defense: 'difesa', defenseBase: 10, damageResource: 'hp' }, stub([0.5]), BVOCAB),
    ).toThrow(/magia/);
  });

  it('rifiuta una skill fuori vocabolario', () => {
    expect(() =>
      decide(combatState(), { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', skill: 'ignoto', defense: 'difesa', defenseBase: 10, damageResource: 'hp' }, stub([0.5]), BVOCAB),
    ).toThrow(/ignoto/);
  });

  it('accetta un attacco interamente in vocabolario', () => {
    const events = decide(combatState(), { type: 'Attack', attackerId: 'eroe', targetId: 'goblin', attribute: 'forza', defense: 'difesa', defenseBase: 10, damageResource: 'hp' }, stub([0.95, 0.5, 0.5]), BVOCAB);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe('decide(RequestCheck/ApplyEffect) — vocabolario', () => {
  const RVOCAB = createRuleset({
    vocabulary: createVocabulary({ attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: [] }),
  });

  it('RequestCheck rifiuta un attributo fuori vocabolario', () => {
    expect(() =>
      decide(withActors(hero()), { type: 'RequestCheck', actorId: 'eroe', attribute: 'magia', difficulty: 'moderate' }, stub([0.5]), RVOCAB),
    ).toThrow(/magia/);
  });

  it('RequestCheck rifiuta una abilita fuori vocabolario', () => {
    expect(() =>
      decide(withActors(hero()), { type: 'RequestCheck', actorId: 'eroe', skill: 'spada', difficulty: 'moderate' }, stub([0.5]), RVOCAB),
    ).toThrow(/spada/);
  });

  it('RequestCheck accetta attributo in vocabolario', () => {
    const events = decide(withActors(hero()), { type: 'RequestCheck', actorId: 'eroe', attribute: 'forza', difficulty: 'moderate' }, stub([0.5]), RVOCAB);
    expect(events[0]?.type).toBe('CheckResolved');
  });

  it('ApplyEffect rifiuta una risorsa fuori vocabolario', () => {
    expect(() =>
      decide(withActors(actor('eroe')), { type: 'ApplyEffect', targetId: 'eroe', resource: 'reputazione', direction: 'restore', dice: [{ count: 1, sides: 6 }] }, stub([0.5]), RVOCAB),
    ).toThrow(/reputazione/);
  });
});

describe('vocabolario statico di comando (RESOURCE_DIRECTIONS / COMMAND_TYPES)', () => {
  it('RESOURCE_DIRECTIONS elenca restore e drain', () => {
    expect([...RESOURCE_DIRECTIONS]).toEqual(['restore', 'drain']);
  });

  it('COMMAND_TYPES elenca tutti e 12 i tipi di Command', () => {
    expect([...COMMAND_TYPES]).toEqual([
      'AddActor',
      'StartEncounter',
      'EndTurn',
      'NextRound',
      'Attack',
      'RequestCheck',
      'ApplyEffect',
      'StartQuest',
      'AdvanceQuest',
      'EnterPhase',
      'EndEncounter',
      'SeedCampaign',
    ]);
  });

  it('COMMAND_TYPES non ha duplicati', () => {
    expect(new Set(COMMAND_TYPES).size).toBe(COMMAND_TYPES.length);
  });
});
