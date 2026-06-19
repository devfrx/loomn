import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CanonFactDto, SummaryDto } from '@loomn/shared';
import { reflectMessage } from '../lib/journal-view';

/** Store read-side della memoria narrativa persistente: riassunti L2 (getSummaries) + canon L1.5
 *  (getCanon) + il trigger Reflection (reflect). Consumato dal Diario (vista piena) e dalla Compagnia
 *  (canon filtrato per attore = relazioni display-only). NON e fetch-once: reflect aggiunge voci →
 *  load() rifa la fetch. La cronologia narrazione vive nello store narration (riuso, non qui). */
export const useJournalStore = defineStore('journal', () => {
  const summaries = ref<SummaryDto[]>([]);
  const canon = ref<CanonFactDto[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const reflecting = ref(false);
  const reflectInfo = ref<string | null>(null);

  /** Carica riassunti L2 + canon in parallelo. Ogni canale ha il suo esito tipizzato; su un esito non
   *  ok imposta error e lascia invariato l elenco gia presente per quel canale. */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [s, c] = await Promise.all([window.loomn.getSummaries({}), window.loomn.getCanon({})]);
      if (s.ok) summaries.value = s.summaries;
      else error.value = s.error;
      if (c.ok) canon.value = c.facts;
      else error.value = c.error;
    } finally {
      loading.value = false;
    }
  }

  /** Trigger della Reflection sullo scope dato (etichetta dei riassunti, vedi campaign-service.ts).
   *  Su successo ricarica riassunti+canon (la Reflection puo aggiungere voci) e pubblica un messaggio
   *  leggibile; su fallimento pubblica l errore e NON ricarica. */
  async function runReflect(scope: string): Promise<void> {
    reflecting.value = true;
    reflectInfo.value = null;
    try {
      const res = await window.loomn.reflect({ scope });
      reflectInfo.value = reflectMessage(res);
      if (res.ok) await load();
    } finally {
      reflecting.value = false;
    }
  }

  return { summaries, canon, loading, error, reflecting, reflectInfo, load, runReflect };
});
