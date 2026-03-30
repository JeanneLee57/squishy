import { MATERIALS, MaterialId } from "./materials";
import { COLORS, getDailyColor, ColorId } from "./colors";

const MATERIAL_LIST: MaterialId[] = ["jelly", "mochi", "slime", "balloon"];

export function getDailyMaterial(date: Date) {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );
  // Offset by 2 so material and color cycle independently
  return MATERIALS[MATERIAL_LIST[(dayOfYear + 2) % MATERIAL_LIST.length]];
}

export function getDailySquish(date: Date = new Date()) {
  return {
    material: getDailyMaterial(date),
    color: getDailyColor(date),
  };
}
