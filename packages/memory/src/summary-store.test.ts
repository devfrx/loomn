import { describe, it, expect, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase, type OpenDb } from './db';
import { createSummaryStore } from './summary-store';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

function store() {
  open = openDatabase(':memory:');
  return createSummaryStore(open.db);
}

const base = { scope: 'sess1', text: 't', importance: 5, salience: 0.5, createdAt: 1000 };

describe('SummaryStore', () => {
  it('registra e ritrova un riassunto con tutti i campi', () => {
    const s = store();
    s.record({ id: 's1', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 7, salience: 0.7, createdAt: 1234, eventSeqFrom: 1, eventSeqTo: 4 });
    expect(s.list()).toEqual([
      { id: 's1', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 7, salience: 0.7, createdAt: 1234, eventSeqFrom: 1, eventSeqTo: 4 },
    ]);
  });

  it('ordina i riassunti per eventSeqFrom crescente', () => {
    const s = store();
    s.record({ id: 'b', level: 'scene', ...base, eventSeqFrom: 10, eventSeqTo: 12 });
    s.record({ id: 'a', level: 'scene', ...base, eventSeqFrom: 1, eventSeqTo: 3 });
    expect(s.list().map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('filtra per level e per scope', () => {
    const s = store();
    s.record({ id: 'sc', level: 'scene', scope: 'sess1', text: 't', importance: 5, salience: 0.5, createdAt: 1, eventSeqFrom: 1, eventSeqTo: 2 });
    s.record({ id: 'se', level: 'session', scope: 'arc1', text: 't', importance: 5, salience: 0.5, createdAt: 2, eventSeqFrom: 1, eventSeqTo: 9 });
    expect(s.list({ level: 'scene' }).map((x) => x.id)).toEqual(['sc']);
    expect(s.list({ scope: 'arc1' }).map((x) => x.id)).toEqual(['se']);
  });

  it('valida il level letto dal DB e rifiuta un valore illegale', () => {
    const s = store();
    s.record({ id: 's1', level: 'scene', scope: 'sess1', text: 't', importance: 5, salience: 0.5, createdAt: 1, eventSeqFrom: 1, eventSeqTo: 2 });
    open?.db.run(sql`UPDATE summaries SET level = 'bogus' WHERE id = 's1'`);
    expect(() => s.list()).toThrow();
  });
});
