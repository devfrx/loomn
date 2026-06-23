import type { ResourcePool } from './actor';

/** Cornice narrativa della campagna (sottoinsieme del CampaignSeed): cio che il Master legge.
 *  Event-sourced in GameState.campaignFrame (precedente: Quest porta gia title/description). */
export interface CampaignFrame {
  id: string;
  name: string;
  premise: string;
  setting: { place: string; era: string; genres: string[]; worldRules?: string };
  tone: string;
  contentGuidance?: string;
  openingScene: string;
  hooks: string[];
}

/** Un PNG seminato -> diventa un Actor via la logica di AddActor (auto-fill risorse dal Ruleset). */
export interface SeedNpc {
  id: string;
  name: string;
  description: string;
  attributes?: Record<string, number>;
  skills?: Record<string, number>;
  resources?: Record<string, ResourcePool>;
}

/** Un luogo seminato -> fatto canon (no topologia/movimento in D-01a). */
export interface SeedPlace {
  id: string;
  name: string;
  description: string;
}

/** Un fatto seminato -> riga del Canon Ledger (1:1). */
export interface SeedFact {
  subject: string;
  predicate: string;
  object: string;
}

/** L input di SeedCampaign: il frame + cio che semina lo stato/canon. */
export interface CampaignSeed {
  frame: CampaignFrame;
  keyNpcs: SeedNpc[];
  keyPlaces: SeedPlace[];
  initialFacts: SeedFact[];
}
