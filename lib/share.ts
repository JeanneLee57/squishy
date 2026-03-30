import { MaterialId } from "./materials";
import { ColorId } from "./colors";

export function buildShareUrl(material: MaterialId, color: ColorId): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("m", material);
  url.searchParams.set("c", color);
  return url.toString();
}

export function parseShareParams(): {
  material: MaterialId | null;
  color: ColorId | null;
} {
  if (typeof window === "undefined") return { material: null, color: null };
  const params = new URLSearchParams(window.location.search);
  const validMaterials: MaterialId[] = ["jelly", "mochi", "slime", "balloon"];
  const validColors: ColorId[] = ["pink", "blue", "green", "yellow", "purple", "random"];
  const m = params.get("m") as MaterialId;
  const c = params.get("c") as ColorId;
  return {
    material: validMaterials.includes(m) ? m : null,
    color: validColors.includes(c) ? c : null,
  };
}
