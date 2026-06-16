// Indirezione app-side: il CampaignService lega model+structured alla costruzione (9c-i), ma il
// provider AI si configura a RUNTIME (canale set-provider). Il holder espone un LanguageModel e uno
// StructuredOutputPort STABILI che delegano al provider corrente -> set-provider riconfigura senza
// ricostruire il service e SENZA modificare @loomn/host. Finche nessun provider e configurato,
// model/structured falliscono con un errore chiaro -> i handler runTurn/reflect lo traducono in {ok:false}.
import type { LanguageProvider } from '@loomn/host';
import type {
  LanguageModel,
  LlmRequest,
  LlmStreamEvent,
  StructuredOutputPort,
  StructuredOutputRequest,
  StructuredOutputResult,
} from '@loomn/ai';

export interface ProviderHolder {
  /** LanguageModel stabile (per runMasterTurn): delega al provider corrente. */
  model: LanguageModel;
  /** StructuredOutputPort stabile (per la Reflection): delega al provider corrente. */
  structured: StructuredOutputPort;
  /** Sostituisce il provider corrente (set-provider). */
  configure(provider: LanguageProvider): void;
  /** True se un provider e stato configurato. */
  isConfigured(): boolean;
}

const NO_PROVIDER = 'provider AI non configurato';

export function createProviderHolder(): ProviderHolder {
  let current: LanguageProvider | undefined;

  const model: LanguageModel = {
    id: 'loomn-delegating',
    stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
      if (current === undefined) throw new Error(NO_PROVIDER);
      return current.model.stream(request);
    },
  };

  const structured: StructuredOutputPort = {
    generate<T>(request: StructuredOutputRequest<T>): Promise<StructuredOutputResult<T>> {
      if (current === undefined) return Promise.reject(new Error(NO_PROVIDER));
      return current.structured.generate(request);
    },
  };

  return {
    model,
    structured,
    configure(provider: LanguageProvider): void {
      current = provider;
    },
    isConfigured(): boolean {
      return current !== undefined;
    },
  };
}
