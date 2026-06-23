import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { GenerateSeedRequest, GenerateSeedResult, SeedCampaignResult } from '@loomn/shared';

/** La bozza editabile = il seed dell arm ok di generate-seed (z.infer di campaignSeedSchema). */
type Draft = Extract<GenerateSeedResult, { ok: true }>['seed'];

/** Stato del wizard di onboarding (D-01c). Chiama window.loomn.* direttamente (come journal/narration);
 *  i reject IPC sono avvolti in try/catch (garanzia "mai fallire in silenzio", come use-dispatch). */
export const useOnboardingStore = defineStore('onboarding', () => {
  const text = ref('');
  const name = ref('');
  const genres = ref('');
  const tone = ref('');
  const npcCount = ref<number | null>(null);
  const contentGuidance = ref('');
  const draft = ref<Draft | null>(null);
  const step = ref<'brief' | 'review' | 'opening'>('brief');
  const status = ref<'idle' | 'generating' | 'seeding'>('idle');
  const error = ref<string | null>(null);
  const opening = ref<string | null>(null);

  function buildBrief(): GenerateSeedRequest {
    const g = genres.value.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
    const overrides = {
      ...(g.length > 0 ? { genres: g } : {}),
      ...(tone.value.trim() !== '' ? { tone: tone.value.trim() } : {}),
      ...(typeof npcCount.value === 'number' && Number.isFinite(npcCount.value) ? { npcCount: npcCount.value } : {}),
      ...(contentGuidance.value.trim() !== '' ? { contentGuidance: contentGuidance.value.trim() } : {}),
    };
    return {
      text: text.value.trim(),
      ...(name.value.trim() !== '' ? { name: name.value.trim() } : {}),
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    };
  }

  async function generate(): Promise<void> {
    if (text.value.trim() === '' || status.value === 'generating') return;
    status.value = 'generating';
    error.value = null;
    try {
      const res = await window.loomn.generateSeed(buildBrief());
      if (res.ok) {
        draft.value = res.seed;
        step.value = 'review';
      } else {
        error.value = res.error;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      status.value = 'idle';
    }
  }

  async function confirm(): Promise<void> {
    if (draft.value === null || status.value === 'seeding') return;
    status.value = 'seeding';
    error.value = null;
    // deep-plain: la bozza e un proxy reactive editato. Il round-trip JSON produce un plain object
    // (anti "An object could not be cloned") e omette gli undefined. Lo schema ri-valida al confine.
    const plainSeed = JSON.parse(JSON.stringify(draft.value)) as Draft;
    try {
      const res: SeedCampaignResult = await window.loomn.seedCampaign({ seed: plainSeed });
      if (res.ok) {
        opening.value = res.narration ?? null;
        step.value = 'opening';
      } else {
        error.value = res.error;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      status.value = 'idle';
    }
  }

  function regenerate(): void {
    step.value = 'brief';
  }

  return {
    text, name, genres, tone, npcCount, contentGuidance,
    draft, step, status, error, opening,
    buildBrief, generate, confirm, regenerate,
  };
});
