import { z } from 'zod';

// I .transform() sui campi opzionali (tag, appliesTo) eliminano il `| undefined` che
// z.optional() introdurrebbe, rendendo i tipi inferiti assegnabili 1:1 ai tipi engine
// sotto exactOptionalPropertyTypes (verificato: nessun cast necessario).

const rollModeSchema = z.union([z.literal('check'), z.literal('effect')]);

const dieGroupSchema = z
  .object({ count: z.number(), sides: z.number(), tag: z.string().optional() })
  .transform((o) =>
    o.tag === undefined
      ? { count: o.count, sides: o.sides }
      : { count: o.count, sides: o.sides, tag: o.tag },
  );

const dieResultSchema = z
  .object({ sides: z.number(), value: z.number(), tag: z.string().optional() })
  .transform((o) =>
    o.tag === undefined
      ? { sides: o.sides, value: o.value }
      : { sides: o.sides, value: o.value, tag: o.tag },
  );

const rollResultFields = {
  dice: z.array(dieResultSchema),
  modifierTotal: z.number(),
  total: z.number(),
  mode: rollModeSchema,
};

const outcomeSchema = z.union([
  z.literal('critical'),
  z.literal('success'),
  z.literal('success_at_cost'),
  z.literal('failure'),
  z.literal('disaster'),
]);

const checkResultSchema = z.object({
  ...rollResultFields,
  dc: z.number(),
  margin: z.number(),
  outcome: outcomeSchema,
});

const resourcePoolSchema = z.object({ current: z.number(), max: z.number() });

const conditionEffectSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('checkModifier'), value: z.number(), appliesTo: z.string().optional() }),
    z.object({ kind: z.literal('resourcePerTurn'), resource: z.string(), delta: z.number() }),
  ])
  .transform((o) =>
    o.kind === 'checkModifier'
      ? o.appliesTo === undefined
        ? { kind: o.kind, value: o.value }
        : { kind: o.kind, value: o.value, appliesTo: o.appliesTo }
      : { kind: o.kind, resource: o.resource, delta: o.delta },
  );

const durationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turns'), remaining: z.number() }),
  z.object({ kind: z.literal('scenes'), remaining: z.number() }),
  z.object({ kind: z.literal('permanent') }),
]);

const conditionSchema = z.object({
  key: z.string(),
  source: z.string(),
  effects: z.array(conditionEffectSchema),
  duration: durationSchema,
});

const itemEffectSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('contributeDice'), dice: z.array(dieGroupSchema), mode: rollModeSchema }),
    z.object({ kind: z.literal('checkModifier'), value: z.number(), appliesTo: z.string().optional() }),
    z.object({ kind: z.literal('defenseModifier'), defense: z.string(), value: z.number() }),
  ])
  .transform((o) =>
    o.kind === 'checkModifier'
      ? o.appliesTo === undefined
        ? { kind: o.kind, value: o.value }
        : { kind: o.kind, value: o.value, appliesTo: o.appliesTo }
      : // contributeDice/defenseModifier non hanno campi opzionali; o.dice e gia
        // trasformato da dieGroupSchema, quindi il passthrough produce il tipo esatto.
        o,
  );

const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  equipped: z.boolean(),
  effects: z.array(itemEffectSchema),
});

const progressionSchema = z.object({ xp: z.number(), level: z.number() });

const actorKindSchema = z.union([z.literal('pc'), z.literal('npc')]);

const actorSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: actorKindSchema,
  attributes: z.record(z.string(), z.number()),
  skills: z.record(z.string(), z.number()),
  resources: z.record(z.string(), resourcePoolSchema),
  conditions: z.array(conditionSchema),
  items: z.array(itemSchema),
  progression: progressionSchema,
});

const participantSchema = z.object({
  actorId: z.string(),
  zone: z.string(),
  initiative: z.number(),
  actedThisRound: z.boolean(),
});

const encounterSchema = z.object({
  id: z.string(),
  participants: z.array(participantSchema),
  round: z.number(),
  turnIndex: z.number(),
});

// difficulty: shared e FOGLIA (non importa engine) -> rispecchia i literal di Difficulty
// dell engine. Il drift guard bidirezionale (sqlite-event-store) verifica l allineamento 1:1.
const difficultySchema = z.enum(['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary']);

// Stati delle quest: shared e FOGLIA (non importa engine) -> rispecchia i literal di QuestStatus/
// QuestOutcome. Il drift guard bidirezionale (sqlite-event-store) verifica l allineamento 1:1.
const questStatusSchema = z.enum(['active', 'completed', 'failed']);
const questOutcomeSchema = z.enum(['completed', 'failed']);

// Fasi di gioco (§5.5): shared e FOGLIA (non importa engine) -> rispecchia i literal di Phase
// dell engine. Il drift guard bidirezionale (sqlite-event-store) verifica l allineamento 1:1.
const phaseSchema = z.enum(['exploration', 'dialogue', 'combat', 'downtime']);

// description opzionale: il .transform() la OMETTE quando assente, cosi il tipo inferito e
// assegnabile 1:1 a Quest sotto exactOptionalPropertyTypes (pattern di dieGroupSchema). La
// transform e NIDIFICATA dentro `quest`, quindi l evento QuestStarted resta un ZodObject e puo'
// stare nella discriminatedUnion (come actorSchema, che contiene transform annidate).
const questSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    status: questStatusSchema,
  })
  .transform((o) =>
    o.description === undefined
      ? { id: o.id, title: o.title, status: o.status }
      : { id: o.id, title: o.title, status: o.status, description: o.description },
  );

// CheckResolved ha campi opzionali TOP-LEVEL (attribute, skill): il .transform() li OMETTE
// quando assenti, cosi il tipo inferito e assegnabile 1:1 a DomainEvent sotto
// exactOptionalPropertyTypes. Ma .transform() produce un ZodEffects, e z.discriminatedUnion
// accetta solo ZodObject -> questa variante vive come arm separato di z.union (stesso motivo
// di commandSchema). Gli altri 8 eventi restano nella discriminatedUnion (errori precisi,
// comportamento invariato).
const checkResolvedEventSchema = z
  .object({
    type: z.literal('CheckResolved'),
    actorId: z.string(),
    attribute: z.string().optional(),
    skill: z.string().optional(),
    difficulty: difficultySchema,
    result: checkResultSchema,
  })
  .transform((o) => ({
    type: o.type,
    actorId: o.actorId,
    difficulty: o.difficulty,
    result: o.result,
    ...(o.attribute !== undefined ? { attribute: o.attribute } : {}),
    ...(o.skill !== undefined ? { skill: o.skill } : {}),
  }));

/** Schema Zod dell unione DomainEvent del motore. Unica fonte di validazione al confine
 *  di persistenza (spec 4/12). */
export const domainEventSchema = z.union([
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('ActorAdded'), actor: actorSchema }),
    z.object({ type: z.literal('EncounterStarted'), encounter: encounterSchema }),
    z.object({ type: z.literal('TurnEnded') }),
    z.object({ type: z.literal('RoundAdvanced') }),
    z.object({
      type: z.literal('AttackResolved'),
      attackerId: z.string(),
      targetId: z.string(),
      check: checkResultSchema,
      hit: z.boolean(),
    }),
    z.object({ type: z.literal('DamageApplied'), targetId: z.string(), resource: z.string(), amount: z.number() }),
    z.object({ type: z.literal('ActorDowned'), actorId: z.string() }),
    z.object({ type: z.literal('NarrationRecorded'), playerAction: z.string(), narration: z.string() }),
    z.object({
      type: z.literal('ResourceEffectApplied'),
      targetId: z.string(),
      resource: z.string(),
      delta: z.number(),
      roll: z.object({ ...rollResultFields }),
    }),
    z.object({ type: z.literal('QuestStarted'), quest: questSchema }),
    z.object({ type: z.literal('QuestAdvanced'), questId: z.string(), status: questOutcomeSchema }),
  ]),
  checkResolvedEventSchema,
]);

/** Schema Zod di GameState, per validare gli snapshot persistiti. */
export const gameStateSchema = z.object({
  version: z.number(),
  actors: z.record(z.string(), actorSchema),
  encounter: encounterSchema.nullable(),
  quests: z.record(z.string(), questSchema),
  phase: phaseSchema,
});

// --- Command (intenzione, spec 5.1): schema Zod del payload IPC non fidato (renderer->main, spec 4).
// Riusa i building block del motore (actorSchema, ...). z.union e NON z.discriminatedUnion perche
// la variante Attack usa .transform() per i campi opzionali cast-free (exactOptionalPropertyTypes):
// discriminatedUnion accetta solo membri ZodObject, non i ZodEffects prodotti da .transform().

// Modifier del motore (dice.ts): { value, source }.
const modifierSchema = z.object({ value: z.number(), source: z.string() });

const participantInputSchema = z.object({
  actorId: z.string(),
  zone: z.string(),
  initiative: z.number(),
});

// Attack ha 3 campi opzionali: il .transform() li OMETTE quando assenti, cosi il tipo inferito
// non porta `| undefined` ed e assegnabile 1:1 a Command.Attack sotto exactOptionalPropertyTypes.
const attackCommandSchema = z
  .object({
    type: z.literal('Attack'),
    attackerId: z.string(),
    targetId: z.string(),
    attribute: z.string().optional(),
    skill: z.string().optional(),
    defense: z.string(),
    defenseBase: z.number(),
    damageResource: z.string(),
    damageModifiers: z.array(modifierSchema).optional(),
  })
  .transform((o) => ({
    type: o.type,
    attackerId: o.attackerId,
    targetId: o.targetId,
    defense: o.defense,
    defenseBase: o.defenseBase,
    damageResource: o.damageResource,
    ...(o.attribute !== undefined ? { attribute: o.attribute } : {}),
    ...(o.skill !== undefined ? { skill: o.skill } : {}),
    ...(o.damageModifiers !== undefined ? { damageModifiers: o.damageModifiers } : {}),
  }));

/** Schema Zod dell unione Command del motore (spec 5.1). Validazione del payload IPC non fidato
 *  (renderer->main, spec 4). L inferenza e cast-free assegnabile 1:1 a Command (provato in host). */
export const commandSchema = z.union([
  z.object({ type: z.literal('AddActor'), actor: actorSchema }),
  z.object({
    type: z.literal('StartEncounter'),
    encounterId: z.string(),
    participants: z.array(participantInputSchema),
  }),
  z.object({ type: z.literal('EndTurn') }),
  z.object({ type: z.literal('NextRound') }),
  attackCommandSchema,
]);
