import type { DispatchCommand } from '@loomn/shared';

// L Actor e la forma richiesta da AddActor (commandSchema): lo deriviamo dal Command per restare
// legati al contratto IPC, senza ridichiarare il tipo nel renderer.
type AddActorCommand = Extract<DispatchCommand, { type: 'AddActor' }>;
export type ActorInput = AddActorCommand['actor'];

export interface ActorFormState {
  name: string;
  kind: 'pc' | 'npc';
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, { current: number; max: number }>;
}

/** Id slug-based unico contro gli id gia presenti (AddActor lancia su id duplicato). */
export function buildActorId(name: string, existingIds: readonly string[]): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'attore';
  const taken = new Set(existingIds);
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/** Costruisce l Actor completo per dispatch(AddActor). conditions/items vuoti (inventario profondo
 *  e feature deferita); progressione di base. Le risorse mancanti le auto-fila il motore da
 *  defaultResources. */
export function buildActor(form: ActorFormState, existingIds: readonly string[]): ActorInput {
  return {
    id: buildActorId(form.name, existingIds),
    name: form.name.trim(),
    kind: form.kind,
    attributes: form.attributes,
    skills: form.skills,
    resources: form.resources,
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}
