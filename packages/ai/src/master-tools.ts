// Strumenti del Master AI: il contratto LLM<->engine del bounded context AI (spec 5.4).
// Ogni strumento ha un nome, una descrizione, uno schema Zod degli argomenti e un mapper
// PURO da argomenti validati a un Command dell engine. Gli schemi vivono qui (NON in
// shared): sono il contratto fra il modello e l engine, di proprieta del contesto AI.
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Command } from '@loomn/engine';
import { DIFFICULTIES } from '@loomn/engine';
import type { LlmToolDef } from './language-model';
import { parseJson } from './json-repair';

// --- schemi degli argomenti (Zod) ---

// Gli LLM stringificano i numeri di routine ("defenseBase":"10") e cosi avevano bloccato
// il combattimento nella slice (finding G1). Coerciamo le stringhe numeriche a numero, ma
// restiamo STRICT: stringa vuota/whitespace/non-numerica/null/mancante e RIFIUTATA (niente
// 0 silenzioso). Il codice resta l arbitro: un campo numerico assente non diventa uno zero.
const llmNumber = z.preprocess((v) => {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return v; // resta stringa -> z.number la rifiuta
    const n = Number(trimmed);
    return Number.isNaN(n) ? v : n; // numerica -> numero; non-numerica -> resta stringa (rifiutata)
  }
  return v; // number passa; null/undefined arrivano a z.number e sono rifiutati
}, z.number().finite()); // .finite() chiude anche "Infinity"/"-Infinity" (numeri degeneri, prima irraggiungibili via JSON)

// Gli LLM stringificano anche gli argomenti ARRAY ("participants":"[{...}]") e cosi avevano
// impedito l avvio dello scontro nella slice (finding G6). Coerciamo una stringa JSON-array
// ad array delegando poi allo schema reale, ma restiamo STRICT come llmNumber: una stringa
// non-JSON o un JSON che non e un array resta com e e lo schema array sottostante la rifiuta
// (niente array silenzioso). Il vincolo .min(1) vive nello schema avvolto e resta in vigore.
function llmArray<S extends z.ZodTypeAny>(schema: S) {
  return z.preprocess((v) => {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') return v; // resta stringa -> lo schema array la rifiuta
      try {
        return JSON.parse(trimmed) as unknown; // array -> validato; oggetto/numero -> rifiutato a valle
      } catch {
        return v; // non-JSON -> resta stringa (rifiutata)
      }
    }
    return v; // array passa; null/undefined arrivano allo schema e sono rifiutati
  }, schema);
}

// Coercivo-intero: gemello di llmNumber per i campi che DEVONO essere interi (count/sides dei
// dadi). Stessa politica strict: coerce SOLO stringhe numeriche, poi valida come intero >= min.
// Stringa vuota/whitespace/non-numerica/decimale/null/mancante/non-finita -> RIFIUTATA
// (z.number().int() rifiuta gia decimali, Infinity e NaN). Niente intero silenzioso: il codice
// resta l arbitro. Factory perche il minimo varia per campo e va dentro lo schema avvolto.
function llmInt(min: number) {
  return z.preprocess((v) => {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '') return v; // resta stringa -> z.number la rifiuta
      const n = Number(trimmed);
      return Number.isNaN(n) ? v : n; // numerica -> numero; non-numerica -> resta stringa (rifiutata)
    }
    return v; // number passa; null/undefined arrivano a z.number e sono rifiutati
  }, z.number().int().min(min));
}

const resourcePoolSchema = z.object({ current: llmNumber, max: llmNumber });

const spawnNpcSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  attributes: z.record(llmNumber).optional(),
  skills: z.record(llmNumber).optional(),
  resources: z.record(resourcePoolSchema).optional(),
});

const attackSchema = z.object({
  attackerId: z.string().min(1),
  targetId: z.string().min(1),
  attribute: z.string().min(1).optional(),
  skill: z.string().min(1).optional(),
  defense: z.string().min(1),
  defenseBase: llmNumber,
  damageResource: z.string().min(1),
});

const startEncounterSchema = z.object({
  encounterId: z.string().min(1),
  participants: llmArray(
    z
      .array(z.object({ actorId: z.string().min(1), zone: z.string().min(1), initiative: llmNumber }))
      .min(1),
  ),
});

const requestCheckSchema = z.object({
  actorId: z.string().min(1),
  attribute: z.string().min(1).optional(),
  skill: z.string().min(1).optional(),
  difficulty: z.enum(DIFFICULTIES), // enum auto-validante: l AI non puo inventare una difficolta
});

const dieGroupArgSchema = z.object({
  count: llmInt(1), // almeno 1 dado
  sides: llmInt(2), // almeno un d2
});

const applyEffectSchema = z.object({
  targetId: z.string().min(1),
  resource: z.string().min(1),
  direction: z.enum(['restore', 'drain']), // enum auto-validante: l AI dichiara l intento, non il segno
  dice: llmArray(z.array(dieGroupArgSchema).min(1)), // G6: accetta anche un array stringificato
  bonus: llmNumber.optional(), // G1: accetta "2" oltre a 2
});

const endTurnSchema = z.object({});
const nextRoundSchema = z.object({});

// --- registro: ogni voce e gia type-erased ma costruita su uno schema concreto ---

interface ToolEntry {
  description: string;
  jsonSchema: Record<string, unknown>;
  resolve(json: unknown): { ok: true; command: Command } | { ok: false; error: string };
}

function issuesOf(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

// Cattura lo schema concreto S e ne deriva il tipo di OUTPUT con z.infer; il registro resta
// omogeneo (Record<string,ToolEntry>). Vincolare su S (non su z.ZodType<A>) e necessario per gli
// schemi con input/output divergenti come llmNumber (z.preprocess: input unknown, output number):
// z.ZodType<A> forzerebbe input=output=A e degraderebbe l output a unknown.
function makeEntry<S extends z.ZodTypeAny>(
  description: string,
  schema: S,
  toCommand: (args: z.infer<S>) => Command,
): ToolEntry {
  return {
    description,
    jsonSchema: zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>,
    resolve(json) {
      const v = schema.safeParse(json);
      if (!v.success) return { ok: false, error: issuesOf(v.error) };
      return { ok: true, command: toCommand(v.data) };
    },
  };
}

const TOOLS: Record<string, ToolEntry> = {
  spawn_npc: makeEntry(
    'Crea e aggiunge un nuovo PNG al mondo (diventa canone). Usa id univoci.',
    spawnNpcSchema,
    (a) => ({
      type: 'AddActor',
      actor: {
        id: a.id,
        name: a.name,
        kind: 'npc',
        attributes: a.attributes ?? {},
        skills: a.skills ?? {},
        resources: a.resources ?? {},
        conditions: [],
        items: [],
        progression: { xp: 0, level: 0 },
      },
    }),
  ),
  request_check: makeEntry(
    'Chiede una prova di abilita: il motore tira e applica i gradi di successo in modo deterministico. La difficolta e qualitativa (trivial..legendary), non un numero.',
    requestCheckSchema,
    (a) => ({
      type: 'RequestCheck',
      actorId: a.actorId,
      difficulty: a.difficulty,
      ...(a.attribute !== undefined ? { attribute: a.attribute } : {}),
      ...(a.skill !== undefined ? { skill: a.skill } : {}),
    }),
  ),
  apply_effect: makeEntry(
    'Applica una conseguenza su una risorsa di un attore: il motore tira l espressione di dadi e clampa la risorsa in modo deterministico. direction e restore (ripristina) o drain (prosciuga); i dadi sono {count,sides}.',
    applyEffectSchema,
    (a) => ({
      type: 'ApplyEffect',
      targetId: a.targetId,
      resource: a.resource,
      direction: a.direction,
      dice: a.dice,
      ...(a.bonus !== undefined ? { bonus: a.bonus } : {}),
    }),
  ),
  attack: makeEntry(
    'Dichiara un attacco: il motore tira la prova e applica il danno in modo deterministico.',
    attackSchema,
    (a) => ({
      type: 'Attack',
      attackerId: a.attackerId,
      targetId: a.targetId,
      defense: a.defense,
      defenseBase: a.defenseBase,
      damageResource: a.damageResource,
      ...(a.attribute !== undefined ? { attribute: a.attribute } : {}),
      ...(a.skill !== undefined ? { skill: a.skill } : {}),
    }),
  ),
  start_encounter: makeEntry(
    'Avvia uno scontro con i partecipanti indicati (devono gia esistere come attori).',
    startEncounterSchema,
    (a) => ({ type: 'StartEncounter', encounterId: a.encounterId, participants: a.participants }),
  ),
  end_turn: makeEntry('Termina il turno corrente nello scontro attivo.', endTurnSchema, () => ({ type: 'EndTurn' })),
  next_round: makeEntry('Avanza al round successivo dello scontro attivo.', nextRoundSchema, () => ({
    type: 'NextRound',
  })),
};

export type ToolResolution =
  | { ok: true; toolName: string; command: Command }
  | { ok: false; toolName: string; error: string };

/** Definizioni degli strumenti da passare al modello (LlmToolDef[]). */
export function masterToolDefs(): LlmToolDef[] {
  return Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, parameters: t.jsonSchema }));
}

/** Parsa+valida gli argomenti grezzi di una tool-call e li mappa a un Command, oppure spiega l errore. */
export function resolveToolCall(name: string, rawArgs: string): ToolResolution {
  const tool = TOOLS[name];
  if (tool === undefined) return { ok: false, toolName: name, error: `strumento sconosciuto: ${name}` };
  const parsed = parseJson(rawArgs);
  if (!parsed.ok) return { ok: false, toolName: name, error: parsed.error };
  const r = tool.resolve(parsed.json);
  if (!r.ok) return { ok: false, toolName: name, error: r.error };
  return { ok: true, toolName: name, command: r.command };
}
