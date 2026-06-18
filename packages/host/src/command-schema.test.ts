import { describe, it, expect } from 'vitest';
import type { Command } from '@loomn/engine';
import {
  DIFFICULTIES as ENGINE_DIFFICULTIES,
  SOFT_PHASES as ENGINE_SOFT_PHASES,
  QUEST_OUTCOMES as ENGINE_QUEST_OUTCOMES,
  RESOURCE_DIRECTIONS as ENGINE_RESOURCE_DIRECTIONS,
} from '@loomn/engine';
import { commandSchema } from '@loomn/shared';
import { DIFFICULTIES, SOFT_PHASES, QUEST_OUTCOMES, RESOURCE_DIRECTIONS } from '@loomn/shared';

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
