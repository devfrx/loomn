import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { Command } from '@loomn/engine';
import {
  DIFFICULTIES as ENGINE_DIFFICULTIES,
  SOFT_PHASES as ENGINE_SOFT_PHASES,
  QUEST_OUTCOMES as ENGINE_QUEST_OUTCOMES,
  RESOURCE_DIRECTIONS as ENGINE_RESOURCE_DIRECTIONS,
} from '@loomn/engine';
import { commandSchema } from '@loomn/shared';
import { DIFFICULTIES, SOFT_PHASES, QUEST_OUTCOMES, RESOURCE_DIRECTIONS } from '@loomn/shared';

// Drift guard COMPILE-TIME bidirezionale ed esaustivo Command <-> commandSchema (sorella del guard
// eventi in memory/sqlite-event-store.ts). z.output<commandSchema> e l unione inferita DOPO i
// .transform(); se una QUALSIASI variante driftasse (campo richiesto aggiunto/rimosso/rinominato, o
// variante nuova/spuria) una di queste righe fallirebbe il typecheck. shared e foglia -> vive in host,
// dove engine e shared coesistono. (I it() runtime sotto restano come documentazione eseguibile.)
type _CmdInfer = z.output<typeof commandSchema>;
const _cmdForward: Command = null as unknown as _CmdInfer;
const _cmdBackward: _CmdInfer = null as unknown as Command;
void _cmdForward;
void _cmdBackward;

// Probe del meccanismo: una variante "driftata" (campo richiesto in piu su Attack) NON e assegnabile
// dal Command del motore -> la direzione backward del guard morderebbe cosi. Il @ts-expect-error PROVA
// che il guard ha denti: se un giorno il drift sparisse (i tipi coincidessero col campo extra) la riga
// smetterebbe di errorare e il test fallirebbe, segnalando un guard cieco.
type _DriftedAttack = Extract<Command, { type: 'Attack' }> & { campoDriftato: string };
// @ts-expect-error - Attack del motore NON ha `campoDriftato`: il guard backward morde su un drift simile
const _driftBites: _DriftedAttack = null as unknown as Extract<Command, { type: 'Attack' }>;
void _driftBites;

// Drift guard cast-free wire->motore: ogni commandSchema.parse(...) deve essere assegnabile a
// Command SENZA cast (la `: Command` e il vero guard; l expect documenta la forma). shared e foglia
// -> questo guard puo vivere solo dove engine e shared coesistono (host).
describe('commandSchema -> Command del motore (cast-free)', () => {
  it('RequestCheck e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'RequestCheck', actorId: 'a', difficulty: 'moderate' });
    expect(c.type).toBe('RequestCheck');
  });

  it('ApplyEffect e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({
      type: 'ApplyEffect',
      targetId: 'b',
      resource: 'hp',
      direction: 'restore',
      dice: [{ count: 1, sides: 6 }],
    });
    expect(c.type).toBe('ApplyEffect');
  });

  it('StartQuest e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'StartQuest', id: 'q1', title: 'La gemma' });
    expect(c.type).toBe('StartQuest');
  });

  it('AdvanceQuest e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'AdvanceQuest', questId: 'q1', status: 'completed' });
    expect(c.type).toBe('AdvanceQuest');
  });

  it('EnterPhase e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'EnterPhase', to: 'dialogue' });
    expect(c.type).toBe('EnterPhase');
  });

  it('EndEncounter e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'EndEncounter' });
    expect(c.type).toBe('EndEncounter');
  });

  it('AddActor e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({
      type: 'AddActor',
      actor: { id: 'a', name: 'A', kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } },
    });
    expect(c.type).toBe('AddActor');
  });

  it('StartEncounter e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({
      type: 'StartEncounter',
      encounterId: 'e1',
      participants: [{ actorId: 'a', zone: 'z1', initiative: 10 }],
    });
    expect(c.type).toBe('StartEncounter');
  });

  it('EndTurn e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'EndTurn' });
    expect(c.type).toBe('EndTurn');
  });

  it('NextRound e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({ type: 'NextRound' });
    expect(c.type).toBe('NextRound');
  });

  it('SeedCampaign e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({
      type: 'SeedCampaign',
      seed: {
        frame: { id: 'c1', name: 'X', premise: 'p', setting: { place: 'a', era: 'b', genres: ['c'] }, tone: 't', openingScene: 'o', hooks: ['h'] },
        keyNpcs: [],
        keyPlaces: [],
        initialFacts: [],
      },
    });
    expect(c.type).toBe('SeedCampaign');
  });

  it('Attack e assegnabile a Command', () => {
    const c: Command = commandSchema.parse({
      type: 'Attack',
      attackerId: 'a',
      targetId: 'b',
      defense: 'difesa',
      defenseBase: 12,
      damageResource: 'hp',
    });
    expect(c.type).toBe('Attack');
  });
});

// Drift guard runtime: gli enum statici di comando di @loomn/shared (foglia, copie proprie) devono
// coincidere con i const di @loomn/engine. shared NON puo importare engine -> questo guard vive in host,
// dove entrambi coesistono (come il guard wire->motore sopra).
describe('enum statici di comando shared <-> engine (allineati)', () => {
  it('DIFFICULTIES coincide', () => {
    expect([...DIFFICULTIES]).toEqual([...ENGINE_DIFFICULTIES]);
  });

  it('SOFT_PHASES coincide', () => {
    expect([...SOFT_PHASES]).toEqual([...ENGINE_SOFT_PHASES]);
  });

  it('QUEST_OUTCOMES coincide', () => {
    expect([...QUEST_OUTCOMES]).toEqual([...ENGINE_QUEST_OUTCOMES]);
  });

  it('RESOURCE_DIRECTIONS coincide', () => {
    expect([...RESOURCE_DIRECTIONS]).toEqual([...ENGINE_RESOURCE_DIRECTIONS]);
  });
});
