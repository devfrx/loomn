// Utility di salvataggio JSON per il livello 3 dello StructuredOutputPort (spec 7).
import { jsonrepair } from 'jsonrepair';

export type JsonParse = { ok: true; json: unknown } | { ok: false; error: string };

export function parseJson(raw: string): JsonParse {
  try {
    return { ok: true, json: JSON.parse(raw) as unknown };
  } catch (e) {
    return { ok: false, error: `JSON non valido: ${(e as Error).message}` };
  }
}

// Strip fence ```json...``` poi slice dal primo { all ultimo } (toglie la prosa attorno).
// jsonrepair NON estrae il JSON dalla prosa, quindi l estrazione va fatta prima.
// Gestisce solo candidati OGGETTO: lo StructuredOutputPort e object-rooted (i parameters
// delle function-call e i root json_schema dei provider devono essere oggetti; per le liste
// si avvolge in un oggetto, es. { items: [...] }), quindi non si estraggono array top-level.
export function extractJsonCandidate(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const inner = fence?.[1];
  if (inner !== undefined) s = inner.trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

export function repairJson(raw: string): JsonParse {
  let repaired: string;
  try {
    repaired = jsonrepair(extractJsonCandidate(raw));
  } catch (e) {
    return { ok: false, error: `repair fallita: ${(e as Error).message}` };
  }
  return parseJson(repaired);
}
