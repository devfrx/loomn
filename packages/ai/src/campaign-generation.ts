// Generazione AI-da-brief del Campaign Seed (D-01b): brief -> RawSeed (LLM) -> CampaignSeed.
// L AI resta vocabulary-agnostica; il codice deriva ids e riempie le stat dal Ruleset.

import { z } from 'zod';
import type { CampaignSeed, CampaignFrame, SeedNpc, SeedPlace, SeedFact, Ruleset } from '@loomn/engine';

/** Slug deterministico per gli id: minuscolo, accenti rimossi, non-alfanumerici -> trattino. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Brief in ingresso (ibrido): testo libero + override opzionali. In-process, tipato (no Zod:
 *  il confine IPC con lo schema arriva in D-01c). */
export interface CampaignBrief {
  text: string;
  name?: string;
  overrides?: {
    genres?: string[];
    tone?: string;
    npcCount?: number;
    contentGuidance?: string;
  };
}

const TIERS = ['comune', 'esperto', 'eccezionale'] as const;
type Tier = (typeof TIERS)[number];

/** Output grezzo dell AI: gate di generazione (NON read-path, NON command). zodToJsonSchema lo usa
 *  per guidare l LLM. Transform-free: la trasformazione vive nel codice. */
export const rawSeedSchema = z.object({
  name: z.string().min(1),
  premise: z.string().min(1),
  setting: z.object({
    place: z.string(),
    era: z.string(),
    genres: z.array(z.string()),
    worldRules: z.string().optional(),
  }),
  tone: z.string(),
  openingScene: z.string(),
  hooks: z.array(z.string()),
  contentGuidance: z.string().optional(),
  npcs: z.array(z.object({ name: z.string().min(1), description: z.string(), tier: z.enum(TIERS) })),
  places: z.array(z.object({ name: z.string().min(1), description: z.string() })),
  facts: z.array(z.object({ subject: z.string(), predicate: z.string(), object: z.string() })),
});

export type RawSeed = z.infer<typeof rawSeedSchema>;

const TIER_VALUE: Record<Tier, number> = { comune: 1, esperto: 2, eccezionale: 3 };

/** Riempie un Record con ogni chiave del vocabolario al valore dato (chiavi sempre valide). */
function statsFromVocab(keys: ReadonlySet<string>, value: number): Record<string, number> {
  return Object.fromEntries([...keys].map((k) => [k, value]));
}

/** Genera id slug unici (dedup con suffisso -2, -3, ...). Fallback 'entita' per nomi senza alfanumerici. */
function makeUniquifier(): (name: string) => string {
  const used = new Set<string>();
  return (name: string) => {
    const base = slugify(name) || 'entita';
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    used.add(id);
    return id;
  };
}

/** Transform PURO raw -> CampaignSeed: deriva ids, mappa tier in stat dal Ruleset, fatti verbatim. */
export function rawToCampaignSeed(raw: RawSeed, ruleset: Ruleset, brief?: CampaignBrief): CampaignSeed {
  const uid = makeUniquifier();
  const vocab = ruleset.vocabulary;

  const keyNpcs: SeedNpc[] = raw.npcs.map((npc) => {
    const value = TIER_VALUE[npc.tier];
    return {
      id: uid(npc.name),
      name: npc.name,
      description: npc.description,
      attributes: statsFromVocab(vocab.attributes, value),
      skills: statsFromVocab(vocab.skills, value),
    };
  });

  const keyPlaces: SeedPlace[] = raw.places.map((p) => ({ id: uid(p.name), name: p.name, description: p.description }));

  const initialFacts: SeedFact[] = raw.facts.map((f) => ({ subject: f.subject, predicate: f.predicate, object: f.object }));

  const contentGuidance = brief?.overrides?.contentGuidance ?? raw.contentGuidance;
  const frame: CampaignFrame = {
    id: slugify(raw.name) || 'campagna',
    name: raw.name,
    premise: raw.premise,
    setting: {
      place: raw.setting.place,
      era: raw.setting.era,
      genres: raw.setting.genres,
      ...(raw.setting.worldRules !== undefined ? { worldRules: raw.setting.worldRules } : {}),
    },
    tone: raw.tone,
    openingScene: raw.openingScene,
    hooks: raw.hooks,
    ...(contentGuidance !== undefined ? { contentGuidance } : {}),
  };

  return { frame, keyNpcs, keyPlaces, initialFacts };
}
