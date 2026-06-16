// Persistenza della config provider in userData/settings.json. La chiave API NON e mai in chiaro su
// disco: safeStorage (OS keychain, spec 4) la cifra; salviamo il ciphertext base64. La decifratura
// avviene solo nel main (processo fidato). LM Studio locale non ha chiave -> apiKey assente. La
// lettura rivalida con providerConfigSchema (spec 4: non fidarsi di JSON esterni).
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { providerConfigSchema, type ProviderConfig } from '@loomn/shared';

interface StoredSettings {
  baseUrl: string;
  model: string;
  /** Ciphertext base64 della chiave (safeStorage). Assente se nessuna chiave. */
  apiKeyEnc?: string;
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

/** Salva la config provider; cifra la chiave con safeStorage se presente e disponibile. */
export function saveProviderConfig(config: ProviderConfig): void {
  const stored: StoredSettings = { baseUrl: config.baseUrl, model: config.model };
  if (config.apiKey !== undefined && config.apiKey !== '' && safeStorage.isEncryptionAvailable()) {
    stored.apiKeyEnc = safeStorage.encryptString(config.apiKey).toString('base64');
  }
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
  return providerConfigSchema.parse(config);
}
