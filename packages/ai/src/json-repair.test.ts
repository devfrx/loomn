import { describe, it, expect } from 'vitest';
import { parseJson, extractJsonCandidate, repairJson } from './json-repair';

describe('parseJson', () => {
  it('parsa JSON valido', () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, json: { a: 1 } });
  });
  it('riporta errore su JSON non valido', () => {
    const r = parseJson('{a:1}');
    expect(r.ok).toBe(false);
  });
});

describe('extractJsonCandidate', () => {
  it('rimuove il fence markdown', () => {
    expect(extractJsonCandidate('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('estrae lo span oggetto dalla prosa', () => {
    expect(extractJsonCandidate('Ecco: {"a":1} fine.')).toBe('{"a":1}');
  });
});

describe('repairJson', () => {
  it('ripara virgola finale dentro un fence', () => {
    expect(repairJson('```json\n{"a":1,}\n```')).toEqual({ ok: true, json: { a: 1 } });
  });
  it('ripara chiavi non quotate e prosa attorno', () => {
    expect(repairJson('output: {a:1, b:2} ok')).toEqual({ ok: true, json: { a: 1, b: 2 } });
  });
  it('e lenient: testo nudo viene coerciato a stringa JSON (la validazione Zod e il vero filtro)', () => {
    expect(repairJson('solo prosa')).toEqual({ ok: true, json: 'solo prosa' });
  });
  it('riporta errore se non resta nulla da riparare', () => {
    expect(repairJson('   ').ok).toBe(false);
  });
});
