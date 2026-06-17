import { describe, it, expect } from 'vitest';
import type { Command } from '@loomn/engine';
import { commandSchema } from '@loomn/shared';

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
