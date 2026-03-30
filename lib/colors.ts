export type ColorId = "pink" | "blue" | "green" | "yellow" | "purple" | "random";

export interface ColorPreset {
  id: ColorId;
  label: string;
  fill: string;       // Main blob color
  highlight: string;  // Lighter specular
  shadow: string;     // Darker inner shadow
  swatch: string;     // CSS for the color swatch circle
}

export const COLORS: Record<ColorId, ColorPreset> = {
  pink: {
    id: "pink",
    label: "핑크",
    fill: "#F4C0D1",
    highlight: "#FDE8EF",
    shadow: "#ED93B1",
    swatch: "#F4C0D1",
  },
  blue: {
    id: "blue",
    label: "블루",
    fill: "#B5D4F4",
    highlight: "#DEEEFB",
    shadow: "#7AB5EC",
    swatch: "#B5D4F4",
  },
  green: {
    id: "green",
    label: "그린",
    fill: "#C0DD97",
    highlight: "#E1EFCC",
    shadow: "#8DC052",
    swatch: "#C0DD97",
  },
  yellow: {
    id: "yellow",
    label: "옐로",
    fill: "#FAC775",
    highlight: "#FDE7BF",
    shadow: "#F0A030",
    swatch: "#FAC775",
  },
  purple: {
    id: "purple",
    label: "퍼플",
    fill: "#AFA9EC",
    highlight: "#D8D5F7",
    shadow: "#7A70DF",
    swatch: "#AFA9EC",
  },
  random: {
    id: "random",
    label: "랜덤",
    fill: "#F09595",
    highlight: "#F8CCCC",
    shadow: "#E06060",
    swatch: "linear-gradient(135deg, #F09595, #85B7EB, #C0DD97)",
  },
};

const COLOR_LIST: ColorId[] = ["pink", "blue", "green", "yellow", "purple"];

export function getDailyColor(date: Date): ColorPreset {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );
  return COLORS[COLOR_LIST[dayOfYear % COLOR_LIST.length]];
}
