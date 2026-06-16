import { describe, it, expect, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase, type OpenDb } from './db';
import { createCanonLedger } from './canon-ledger';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

function ledger() {
  open = openDatabase(':memory:');
  return createCanonLedger(open.db);
}

describe('CanonLedger', () => {
  it('registra e ritrova un fatto attivo con la sua provenienza', () => {
    const l = ledger();
    l.record({ id: 'f1', subject: 'pc1', predicate: 'ha_ucciso', object: 'Guardia#3', eventSeq: 8120 });
    expect(l.active()).toEqual([
      { id: 'f1', subject: 'pc1', predicate: 'ha_ucciso', object: 'Guardia#3', eventSeq: 8120, status: 'active' },
    ]);
  });

  it('filtra i fatti attivi per subject, predicate e object', () => {
    const l = ledger();
    l.record({ id: 'f1', subject: 'pc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 1 });
    l.record({ id: 'f2', subject: 'pc1', predicate: 'possiede', object: 'Spada', eventSeq: 2 });
    l.record({ id: 'f3', subject: 'npc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 3 });
    expect(l.active({ subject: 'pc1' }).map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(l.active({ predicate: 'si_trova_a' }).map((f) => f.id)).toEqual(['f1', 'f3']);
    expect(l.active({ object: 'Taverna' }).map((f) => f.id)).toEqual(['f1', 'f3']);
    expect(l.active({ subject: 'pc1', predicate: 'possiede' }).map((f) => f.id)).toEqual(['f2']);
  });

  it('ritira un fatto: esce dagli attivi ma resta nello storico', () => {
    const l = ledger();
    l.record({ id: 'f1', subject: 'pc1', predicate: 'alleato_di', object: 'Re', eventSeq: 1 });
    l.retract('f1');
    expect(l.active()).toEqual([]);
    expect(l.all().map((f) => ({ id: f.id, status: f.status }))).toEqual([{ id: 'f1', status: 'retracted' }]);
  });

  it('supersede ritira il fatto funzionale precedente e ne attiva uno nuovo', () => {
    const l = ledger();
    l.record({ id: 'loc1', subject: 'pc1', predicate: 'si_trova_a', object: 'Taverna', eventSeq: 1 });
    l.supersede({ id: 'loc2', subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', eventSeq: 5 });
    expect(l.active({ subject: 'pc1', predicate: 'si_trova_a' })).toEqual([
      { id: 'loc2', subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', eventSeq: 5, status: 'active' },
    ]);
    expect(l.all({ subject: 'pc1', predicate: 'si_trova_a' }).map((f) => ({ id: f.id, status: f.status }))).toEqual([
      { id: 'loc1', status: 'retracted' },
      { id: 'loc2', status: 'active' },
    ]);
  });

  it('supersede non tocca fatti con predicato diverso dello stesso soggetto', () => {
    const l = ledger();
    l.record({ id: 'a', subject: 'pc1', predicate: 'possiede', object: 'Spada', eventSeq: 1 });
    l.supersede({ id: 'b', subject: 'pc1', predicate: 'si_trova_a', object: 'Foresta', eventSeq: 2 });
    expect(l.active({ subject: 'pc1' }).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('valida lo status letto dal DB e rifiuta un valore illegale (confine non fidato)', () => {
    const l = ledger();
    l.record({ id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1 });
    open?.db.run(sql`UPDATE canon_facts SET status = 'bogus' WHERE id = 'f1'`);
    expect(() => l.all()).toThrow();
  });
});
