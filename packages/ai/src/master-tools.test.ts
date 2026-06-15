import { describe, it, expect } from 'vitest';
import { masterToolDefs, resolveToolCall } from './master-tools';

describe('masterToolDefs', () => {
  it('espone i 5 strumenti con schemi JSON inline (niente ref)', () => {
    const defs = masterToolDefs();
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual(['attack', 'end_turn', 'next_round', 'spawn_npc', 'start_encounter']);
    for (const d of defs) {
      expect(typeof d.description).toBe('string');
      expect((d.parameters as { type?: string }).type).toBe('object');
      expect(JSON.stringify(d.parameters)).not.toContain('$ref');
    }
  });
});

describe('resolveToolCall', () => {
  it('mappa attack valido a un Command Attack, senza chiavi opzionali assenti', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":10,"damageResource":"hp"}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command.type).toBe('Attack');
    expect('attribute' in r.command).toBe(false);
    expect('skill' in r.command).toBe(false);
  });

  it('include le chiavi opzionali quando presenti', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","attribute":"forza","defense":"riflessi","defenseBase":10,"damageResource":"hp"}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toMatchObject({ type: 'Attack', attribute: 'forza' });
  });

  it('mappa spawn_npc riempiendo i default (conditions/items/progression)', () => {
    const r = resolveToolCall('spawn_npc', '{"id":"g1","name":"Goblin"}');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({
      type: 'AddActor',
      actor: {
        id: 'g1',
        name: 'Goblin',
        kind: 'npc',
        attributes: {},
        skills: {},
        resources: {},
        conditions: [],
        items: [],
        progression: { xp: 0, level: 0 },
      },
    });
  });

  it('rifiuta argomenti che non rispettano lo schema', () => {
    const r = resolveToolCall('attack', '{"attackerId":"pc1"}');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error.length).toBeGreaterThan(0);
  });

  it('rifiuta uno strumento sconosciuto', () => {
    const r = resolveToolCall('teletrasporta', '{}');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('sconosciuto');
  });

  it('rifiuta argomenti non JSON', () => {
    const r = resolveToolCall('end_turn', 'non-json');
    expect(r.ok).toBe(false);
  });
});
