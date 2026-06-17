// Seme DEV del vocabolario: un foglio fantasy minimale, stand-in finche non esiste il sistema di
// moduli (Piano 11), che sostituira la SORGENTE (modulo caricato) mantenendo questa forma. NON
// vive nel motore puro (niente vocabolario hardcoded, spec 11.6): host e l adapter di composizione.
import { createRuleset, createVocabulary, type Ruleset } from '@loomn/engine';

export const devRuleset: Ruleset = createRuleset({
  vocabulary: createVocabulary({
    attributes: ['forza', 'destrezza', 'costituzione', 'intelligenza', 'saggezza', 'carisma'],
    skills: ['atletica', 'furtivita', 'persuasione', 'intuito', 'arcano', 'percezione'],
    resources: ['hp', 'mana', 'stamina'],
    defenses: ['difesa', 'tempra', 'riflessi', 'volonta'],
    defaultResources: { hp: { current: 10, max: 10 } },
  }),
});
