import { describe, it, expect } from 'vitest';
import {
  toCanonLine,
  sortCanonBySalience,
  groupSummaries,
  levelLabel,
  reflectMessage,
} from './journal-view';
import type { CanonFactDto, SummaryDto, ReflectResult } from '@loomn/shared';

function fact(over: Partial<CanonFactDto> & { id: string }): CanonFactDto {
  return {
    id: over.id,
    subject: over.subject ?? 'Eroe',
    predicate: over.predicate ?? 'possiede',
    object: over.object ?? 'spada',
    eventSeq: over.eventSeq ?? 1,
    salience: over.salience ?? 0.5,
    status: over.status ?? 'active',
  };
}

function summary(over: Partial<SummaryDto> & { id: string }): SummaryDto {
  return {
    id: over.id,
    level: over.level ?? 'scene',
    scope: over.scope ?? 'sess-1',
    text: over.text ?? 'testo',
    importance: over.importance ?? 5,
    salience: over.salience ?? 0.5,
    createdAt: over.createdAt ?? 1000,
    eventSeqFrom: over.eventSeqFrom ?? 1,
    eventSeqTo: over.eventSeqTo ?? 3,
  };
}

describe('toCanonLine', () => {
  it('compone soggetto predicato oggetto e il flag ritirato', () => {
    const line = toCanonLine(fact({ id: 'f1', subject: 'Eroe', predicate: 'odia', object: 'Goblin', status: 'retracted' }));
    expect(line.text).toBe('Eroe odia Goblin');
    expect(line.retracted).toBe(true);
  });

  it('marca un fatto attivo come non ritirato', () => {
    const line = toCanonLine(fact({ id: 'f2', status: 'active' }));
    expect(line.retracted).toBe(false);
  });
});

describe('sortCanonBySalience', () => {
  it('ordina per salienza decrescente', () => {
    const out = sortCanonBySalience([fact({ id: 'a', salience: 0.2 }), fact({ id: 'b', salience: 0.9 }), fact({ id: 'c', salience: 0.5 })]);
    expect(out.map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });

  it('mette i fatti ritirati sempre in coda', () => {
    const out = sortCanonBySalience([fact({ id: 'r', salience: 0.9, status: 'retracted' }), fact({ id: 'a', salience: 0.1, status: 'active' })]);
    expect(out.map((f) => f.id)).toEqual(['a', 'r']);
  });
});

describe('groupSummaries', () => {
  it('raggruppa per livello nell ordine dal piu ampio al piu fine', () => {
    const out = groupSummaries([summary({ id: 's', level: 'scene' }), summary({ id: 'c', level: 'campaign' }), summary({ id: 'a', level: 'arc' })]);
    expect(out.map((g) => g.level)).toEqual(['campaign', 'arc', 'scene']);
  });

  it('ordina per recency dentro il gruppo (eventSeqTo decrescente)', () => {
    const out = groupSummaries([summary({ id: 'vecchio', level: 'scene', eventSeqTo: 3 }), summary({ id: 'nuovo', level: 'scene', eventSeqTo: 9 })]);
    expect(out[0]!.items.map((s) => s.id)).toEqual(['nuovo', 'vecchio']);
  });

  it('salta i livelli senza riassunti', () => {
    const out = groupSummaries([summary({ id: 's', level: 'scene' })]);
    expect(out.map((g) => g.level)).toEqual(['scene']);
  });
});

describe('levelLabel', () => {
  it('etichetta i livelli in italiano', () => {
    expect(levelLabel('campaign')).toBe('Campagna');
    expect(levelLabel('scene')).toBe('Scena');
  });
});

describe('reflectMessage', () => {
  it('formatta un successo con riassunto e plurale', () => {
    const msg = reflectMessage({ ok: true, factCount: 3, summarized: true } satisfies ReflectResult);
    expect(msg).toContain('3 fatti');
    expect(msg.toLowerCase()).toContain('riassunto');
  });

  it('usa il singolare con un solo fatto e senza riassunto', () => {
    const msg = reflectMessage({ ok: true, factCount: 1, summarized: false } satisfies ReflectResult);
    expect(msg).toContain('1 fatto');
    expect(msg.toLowerCase()).not.toContain('riassunto');
  });

  it('riporta l errore su esito non ok', () => {
    const msg = reflectMessage({ ok: false, error: 'nessun provider' } satisfies ReflectResult);
    expect(msg).toContain('nessun provider');
  });
});
