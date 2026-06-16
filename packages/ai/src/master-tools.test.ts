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
    expect(r.error).toContain('targetId');
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

// G1: gli LLM stringificano i numeri di routine ("defenseBase":"10"). Gli schemi coercono
// le stringhe numeriche a numero, ma restano STRICT: stringa vuota/non-numerica/mancante
// e rifiutata (niente 0 silenzioso) — il codice resta l arbitro.
describe('coercizione argomenti numerici (G1)', () => {
  it('coerce defenseBase stringa numerica a number', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":"10","damageResource":"hp"}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'Attack') throw new Error('atteso Attack');
    expect(r.command.defenseBase).toBe(10);
  });

  it('rifiuta defenseBase stringa vuota senza coercire a 0', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":"","damageResource":"hp"}',
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('defenseBase');
  });

  it('rifiuta defenseBase stringa non numerica', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":"forte","damageResource":"hp"}',
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('defenseBase');
  });

  it('coerce initiative stringa numerica in start_encounter', () => {
    const r = resolveToolCall(
      'start_encounter',
      '{"encounterId":"e1","participants":[{"actorId":"pc1","zone":"z1","initiative":"3"}]}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'StartEncounter') throw new Error('atteso StartEncounter');
    expect(r.command.participants[0]?.initiative).toBe(3);
  });

  it('rifiuta defenseBase non finito (Infinity)', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":"Infinity","damageResource":"hp"}',
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('defenseBase');
  });

  it('rifiuta defenseBase null', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":null,"damageResource":"hp"}',
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('defenseBase');
  });

  it('coerce attributi e risorse numerici inviati come stringhe in spawn_npc', () => {
    const r = resolveToolCall(
      'spawn_npc',
      '{"id":"g1","name":"Goblin","attributes":{"forza":"3"},"resources":{"hp":{"current":"20","max":"20"}}}',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'AddActor') throw new Error('atteso AddActor');
    expect(r.command.actor.attributes).toEqual({ forza: 3 });
    expect(r.command.actor.resources).toEqual({ hp: { current: 20, max: 20 } });
  });
});
