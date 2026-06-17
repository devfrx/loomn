import { describe, it, expect } from 'vitest';
import { createVocabulary } from '@loomn/engine';
import { masterToolDefs, resolveToolCall } from './master-tools';

const VOCAB = createVocabulary({ attributes: ['forza'], skills: ['arcano'], resources: ['hp'], defenses: ['riflessi'] });

describe('masterToolDefs', () => {
  it('in combat espone i 9 strumenti di combat con schemi JSON inline (niente ref)', () => {
    const defs = masterToolDefs('combat', VOCAB);
    const names = defs.map((d) => d.name).sort();
    expect(names).toEqual([
      'advance_quest', 'apply_effect', 'attack', 'end_encounter', 'end_turn',
      'next_round', 'request_check', 'spawn_npc', 'start_quest',
    ]);
    for (const d of defs) {
      expect(typeof d.description).toBe('string');
      expect((d.parameters as { type?: string }).type).toBe('object');
      expect(JSON.stringify(d.parameters)).not.toContain('$ref');
    }
  });

  it('in una fase soft espone i 7 strumenti non-combat (start_encounter/enter_phase, niente attack)', () => {
    const names = masterToolDefs('exploration', VOCAB).map((d) => d.name).sort();
    expect(names).toEqual([
      'advance_quest', 'apply_effect', 'enter_phase', 'request_check',
      'spawn_npc', 'start_encounter', 'start_quest',
    ]);
  });

  // G6: la coercizione array (z.preprocess) deve restare trasparente allo schema JSON mostrato
  // al modello — advertizziamo participants come array, non come string (come per G1 sui number).
  it('mostra participants come array nello schema di start_encounter (preprocess trasparente)', () => {
    const se = masterToolDefs('exploration', VOCAB).find((d) => d.name === 'start_encounter');
    if (se === undefined) throw new Error('atteso start_encounter');
    const participants = (se.parameters as { properties: Record<string, { type?: string; minItems?: number }> })
      .properties.participants;
    if (participants === undefined) throw new Error('atteso participants');
    expect(participants.type).toBe('array');
    expect(participants.minItems).toBe(1);
  });
});

describe('resolveToolCall', () => {
  it('mappa attack valido a un Command Attack, senza chiavi opzionali assenti', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":10,"damageResource":"hp"}',
      VOCAB,
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
      VOCAB,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toMatchObject({ type: 'Attack', attribute: 'forza' });
  });

  it('mappa spawn_npc riempiendo i default (conditions/items/progression)', () => {
    const r = resolveToolCall('spawn_npc', '{"id":"g1","name":"Goblin"}', VOCAB);
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
    const r = resolveToolCall('attack', '{"attackerId":"pc1"}', VOCAB);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error.length).toBeGreaterThan(0);
    expect(r.error).toContain('targetId');
  });

  it('rifiuta uno strumento sconosciuto', () => {
    const r = resolveToolCall('teletrasporta', '{}', VOCAB);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('sconosciuto');
  });

  it('rifiuta argomenti non JSON', () => {
    const r = resolveToolCall('end_turn', 'non-json', VOCAB);
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
      VOCAB,
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
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('defenseBase');
  });

  it('rifiuta defenseBase stringa non numerica', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":"forte","damageResource":"hp"}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('defenseBase');
  });

  it('coerce initiative stringa numerica in start_encounter', () => {
    const r = resolveToolCall(
      'start_encounter',
      '{"encounterId":"e1","participants":[{"actorId":"pc1","zone":"z1","initiative":"3"}]}',
      VOCAB,
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
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('defenseBase');
  });

  it('rifiuta defenseBase null', () => {
    const r = resolveToolCall(
      'attack',
      '{"attackerId":"pc1","targetId":"g1","defense":"riflessi","defenseBase":null,"damageResource":"hp"}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('defenseBase');
  });

  it('coerce attributi e risorse numerici inviati come stringhe in spawn_npc', () => {
    const r = resolveToolCall(
      'spawn_npc',
      '{"id":"g1","name":"Goblin","attributes":{"forza":"3"},"resources":{"hp":{"current":"20","max":"20"}}}',
      VOCAB,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'AddActor') throw new Error('atteso AddActor');
    expect(r.command.actor.attributes).toEqual({ forza: 3 });
    expect(r.command.actor.resources).toEqual({ hp: { current: 20, max: 20 } });
  });
});

// G6: gli LLM stringificano anche gli argomenti ARRAY ("participants":"[{...}]") e cosi
// avevano impedito l avvio dello scontro nella slice. Coerciamo una stringa JSON-array ad
// array, ma restiamo STRICT come per G1: una stringa non-JSON o un JSON che non e un array
// resta com e e lo schema array sottostante la rifiuta (niente coercizione silenziosa); il
// vincolo .min(1) sopravvive alla coercizione.
describe('coercizione argomenti array (G6)', () => {
  it('coerce participants stringificato a array', () => {
    const r = resolveToolCall(
      'start_encounter',
      '{"encounterId":"e1","participants":"[{\\"actorId\\":\\"pc1\\",\\"zone\\":\\"z1\\",\\"initiative\\":3}]"}',
      VOCAB,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'StartEncounter') throw new Error('atteso StartEncounter');
    expect(r.command.participants).toEqual([{ actorId: 'pc1', zone: 'z1', initiative: 3 }]);
  });

  it('compone con G1: initiative stringa dentro participants stringificato', () => {
    const r = resolveToolCall(
      'start_encounter',
      '{"encounterId":"e1","participants":"[{\\"actorId\\":\\"pc1\\",\\"zone\\":\\"z1\\",\\"initiative\\":\\"7\\"}]"}',
      VOCAB,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'StartEncounter') throw new Error('atteso StartEncounter');
    expect(r.command.participants[0]?.initiative).toBe(7);
  });

  it('rifiuta participants stringa non JSON', () => {
    const r = resolveToolCall('start_encounter', '{"encounterId":"e1","participants":"pc1, pc2"}', VOCAB);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('participants');
  });

  it('rifiuta participants JSON che non e un array', () => {
    const r = resolveToolCall(
      'start_encounter',
      '{"encounterId":"e1","participants":"{\\"actorId\\":\\"pc1\\",\\"zone\\":\\"z1\\",\\"initiative\\":3}"}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('participants');
  });

  it('rifiuta participants stringa vuota', () => {
    const r = resolveToolCall('start_encounter', '{"encounterId":"e1","participants":""}', VOCAB);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('participants');
  });

  it('rifiuta participants array vuoto anche se stringificato (.min(1) sopravvive)', () => {
    const r = resolveToolCall('start_encounter', '{"encounterId":"e1","participants":"[]"}', VOCAB);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('participants');
  });
});

describe('resolveToolCall request_check', () => {
  it('mappa request_check valido a RequestCheck', () => {
    const r = resolveToolCall('request_check', '{"actorId":"pc1","attribute":"forza","difficulty":"hard"}', VOCAB);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'RequestCheck', actorId: 'pc1', attribute: 'forza', difficulty: 'hard' });
  });

  it('omette attribute e skill quando assenti', () => {
    const r = resolveToolCall('request_check', '{"actorId":"pc1","difficulty":"easy"}', VOCAB);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'RequestCheck', actorId: 'pc1', difficulty: 'easy' });
    expect('attribute' in r.command).toBe(false);
    expect('skill' in r.command).toBe(false);
  });

  it('rifiuta una difficolta fuori band', () => {
    const r = resolveToolCall('request_check', '{"actorId":"pc1","difficulty":"impossibile"}', VOCAB);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('difficulty');
  });

  it('rifiuta difficulty mancante', () => {
    const r = resolveToolCall('request_check', '{"actorId":"pc1"}', VOCAB);
    expect(r.ok).toBe(false);
  });
});

describe('resolveToolCall apply_effect', () => {
  it('mappa apply_effect valido a ApplyEffect (restore) con bonus', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":2,"sides":6}],"bonus":1}',
      VOCAB,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({
      type: 'ApplyEffect',
      targetId: 'pc1',
      resource: 'hp',
      direction: 'restore',
      dice: [{ count: 2, sides: 6 }],
      bonus: 1,
    });
  });

  it('omette bonus quando assente', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"drain","dice":[{"count":1,"sides":8}]}',
      VOCAB,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({
      type: 'ApplyEffect',
      targetId: 'pc1',
      resource: 'hp',
      direction: 'drain',
      dice: [{ count: 1, sides: 8 }],
    });
    expect('bonus' in r.command).toBe(false);
  });

  it('coerce dice stringificato a array (G6)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":"[{\\"count\\":2,\\"sides\\":6}]"}',
      VOCAB,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'ApplyEffect') throw new Error('atteso ApplyEffect');
    expect(r.command.dice).toEqual([{ count: 2, sides: 6 }]);
  });

  it('coerce count e sides stringa numerica a intero (llmInt + G1)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":"2","sides":"6"}]}',
      VOCAB,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'ApplyEffect') throw new Error('atteso ApplyEffect');
    expect(r.command.dice).toEqual([{ count: 2, sides: 6 }]);
  });

  it('coerce bonus stringa numerica (G1)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":1,"sides":6}],"bonus":"2"}',
      VOCAB,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    if (r.command.type !== 'ApplyEffect') throw new Error('atteso ApplyEffect');
    expect(r.command.bonus).toBe(2);
  });

  it('rifiuta direction fuori enum', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"heal","dice":[{"count":1,"sides":6}]}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('direction');
  });

  it('rifiuta dice vuoto (.min(1) sopravvive)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[]}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('dice');
  });

  it('rifiuta sides non intero (decimale): llmInt e strict', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":1,"sides":6.5}]}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('sides');
  });

  it('rifiuta count sotto il minimo (count >= 1)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":0,"sides":6}]}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('count');
  });

  it('rifiuta sides sotto il minimo (sides >= 2)', () => {
    const r = resolveToolCall(
      'apply_effect',
      '{"targetId":"pc1","resource":"hp","direction":"restore","dice":[{"count":1,"sides":1}]}',
      VOCAB,
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('sides');
  });

  it('mostra dice come array di interi e direction come enum nello schema (coercizione trasparente)', () => {
    const ae = masterToolDefs('exploration', VOCAB).find((d) => d.name === 'apply_effect');
    if (ae === undefined) throw new Error('atteso apply_effect');
    const props = (ae.parameters as {
      properties: Record<string, {
        type?: string;
        enum?: string[];
        minItems?: number;
        items?: { properties?: Record<string, { type?: string; minimum?: number }> };
      }>;
    }).properties;
    expect(props.dice?.type).toBe('array');
    expect(props.dice?.minItems).toBe(1);
    expect(props.direction?.enum).toEqual(['restore', 'drain']);
    const item = props.dice?.items?.properties;
    expect(item?.count?.type).toBe('integer');
    expect(item?.count?.minimum).toBe(1);
    expect(item?.sides?.type).toBe('integer');
    expect(item?.sides?.minimum).toBe(2);
  });
});

describe('resolveToolCall start_quest', () => {
  it('mappa start_quest valido a StartQuest con description', () => {
    const r = resolveToolCall('start_quest', '{"id":"q1","title":"Trova l amuleto","description":"Per il Barone"}', VOCAB);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'StartQuest', id: 'q1', title: 'Trova l amuleto', description: 'Per il Barone' });
  });

  it('omette description quando assente', () => {
    const r = resolveToolCall('start_quest', '{"id":"q1","title":"Trova l amuleto"}', VOCAB);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'StartQuest', id: 'q1', title: 'Trova l amuleto' });
    expect('description' in r.command).toBe(false);
  });
});

describe('resolveToolCall advance_quest', () => {
  it('mappa advance_quest valido a AdvanceQuest', () => {
    const r = resolveToolCall('advance_quest', '{"questId":"q1","status":"completed"}', VOCAB);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('atteso ok');
    expect(r.command).toEqual({ type: 'AdvanceQuest', questId: 'q1', status: 'completed' });
  });

  it('rifiuta uno status fuori enum (es. active)', () => {
    const r = resolveToolCall('advance_quest', '{"questId":"q1","status":"active"}', VOCAB);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('atteso errore');
    expect(r.error).toContain('status');
  });

  it('rifiuta status mancante', () => {
    const r = resolveToolCall('advance_quest', '{"questId":"q1"}', VOCAB);
    expect(r.ok).toBe(false);
  });

  it('mostra status come enum [completed, failed] nello schema', () => {
    const aq = masterToolDefs('exploration', VOCAB).find((d) => d.name === 'advance_quest');
    if (aq === undefined) throw new Error('atteso advance_quest');
    const status = (aq.parameters as { properties: Record<string, { enum?: string[] }> }).properties.status;
    expect(status?.enum).toEqual(['completed', 'failed']);
  });
});

describe('tool di fase enter_phase / end_encounter', () => {
  it('enter_phase mappa a EnterPhase con la fase richiesta', () => {
    const r = resolveToolCall('enter_phase', '{"to":"dialogue"}', VOCAB);
    expect(r).toEqual({ ok: true, toolName: 'enter_phase', command: { type: 'EnterPhase', to: 'dialogue' } });
  });
  it('enter_phase rifiuta una fase fuori enum (anche combat)', () => {
    expect(resolveToolCall('enter_phase', '{"to":"combat"}', VOCAB).ok).toBe(false);
    expect(resolveToolCall('enter_phase', '{"to":"sognante"}', VOCAB).ok).toBe(false);
  });
  it('end_encounter mappa a EndEncounter', () => {
    const r = resolveToolCall('end_encounter', '{}', VOCAB);
    expect(r).toEqual({ ok: true, toolName: 'end_encounter', command: { type: 'EndEncounter' } });
  });
  it('lo schema di enter_phase mostra solo le fasi soft', () => {
    const ep = masterToolDefs('exploration', VOCAB).find((d) => d.name === 'enter_phase');
    if (ep === undefined) throw new Error('atteso enter_phase');
    const to = (ep.parameters as { properties: Record<string, { enum?: string[] }> }).properties.to;
    expect(to?.enum).toEqual(['exploration', 'dialogue', 'downtime']);
  });
});

describe('z.enum dal vocabolario', () => {
  it('attack rifiuta un damageResource fuori vocabolario', () => {
    const r = resolveToolCall('attack', JSON.stringify({ attackerId: 'a', targetId: 'b', defense: 'riflessi', defenseBase: 10, damageResource: 'danno' }), VOCAB);
    expect(r.ok).toBe(false);
  });
  it('attack accetta un damageResource in vocabolario', () => {
    const r = resolveToolCall('attack', JSON.stringify({ attackerId: 'a', targetId: 'b', defense: 'riflessi', defenseBase: 10, damageResource: 'hp' }), VOCAB);
    expect(r.ok).toBe(true);
  });
  it('request_check rifiuta una skill fuori vocabolario', () => {
    const r = resolveToolCall('request_check', JSON.stringify({ actorId: 'a', skill: 'spada', difficulty: 'moderate' }), VOCAB);
    expect(r.ok).toBe(false);
  });
  it('masterToolDefs mostra l enum di damageResource nel JSON schema', () => {
    const defs = masterToolDefs('combat', VOCAB);
    const attack = defs.find((d) => d.name === 'attack');
    expect(JSON.stringify(attack?.parameters)).toContain('"enum":["hp"]');
  });
  it('con vocabolario vuoto ripiega su stringa (niente z.enum vuoto)', () => {
    const empty = createVocabulary({ attributes: [], skills: [], resources: [], defenses: [] });
    const r = resolveToolCall('apply_effect', JSON.stringify({ targetId: 'a', resource: 'qualsiasi', direction: 'restore', dice: [{ count: 1, sides: 6 }] }), empty);
    expect(r.ok).toBe(true);
  });
});
