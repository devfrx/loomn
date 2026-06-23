import { z } from 'zod';

/** Numero finito: rifiuta Infinity/-Infinity (e NaN, gia rifiutato da z.number()). I campi
 *  numerici di eventi/stato/comandi NON sono mai legittimamente non-finiti; un non-finito al
 *  confine corromperebbe lo stream (JSON.stringify(Infinity) === 'null' -> reparse fallisce). */
const finiteNumber = z.number().finite();

// I .transform() sui campi opzionali (tag, appliesTo) eliminano il `| undefined` che
// z.optional() introdurrebbe, rendendo i tipi inferiti assegnabili 1:1 ai tipi engine
// sotto exactOptionalPropertyTypes (verificato: nessun cast necessario).

const rollModeSchema = z.union([z.literal('check'), z.literal('effect')]);

// Rispecchiano MAX_DICE_COUNT/MAX_DICE_SIDES di @loomn/engine (shared e FOGLIA, non importa engine).
// Usati SOLO da dieGroupCommandSchema (difesa-in-profondita al confine IPC del comando ApplyEffect).
const MAX_DICE_COUNT = 100;
const MAX_DICE_SIDES = 1000;

// Variante di LETTURA (permissiva): usata da itemEffectSchema -> actorSchema -> domainEventSchema /
// gameStateSchema (percorso di persistenza, riparsato a ogni load/replay). NON porta i bound dei dadi:
// rifiuterebbe item storici con dadi fuori-range (debt-free: mai restringere lo schema di lettura).
// L arbitro autorevole e rollExpression/assertDieGroup nel motore, al momento del tiro.
const dieGroupSchema = z
  .object({
    count: finiteNumber,
    sides: finiteNumber,
    tag: z.string().optional(),
  })
  .transform((o) =>
    o.tag === undefined
      ? { count: o.count, sides: o.sides }
      : { count: o.count, sides: o.sides, tag: o.tag },
  );

// Variante di COMANDO (difesa-in-profondita al confine IPC): bound che rispecchiano MAX_DICE_COUNT/
// MAX_DICE_SIDES di @loomn/engine. Usata SOLO da applyEffectCommandSchema (dadi diretti del comando
// ApplyEffect, input non fidato). NON sul percorso di lettura. L arbitro resta rollExpression nel motore.
const dieGroupCommandSchema = z
  .object({
    count: finiteNumber.int().min(1).max(MAX_DICE_COUNT),
    sides: finiteNumber.int().min(2).max(MAX_DICE_SIDES),
    tag: z.string().optional(),
  })
  .transform((o) =>
    o.tag === undefined
      ? { count: o.count, sides: o.sides }
      : { count: o.count, sides: o.sides, tag: o.tag },
  );

const dieResultSchema = z
  .object({ sides: finiteNumber, value: finiteNumber, tag: z.string().optional() })
  .transform((o) =>
    o.tag === undefined
      ? { sides: o.sides, value: o.value }
      : { sides: o.sides, value: o.value, tag: o.tag },
  );

const rollResultFields = {
  dice: z.array(dieResultSchema),
  modifierTotal: finiteNumber,
  total: finiteNumber,
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
  dc: finiteNumber,
  margin: finiteNumber,
  outcome: outcomeSchema,
});

const resourcePoolSchema = z.object({ current: finiteNumber, max: finiteNumber });

const conditionEffectSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('checkModifier'), value: finiteNumber, appliesTo: z.string().optional() }),
    z.object({ kind: z.literal('resourcePerTurn'), resource: z.string(), delta: finiteNumber }),
  ])
  .transform((o) =>
    o.kind === 'checkModifier'
      ? o.appliesTo === undefined
        ? { kind: o.kind, value: o.value }
        : { kind: o.kind, value: o.value, appliesTo: o.appliesTo }
      : { kind: o.kind, resource: o.resource, delta: o.delta },
  );

const durationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turns'), remaining: finiteNumber }),
  z.object({ kind: z.literal('scenes'), remaining: finiteNumber }),
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
    z.object({ kind: z.literal('checkModifier'), value: finiteNumber, appliesTo: z.string().optional() }),
    z.object({ kind: z.literal('defenseModifier'), defense: z.string(), value: finiteNumber }),
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

const progressionSchema = z.object({ xp: finiteNumber, level: finiteNumber });

const actorKindSchema = z.union([z.literal('pc'), z.literal('npc')]);

const actorSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: actorKindSchema,
  attributes: z.record(z.string(), finiteNumber),
  skills: z.record(z.string(), finiteNumber),
  resources: z.record(z.string(), resourcePoolSchema),
  conditions: z.array(conditionSchema),
  items: z.array(itemSchema),
  progression: progressionSchema,
});

const participantSchema = z.object({
  actorId: z.string(),
  zone: z.string(),
  initiative: finiteNumber,
  actedThisRound: z.boolean(),
});

const encounterSchema = z.object({
  id: z.string(),
  participants: z.array(participantSchema),
  round: finiteNumber,
  turnIndex: finiteNumber,
});

// Enum statici di comando: shared e FOGLIA (non importa engine) -> rispecchia i const dell engine
// (DIFFICULTIES/SOFT_PHASES/QUEST_OUTCOMES/RESOURCE_DIRECTIONS di @loomn/engine). Esportati come const
// per i form GM del renderer (che importa SOLO @loomn/shared, mai engine). L allineamento engine<->shared
// e verificato a runtime in @loomn/host (drift guard, dove engine e shared coesistono); gli enum dentro
// eventi/stato hanno gia il guard di compile-time in sqlite-event-store. Gli schemi privati sotto
// derivano da questi const (single-source nel pacchetto).
export const DIFFICULTIES = ['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary'] as const;
export const SOFT_PHASES = ['exploration', 'dialogue', 'downtime'] as const;
export const QUEST_OUTCOMES = ['completed', 'failed'] as const;
export const RESOURCE_DIRECTIONS = ['restore', 'drain'] as const;

// difficulty: shared e FOGLIA (non importa engine) -> rispecchia i literal di Difficulty
// dell engine. Il drift guard bidirezionale (sqlite-event-store) verifica l allineamento 1:1.
const difficultySchema = z.enum(DIFFICULTIES);

// Stati delle quest: shared e FOGLIA (non importa engine) -> rispecchia i literal di QuestStatus/
// QuestOutcome. Il drift guard bidirezionale (sqlite-event-store) verifica l allineamento 1:1.
const questStatusSchema = z.enum(['active', 'completed', 'failed']);
const questOutcomeSchema = z.enum(QUEST_OUTCOMES);

// Fasi di gioco (§5.5): shared e FOGLIA (non importa engine) -> rispecchia i literal di Phase
// dell engine. Il drift guard bidirezionale (sqlite-event-store) verifica l allineamento 1:1.
const phaseSchema = z.enum(['exploration', 'dialogue', 'combat', 'downtime']);

// Fasi soft (§5.5): le uniche proponibili con EnterPhase (combat e modale, vi si entra con
// StartEncounter). shared e FOGLIA -> rispecchia i literal di SoftPhase dell engine.
const softPhaseSchema = z.enum(SOFT_PHASES);

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
  .strict()
  .transform((o) => ({
    type: o.type,
    actorId: o.actorId,
    difficulty: o.difficulty,
    result: o.result,
    ...(o.attribute !== undefined ? { attribute: o.attribute } : {}),
    ...(o.skill !== undefined ? { skill: o.skill } : {}),
  }));

// Permissivo (read/event path): NESSUN bound. I bound vivono su seedCampaignCommandSchema (Task successivo).
const campaignSettingSchema = z
  .object({
    place: z.string(),
    era: z.string(),
    genres: z.array(z.string()),
    worldRules: z.string().optional(),
  })
  .transform((s) => ({
    place: s.place,
    era: s.era,
    genres: s.genres,
    ...(s.worldRules !== undefined ? { worldRules: s.worldRules } : {}),
  }));

export const campaignFrameSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    premise: z.string(),
    setting: campaignSettingSchema,
    tone: z.string(),
    contentGuidance: z.string().optional(),
    openingScene: z.string(),
    hooks: z.array(z.string()),
  })
  .transform((f) => ({
    id: f.id,
    name: f.name,
    premise: f.premise,
    setting: f.setting,
    tone: f.tone,
    ...(f.contentGuidance !== undefined ? { contentGuidance: f.contentGuidance } : {}),
    openingScene: f.openingScene,
    hooks: f.hooks,
  }));

const campaignFramedEventSchema = z
  .object({ type: z.literal('CampaignFramed'), frame: campaignFrameSchema })
  .strict();

/** Schema Zod dell unione DomainEvent del motore. Unica fonte di validazione al confine
 *  di persistenza (spec 4/12). */
export const domainEventSchema = z.union([
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('ActorAdded'), actor: actorSchema }).strict(),
    z.object({ type: z.literal('EncounterStarted'), encounter: encounterSchema }).strict(),
    z.object({ type: z.literal('TurnEnded') }).strict(),
    z.object({ type: z.literal('RoundAdvanced') }).strict(),
    z
      .object({
        type: z.literal('AttackResolved'),
        attackerId: z.string(),
        targetId: z.string(),
        check: checkResultSchema,
        hit: z.boolean(),
      })
      .strict(),
    z.object({ type: z.literal('DamageApplied'), targetId: z.string(), resource: z.string(), amount: finiteNumber }).strict(),
    z.object({ type: z.literal('ActorDowned'), actorId: z.string() }).strict(),
    z.object({ type: z.literal('NarrationRecorded'), playerAction: z.string(), narration: z.string() }).strict(),
    z
      .object({
        type: z.literal('ResourceEffectApplied'),
        targetId: z.string(),
        resource: z.string(),
        delta: finiteNumber,
        // `roll` annidato NON e .strict() di proposito (solo l arm top-level lo e, M-01): rollResultFields
        // e condiviso con checkResultSchema -> renderlo strict restringerebbe un percorso di lettura piu
        // ampio, rischiando di rifiutare dati storici (lezione F1). Non strictarlo.
        roll: z.object({ ...rollResultFields }),
      })
      .strict(),
    z.object({ type: z.literal('QuestStarted'), quest: questSchema }).strict(),
    z.object({ type: z.literal('QuestAdvanced'), questId: z.string(), status: questOutcomeSchema }).strict(),
    z.object({ type: z.literal('PhaseChanged'), from: phaseSchema, to: phaseSchema }).strict(),
    z.object({ type: z.literal('EncounterEnded'), encounterId: z.string() }).strict(),
  ]),
  checkResolvedEventSchema,
  campaignFramedEventSchema,
]);

/** Schema Zod di GameState, per validare gli snapshot persistiti. */
export const gameStateSchema = z
  .object({
    version: finiteNumber,
    actors: z.record(z.string(), actorSchema),
    encounter: encounterSchema.nullable(),
    quests: z.record(z.string(), questSchema),
    phase: phaseSchema,
    campaignFrame: campaignFrameSchema.optional(),
  })
  .transform((s) => ({
    version: s.version,
    actors: s.actors,
    encounter: s.encounter,
    quests: s.quests,
    phase: s.phase,
    ...(s.campaignFrame !== undefined ? { campaignFrame: s.campaignFrame } : {}),
  }));

// --- Command (intenzione, spec 5.1): schema Zod del payload IPC non fidato (renderer->main, spec 4).
// Riusa i building block del motore (actorSchema, ...). z.union e NON z.discriminatedUnion perche
// la variante Attack usa .transform() per i campi opzionali cast-free (exactOptionalPropertyTypes):
// discriminatedUnion accetta solo membri ZodObject, non i ZodEffects prodotti da .transform().

// Modifier del motore (dice.ts): { value, source }.
const modifierSchema = z.object({ value: finiteNumber, source: z.string() });

const participantInputSchema = z.object({
  actorId: z.string(),
  zone: z.string(),
  initiative: finiteNumber,
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
    defenseBase: finiteNumber,
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

// I 3 Command con opzionali (RequestCheck/ApplyEffect/StartQuest) usano .transform() per OMETTERE
// gli opzionali assenti -> tipo inferito assegnabile 1:1 a Command sotto exactOptionalPropertyTypes
// (pattern di attackCommandSchema). z.union accetta i ZodEffects del transform. Le difficolta/esiti/
// fasi sono enum auto-validanti (l untrusted renderer non puo emettere un valore fuori vocabolario).

const requestCheckCommandSchema = z
  .object({
    type: z.literal('RequestCheck'),
    actorId: z.string(),
    attribute: z.string().optional(),
    skill: z.string().optional(),
    difficulty: difficultySchema,
  })
  .transform((o) => ({
    type: o.type,
    actorId: o.actorId,
    difficulty: o.difficulty,
    ...(o.attribute !== undefined ? { attribute: o.attribute } : {}),
    ...(o.skill !== undefined ? { skill: o.skill } : {}),
  }));

const applyEffectCommandSchema = z
  .object({
    type: z.literal('ApplyEffect'),
    targetId: z.string(),
    resource: z.string(),
    direction: z.enum(RESOURCE_DIRECTIONS),
    dice: z.array(dieGroupCommandSchema),
    bonus: finiteNumber.optional(),
  })
  .transform((o) => ({
    type: o.type,
    targetId: o.targetId,
    resource: o.resource,
    direction: o.direction,
    dice: o.dice,
    ...(o.bonus !== undefined ? { bonus: o.bonus } : {}),
  }));

const startQuestCommandSchema = z
  .object({
    type: z.literal('StartQuest'),
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
  })
  .transform((o) => ({
    type: o.type,
    id: o.id,
    title: o.title,
    ...(o.description !== undefined ? { description: o.description } : {}),
  }));

// SeedCampaign: schemi con bounds (difesa-in-profondita al confine IPC). La cornice usa
// campaignFrameSchema permissivo (Task 1). Gli opzionali attributes/skills/resources del SeedNpc
// usano .transform() per OMETTERE le chiavi assenti -> tipo inferito assegnabile 1:1 a SeedNpc
// sotto exactOptionalPropertyTypes (pattern di attackCommandSchema/requestCheckCommandSchema).
const seedNpcCommandSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    attributes: z.record(z.string(), finiteNumber).optional(),
    skills: z.record(z.string(), finiteNumber).optional(),
    resources: z.record(z.string(), resourcePoolSchema).optional(),
  })
  .transform((o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    ...(o.attributes !== undefined ? { attributes: o.attributes } : {}),
    ...(o.skills !== undefined ? { skills: o.skills } : {}),
    ...(o.resources !== undefined ? { resources: o.resources } : {}),
  }));

const seedPlaceCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
});

const seedFactCommandSchema = z.object({
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string(),
});

/** Gate di confine IPC del CampaignSeed (estratto da seedCampaignCommandSchema; behaviour-preserving).
 *  Bound ammessi (riusa i componenti gia bounded come seedNpcCommandSchema con finiteNumber): e un
 *  confine, NON un read-path di replay. Usato dai canali generate-seed/seed-campaign (D-01c). */
export const campaignSeedSchema = z.object({
  frame: campaignFrameSchema,
  keyNpcs: z.array(seedNpcCommandSchema),
  keyPlaces: z.array(seedPlaceCommandSchema),
  initialFacts: z.array(seedFactCommandSchema),
});

const seedCampaignCommandSchema = z.object({
  type: z.literal('SeedCampaign'),
  seed: campaignSeedSchema,
});

/** Brief di campagna al confine IPC (D-01c): mirror Zod di CampaignBrief (@loomn/ai). Il .transform
 *  omette le chiavi opzionali assenti -> z.infer assegnabile a CampaignBrief (exactOptional). */
export const campaignBriefSchema = z
  .object({
    text: z.string().min(1),
    name: z.string().optional(),
    overrides: z
      .object({
        genres: z.array(z.string()).optional(),
        tone: z.string().optional(),
        npcCount: finiteNumber.int().nonnegative().optional(),
        contentGuidance: z.string().optional(),
      })
      .transform((o) => ({
        ...(o.genres !== undefined ? { genres: o.genres } : {}),
        ...(o.tone !== undefined ? { tone: o.tone } : {}),
        ...(o.npcCount !== undefined ? { npcCount: o.npcCount } : {}),
        ...(o.contentGuidance !== undefined ? { contentGuidance: o.contentGuidance } : {}),
      }))
      .optional(),
  })
  .transform((b) => ({
    text: b.text,
    ...(b.name !== undefined ? { name: b.name } : {}),
    ...(b.overrides !== undefined ? { overrides: b.overrides } : {}),
  }));

/** Schema Zod dell unione Command del motore (spec 5.1). Validazione del payload IPC non fidato
 *  (renderer->main, spec 4). L inferenza e cast-free assegnabile 1:1 a Command (provato in host). */
export const commandSchema = z.union([
  z.object({ type: z.literal('AddActor'), actor: actorSchema }),
  z.object({
    type: z.literal('StartEncounter'),
    encounterId: z.string(),
    participants: z.array(participantInputSchema).min(1),
  }),
  z.object({ type: z.literal('EndTurn') }),
  z.object({ type: z.literal('NextRound') }),
  attackCommandSchema,
  requestCheckCommandSchema,
  applyEffectCommandSchema,
  startQuestCommandSchema,
  z.object({ type: z.literal('AdvanceQuest'), questId: z.string(), status: questOutcomeSchema }),
  z.object({ type: z.literal('EnterPhase'), to: softPhaseSchema }),
  z.object({ type: z.literal('EndEncounter') }),
  seedCampaignCommandSchema,
]);
