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
      : o,
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

/** Schema Zod dell unione DomainEvent del motore. Unica fonte di validazione al confine
 *  di persistenza (spec 4/12). */
export const domainEventSchema = z.discriminatedUnion('type', [
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
]);

/** Schema Zod di GameState, per validare gli snapshot persistiti. */
export const gameStateSchema = z.object({
  version: z.number(),
  actors: z.record(z.string(), actorSchema),
  encounter: encounterSchema.nullable(),
});
