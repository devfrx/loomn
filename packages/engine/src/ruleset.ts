// Ruleset iniettato (spec 5.3): (state, cmd, rng, ruleset) -> DomainEvent[]. Contiene il
// vocabolario di gioco (dati di modulo) e la prima regola comportamentale (dcForDifficulty,
// migrata da SP1). E config STATICA di modulo, NON play-state -> iniettata, mai event-sourced.
// Il motore definisce solo il TIPO e le factory; il vocabolario concreto e dato (host/Piano 11).
import type { ResourcePool } from './actor';
import { dcForDifficulty as defaultDcForDifficulty, type Difficulty } from './difficulty';

export interface Vocabulary {
  attributes: ReadonlySet<string>;
  skills: ReadonlySet<string>;
  resources: ReadonlySet<string>;
  defenses: ReadonlySet<string>;
  /** Template combat-ready applicato da decide(AddActor). Chiavi sottoinsieme di resources
   *  (invariante imposta dal factory). Record (non Map): l auto-fill e uno spread con actor.resources. */
  defaultResources: Readonly<Record<string, ResourcePool>>;
}

export interface Ruleset {
  vocabulary: Vocabulary;
  dcForDifficulty: (d: Difficulty) => number;
}

export interface VocabularyInput {
  attributes: string[];
  skills: string[];
  resources: string[];
  defenses: string[];
  defaultResources?: Record<string, ResourcePool>;
}

/** Costruisce un Vocabulary: array in ingresso -> Set per membership O(1). Valida
 *  l invariante defaultResources.keys sottoinsieme di resources. */
export function createVocabulary(input: VocabularyInput): Vocabulary {
  const resources = new Set(input.resources);
  const defaultResources = input.defaultResources ?? {};
  for (const k of Object.keys(defaultResources)) {
    if (!resources.has(k)) {
      throw new Error(`defaultResources contiene una risorsa non dichiarata: ${k}`);
    }
  }
  return {
    attributes: new Set(input.attributes),
    skills: new Set(input.skills),
    resources,
    defenses: new Set(input.defenses),
    defaultResources,
  };
}

/** Assembla un Ruleset; dcForDifficulty default = la funzione del motore (SP1, ora referenziata qui). */
export function createRuleset(input: { vocabulary: Vocabulary; dcForDifficulty?: (d: Difficulty) => number }): Ruleset {
  return {
    vocabulary: input.vocabulary,
    dcForDifficulty: input.dcForDifficulty ?? defaultDcForDifficulty,
  };
}
