// Strumenti del Master AI: il contratto LLM<->engine del bounded context AI (spec 5.4).
// Ogni strumento ha un nome, una descrizione, uno schema Zod degli argomenti e un mapper
// PURO da argomenti validati a un Command dell engine. Gli schemi vivono qui (NON in
// shared): sono il contratto fra il modello e l engine, di proprieta del contesto AI.
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Command, Phase, Vocabulary } from '@loomn/engine';
import { DIFFICULTIES, MAX_DICE_COUNT, MAX_DICE_SIDES, QUEST_OUTCOMES, SOFT_PHASES, isCommandLegalInPhase } from '@loomn/engine';
import type { LlmToolDef } from './language-model';
import { parseJson } from './json-repair';
import { llmNumber, llmArray, llmInt } from './coercion';

// --- schemi degli argomenti (Zod) ---

// Campo-riferimento vincolato al vocabolario: set non vuoto -> z.enum (il modello non puo emettere
// un id fuori-vocabolario, JSON {enum:[...]}); set vuoto -> z.string() (non blocca finche un modulo
// non dichiara il vocabolario). Tipizzato z.ZodType<string> cosi z.infer resta string (niente any al
// confine). NB: z.record(z.enum) NON si usa: renderebbe il JSON con tutte le chiavi required.
function enumOrString(set: ReadonlySet<string>): z.ZodType<string> {
  const values = [...set];
  return values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string().min(1);
}

const resourcePoolSchema = z.object({ current: llmNumber, max: llmNumber });

const spawnNpcSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  attributes: z.record(llmNumber).optional(),
  skills: z.record(llmNumber).optional(),
  resources: z.record(resourcePoolSchema).optional(),
});

const startEncounterSchema = z.object({
  encounterId: z.string().min(1),
  participants: llmArray(
    z
      .array(z.object({ actorId: z.string().min(1), zone: z.string().min(1), initiative: llmNumber }))
      .min(1),
  ),
});

const dieGroupArgSchema = z.object({
  count: llmInt(1, MAX_DICE_COUNT), // intero 1..100: mirror della barriera AI su assertDieGroup del motore
  sides: llmInt(2, MAX_DICE_SIDES), // intero 2..1000: idem (un count/sides allucinato e ARGOMENTI NON VALIDI, non un freeze)
});

const startQuestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
});

const advanceQuestSchema = z.object({
  questId: z.string().min(1),
  status: z.enum(QUEST_OUTCOMES), // enum auto-validante: l AI dichiara l esito, non puo' inventarlo
});

const endTurnSchema = z.object({});
const nextRoundSchema = z.object({});

const enterPhaseSchema = z.object({
  to: z.enum(SOFT_PHASES), // enum auto-validante: niente combat, niente fasi inventate
});
const endEncounterSchema = z.object({});

// --- registro: ogni voce e gia type-erased ma costruita su uno schema concreto ---

interface ToolEntry {
  description: string;
  jsonSchema: Record<string, unknown>;
  commandType: Command['type'];
  resolve(json: unknown): { ok: true; command: Command } | { ok: false; error: string };
}

function issuesOf(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

// Cattura lo schema concreto S e ne deriva il tipo di OUTPUT con z.infer; il registro resta
// omogeneo (Record<string,ToolEntry>). Vincolare su S (non su z.ZodType<A>) e necessario per gli
// schemi con input/output divergenti come llmNumber (z.preprocess: input unknown, output number):
// z.ZodType<A> forzerebbe input=output=A e degraderebbe l output a unknown.
// T (inferito dal literal commandType) lega il commandType al tipo prodotto da toCommand via
// Extract<Command, {type:T}>: un commandType che non combacia col Command ritornato e un errore di
// compilazione (niente divergenza silenziosa fra il tag usato per il filtro di fase e l intento).
function makeEntry<S extends z.ZodTypeAny, T extends Command['type']>(
  description: string,
  commandType: T,
  schema: S,
  toCommand: (args: z.infer<S>) => Extract<Command, { type: T }>,
): ToolEntry {
  return {
    description,
    commandType,
    jsonSchema: zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>,
    resolve(json) {
      const v = schema.safeParse(json);
      if (!v.success) return { ok: false, error: issuesOf(v.error) };
      return { ok: true, command: toCommand(v.data) };
    },
  };
}

// Costruisce il registro degli strumenti vincolando i campi di riferimento al vocabolario dato.
// I tre schemi vocab-dipendenti (attackSchema, requestCheckSchema, applyEffectSchema) vivono
// DENTRO questa funzione perche dipendono da enumOrString(vocab.X). Tutti gli altri schemi
// sono module-level (vocab-indipendenti) e restano immutati.
function buildTools(vocab: Vocabulary): Record<string, ToolEntry> {
  const attackSchema = z.object({
    attackerId: z.string().min(1),
    targetId: z.string().min(1),
    attribute: enumOrString(vocab.attributes).optional(),
    skill: enumOrString(vocab.skills).optional(),
    defense: enumOrString(vocab.defenses),
    defenseBase: llmNumber,
    damageResource: enumOrString(vocab.resources),
  });

  const requestCheckSchema = z.object({
    actorId: z.string().min(1),
    attribute: enumOrString(vocab.attributes).optional(),
    skill: enumOrString(vocab.skills).optional(),
    difficulty: z.enum(DIFFICULTIES),
  });

  const applyEffectSchema = z.object({
    targetId: z.string().min(1),
    resource: enumOrString(vocab.resources),
    direction: z.enum(['restore', 'drain']), // enum auto-validante: l AI dichiara l intento, non il segno
    dice: llmArray(z.array(dieGroupArgSchema).min(1)), // G6: accetta anche un array stringificato
    bonus: llmNumber.optional(), // G1: accetta "2" oltre a 2
  });

  return {
    spawn_npc: makeEntry(
      'Crea e aggiunge un nuovo PNG al mondo (diventa canone). Usa id univoci.',
      'AddActor',
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
      'RequestCheck',
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
      'ApplyEffect',
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
    start_quest: makeEntry(
      'Avvia una nuova quest (obiettivo del giocatore). Usa id univoci. description e lo statement dell obiettivo.',
      'StartQuest',
      startQuestSchema,
      (a) => ({
        type: 'StartQuest',
        id: a.id,
        title: a.title,
        ...(a.description !== undefined ? { description: a.description } : {}),
      }),
    ),
    advance_quest: makeEntry(
      'Porta una quest esistente al suo esito: completed (riuscita) o failed (fallita). Il motore rifiuta una quest inesistente o gia terminata.',
      'AdvanceQuest',
      advanceQuestSchema,
      (a) => ({ type: 'AdvanceQuest', questId: a.questId, status: a.status }),
    ),
    attack: makeEntry(
      'Dichiara un attacco: il motore tira la prova e applica il danno in modo deterministico.',
      'Attack',
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
      'StartEncounter',
      startEncounterSchema,
      (a) => ({ type: 'StartEncounter', encounterId: a.encounterId, participants: a.participants }),
    ),
    end_turn: makeEntry('Termina il turno corrente nello scontro attivo.', 'EndTurn', endTurnSchema, () => ({ type: 'EndTurn' })),
    next_round: makeEntry('Avanza al round successivo dello scontro attivo.', 'NextRound', nextRoundSchema, () => ({
      type: 'NextRound',
    })),
    enter_phase: makeEntry(
      'Cambia la fase narrativa di gioco: exploration (esplorazione), dialogue (dialogo) o downtime (tempo libero). Per iniziare un combattimento usa invece start_encounter.',
      'EnterPhase',
      enterPhaseSchema,
      (a) => ({ type: 'EnterPhase', to: a.to }),
    ),
    end_encounter: makeEntry(
      'Termina lo scontro attivo e torna alla fase di esplorazione. Usalo quando il combattimento e risolto.',
      'EndEncounter',
      endEncounterSchema,
      () => ({ type: 'EndEncounter' }),
    ),
  };
}

export type ToolResolution =
  | { ok: true; toolName: string; command: Command }
  | { ok: false; toolName: string; error: string };

/** Definizioni degli strumenti ABILITATI nella fase corrente: consuma lo stesso
 *  isCommandLegalInPhase dell engine (single source of truth, niente mappa duplicata). */
export function masterToolDefs(phase: Phase, vocabulary: Vocabulary): LlmToolDef[] {
  const tools = buildTools(vocabulary);
  return Object.entries(tools)
    .filter(([, t]) => isCommandLegalInPhase(phase, t.commandType))
    .map(([name, t]) => ({ name, description: t.description, parameters: t.jsonSchema }));
}

/** Parsa+valida gli argomenti grezzi di una tool-call e li mappa a un Command, oppure spiega l errore. */
export function resolveToolCall(name: string, rawArgs: string, vocabulary: Vocabulary): ToolResolution {
  const tools = buildTools(vocabulary);
  const tool = tools[name];
  if (tool === undefined) return { ok: false, toolName: name, error: `strumento sconosciuto: ${name}` };
  const parsed = parseJson(rawArgs);
  if (!parsed.ok) return { ok: false, toolName: name, error: parsed.error };
  const r = tool.resolve(parsed.json);
  if (!r.ok) return { ok: false, toolName: name, error: r.error };
  return { ok: true, toolName: name, command: r.command };
}
