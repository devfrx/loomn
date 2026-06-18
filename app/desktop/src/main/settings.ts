// Persistenza della config provider in userData/settings.json. La chiave API NON e mai in chiaro su
// disco: safeStorage (OS keychain, spec 4) la cifra; salviamo il ciphertext base64. La decifratura
// avviene solo nel main (processo fidato). LM Studio locale non ha chiave -> apiKey assente. La
// lettura rivalida con providerConfigSchema (spec 4: non fidarsi di JSON esterni).
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { providerConfigSchema, type ProviderConfig } from '@loomn/shared';
import { resolveStoredKey } from './provider-config';

interface StoredSettings {
  baseUrl: string;
  model: string;
  /** Ciphertext base64 della chiave (safeStorage). Assente se nessuna chiave. */
  apiKeyEnc?: string;
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

/** Salva la config provider. La chiave e tri-stato (resolveStoredKey): campo vuoto -> mantieni la
 *  esistente; '' -> rimuovi; stringa -> cifra e sostituisci (safeStorage). */
export function saveProviderConfig(config: ProviderConfig): void {
  if (config.apiKey !== undefined && config.apiKey !== '' && !safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage non disponibile: impossibile cifrare la chiave API');
  }
  const prior = readStored(settingsPath());
  const apiKeyEnc = resolveStoredKey(config.apiKey, prior?.apiKeyEnc, (plain) =>
    safeStorage.encryptString(plain).toString('base64'),
  );
  const stored: StoredSettings = { baseUrl: config.baseUrl, model: config.model };
  if (apiKeyEnc !== undefined) stored.apiKeyEnc = apiKeyEnc;
  writeFileSync(settingsPath(), JSON.stringify(stored), 'utf8');
}

function readStored(path: string): StoredSettings | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const baseUrl = obj['baseUrl'];
  const model = obj['model'];
  if (typeof baseUrl !== 'string' || typeof model !== 'string') return undefined;
  const stored: StoredSettings = { baseUrl, model };
  const apiKeyEnc = obj['apiKeyEnc'];
  if (typeof apiKeyEnc === 'string') stored.apiKeyEnc = apiKeyEnc;
  return stored;
}

/** Rilegge la config provider; decifra la chiave. undefined se assente o illeggibile. */
export function loadProviderConfig(): ProviderConfig | undefined {
  const path = settingsPath();
  if (!existsSync(path)) return undefined;
  const stored = readStored(path);
  if (stored === undefined) return undefined;
  const config: ProviderConfig = { baseUrl: stored.baseUrl, model: stored.model };
  if (stored.apiKeyEnc !== undefined && safeStorage.isEncryptionAvailable()) {
    config.apiKey = safeStorage.decryptString(Buffer.from(stored.apiKeyEnc, 'base64'));
  }
  const result = providerConfigSchema.safeParse(config);
  return result.success ? result.data : undefined;
}

/** Metadata della config persistita SENZA decifrare la chiave (hasApiKey = ciphertext presente).
 *  Usato da get-status per il read-back: la chiave non viene mai decifrata ne esposta. */
export interface ProviderMeta {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export function loadProviderMeta(): ProviderMeta | undefined {
  const path = settingsPath();
  if (!existsSync(path)) return undefined;
  const stored = readStored(path);
  if (stored === undefined) return undefined;
  return { baseUrl: stored.baseUrl, model: stored.model, hasApiKey: stored.apiKeyEnc !== undefined };
}
