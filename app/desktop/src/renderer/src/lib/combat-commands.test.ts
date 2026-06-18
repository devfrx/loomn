import { describe, it, expect } from 'vitest';
import { buildAttack, buildStartEncounter, endTurn, nextRound, endEncounter } from './combat-commands';

describe('buildAttack', () => {
  it('costruisce un Attack minimale omettendo attribute e skill', () => {
    const cmd = buildAttack({ attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 12, damageResource: 'hp' });
    expect(cmd).toEqual({ type: 'Attack', attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 12, damageResource: 'hp' });
  });

  it('include attribute e skill quando presenti', () => {
    const cmd = buildAttack({ attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 12, damageResource: 'hp', attribute: 'forza', skill: 'lame' });
    expect(cmd).toMatchObject({ attribute: 'forza', skill: 'lame' });
  });

  it('omette attribute e skill se stringa vuota', () => {
    const cmd = buildAttack({ attackerId: 'a', targetId: 'b', defense: 'difesa', defenseBase: 12, damageResource: 'hp', attribute: '', skill: '' });
    expect('attribute' in cmd).toBe(false);
    expect('skill' in cmd).toBe(false);
  });
});

describe('comandi di turno', () => {
  it('endTurn nextRound endEncounter sono literal del Command', () => {
    expect(endTurn()).toEqual({ type: 'EndTurn' });
    expect(nextRound()).toEqual({ type: 'NextRound' });
    expect(endEncounter()).toEqual({ type: 'EndEncounter' });
  });
});

describe('buildStartEncounter', () => {
  it('costruisce StartEncounter dai soli attori inclusi', () => {
    const cmd = buildStartEncounter('scontro-1', [
      { actorId: 'a', include: true, initiative: 18, zone: 'centro' },
      { actorId: 'b', include: false, initiative: 10, zone: 'retro' },
      { actorId: 'c', include: true, initiative: 12, zone: 'fronte' },
    ]);
    expect(cmd).toEqual({
      type: 'StartEncounter',
      encounterId: 'scontro-1',
      participants: [
        { actorId: 'a', zone: 'centro', initiative: 18 },
        { actorId: 'c', zone: 'fronte', initiative: 12 },
      ],
    });
  });

  it('ritorna null se nessun attore e incluso', () => {
    expect(buildStartEncounter('scontro-1', [{ actorId: 'a', include: false, initiative: 10, zone: 'centro' }])).toBeNull();
  });
});
