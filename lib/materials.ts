export type MaterialId = "jelly" | "mochi" | "slime" | "balloon";

export interface Material {
  id: MaterialId;
  label: string;
  stiffness: number;
  damping: number;
  squishFactor: number;
  wobbliness: number;
  // 0 = no area conservation (slime stretches freely), 1 = full conservation
  volumeConservation: number;
  // max r = BASE_RADIUS * maxStretch
  maxStretch: number;
  hapticPress: number[];
  hapticPop: number[];
}

export const MATERIALS: Record<MaterialId, Material> = {
  jelly: {
    id: "jelly",
    label: "젤리",
    stiffness: 200,
    damping: 6,
    squishFactor: 2.8,
    wobbliness: 40,
    volumeConservation: 1.0,
    maxStretch: 1.25,
    hapticPress: [25],
    hapticPop: [30, 20, 30, 20, 60],
  },
  mochi: {
    id: "mochi",
    label: "모찌",
    stiffness: 55,
    damping: 20,
    squishFactor: 3.8,
    wobbliness: 8,
    volumeConservation: 0.8,
    maxStretch: 1.5,
    hapticPress: [40],
    hapticPop: [60, 30, 80],
  },
  slime: {
    id: "slime",
    label: "슬라임",
    stiffness: 18,
    damping: 28,
    squishFactor: 5.5,
    wobbliness: 4,
    volumeConservation: 0.04,
    maxStretch: 3.0,
    hapticPress: [60],
    hapticPop: [80, 40, 80, 40, 40],
  },
  balloon: {
    id: "balloon",
    label: "물풍선",
    stiffness: 380,
    damping: 4,
    squishFactor: 1.8,
    wobbliness: 70,
    volumeConservation: 1.0,
    maxStretch: 1.15,
    hapticPress: [15],
    hapticPop: [10, 10, 10, 10, 100],
  },
};
