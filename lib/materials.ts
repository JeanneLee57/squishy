export type MaterialId = "jelly" | "mochi" | "slime" | "balloon";

export interface Material {
  id: MaterialId;
  label: string;
  // Spring physics — tuned so each material feels VERY different
  stiffness: number;    // Spring constant (higher = snappier)
  damping: number;      // Energy loss per frame (higher = no bounce)
  squishFactor: number; // Impulse multiplier on press (higher = more deformation)
  wobbliness: number;   // Extra random velocity on release
  // Haptic pattern for navigator.vibrate()
  hapticPress: number[];
  hapticPop: number[];
}

export const MATERIALS: Record<MaterialId, Material> = {
  // 젤리: 탱탱한 바운스. 눌리면 빠르게 복원되며 여러 번 진동
  jelly: {
    id: "jelly",
    label: "젤리",
    stiffness: 200,
    damping: 6,
    squishFactor: 2.8,
    wobbliness: 40,
    hapticPress: [25],
    hapticPop: [30, 20, 30, 20, 60],
  },
  // 모찌: 느리게 눌리고 끈적하게 복원. 바운스 최소화
  mochi: {
    id: "mochi",
    label: "모찌",
    stiffness: 55,
    damping: 20,
    squishFactor: 3.8,
    wobbliness: 8,
    hapticPress: [40],
    hapticPop: [60, 30, 80],
  },
  // 슬라임: 엄청나게 퍼지고 느릿느릿 돌아옴. 거의 안 바운스
  slime: {
    id: "slime",
    label: "슬라임",
    stiffness: 18,
    damping: 28,
    squishFactor: 5.5,
    wobbliness: 4,
    hapticPress: [60],
    hapticPop: [80, 40, 80, 40, 40],
  },
  // 물풍선: 빠르게 눌리고 팡! 하고 강한 바운스
  balloon: {
    id: "balloon",
    label: "물풍선",
    stiffness: 380,
    damping: 4,
    squishFactor: 1.8,
    wobbliness: 70,
    hapticPress: [15],
    hapticPop: [10, 10, 10, 10, 100],
  },
};
