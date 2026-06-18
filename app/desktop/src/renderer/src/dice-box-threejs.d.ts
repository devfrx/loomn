// @3d-dice/dice-box-threejs non spedisce tipi. Shim minimo della superficie usata da DiceCanvas.
declare module '@3d-dice/dice-box-threejs' {
  export interface DiceBoxConfig {
    assetPath?: string;
    scale?: number;
    sounds?: boolean;
    theme_colorset?: string;
    theme_material?: string;
    baseScale?: number;
    gravity_multiplier?: number;
    strength?: number;
    onRollComplete?: (results: unknown) => void;
  }
  export default class DiceBox {
    constructor(selector: string, config?: DiceBoxConfig);
    initialize(): Promise<void>;
    roll(notation: string): Promise<unknown>;
    clear(): void;
  }
}
