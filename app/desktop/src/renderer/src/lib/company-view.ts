import type { ActorView } from '../stores/read-model';
import type { CanonFactDto } from '@loomn/shared';

/** Una risorsa nella carta compatta (current/max, senza barra: la barra piena e nella Scheda 10d). */
export interface CompanyResource {
  key: string;
  current: number;
  max: number;
}

/** Carta compatta di un attore per la Compagnia. */
export interface CompanyCard {
  id: string;
  name: string;
  kind: 'pc' | 'npc';
  level: number;
  xp: number;
  resources: CompanyResource[];
  conditionCount: number;
  itemCount: number;
}

/** Mappa un attore del read-model nella carta compatta della Compagnia. Pura. */
export function toCompanyCard(actor: ActorView): CompanyCard {
  return {
    id: actor.id,
    name: actor.name,
    kind: actor.kind,
    level: actor.progression.level,
    xp: actor.progression.xp,
    resources: Object.entries(actor.resources).map(([key, pool]) => ({
      key,
      current: pool.current,
      max: pool.max,
    })),
    conditionCount: actor.conditions.length,
    itemCount: actor.items.length,
  };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Fatti canon che coinvolgono l attore (relazioni DISPLAY-ONLY): match per nome (case-insensitive) o
 *  per id su subject/object. Falsi positivi possibili se il nome di un attore coincide con l id di un
 *  altro (slug collision); accettabile in display-only, le relazioni strutturate (spec §11, deferite)
 *  elimineranno l ambiguita. Pura. */
export function canonForActor(facts: readonly CanonFactDto[], actor: ActorView): CanonFactDto[] {
  const name = norm(actor.name);
  const id = actor.id;
  return facts.filter(
    (f) => norm(f.subject) === name || norm(f.object) === name || f.subject === id || f.object === id,
  );
}
