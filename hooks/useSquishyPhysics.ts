"use client";
import { useRef, useCallback, useEffect } from "react";
import { Material } from "@/lib/materials";
import { vibrate } from "@/lib/haptics";

export type Mode = "free" | "pop";

const NUM_POINTS = 24;
export const BASE_RADIUS = 80;
const REST_AREA = Math.PI * BASE_RADIUS * BASE_RADIUS;

function polygonArea(pts: { r: number; angle: number }[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const ax = Math.cos(a.angle) * a.r;
    const ay = Math.sin(a.angle) * a.r;
    const bx = Math.cos(b.angle) * b.r;
    const by = Math.sin(b.angle) * b.r;
    area += ax * by - bx * ay;
  }
  return Math.abs(area) / 2;
}

export interface BlobPoint {
  angle: number;
  r: number;
  vr: number;
  baseR: number;
}

export function useSquishyPhysics(material: Material, mode: Mode) {
  const pointsRef = useRef<BlobPoint[]>([]);
  const animFrameRef = useRef<number>(0);
  const popChargeRef = useRef(0);

  useEffect(() => {
    pointsRef.current = Array.from({ length: NUM_POINTS }, (_, i) => {
      const angle = (i / NUM_POINTS) * Math.PI * 2;
      const r = BASE_RADIUS + (Math.random() - 0.5) * 4;
      return { angle, r, vr: 0, baseR: r };
    });
  }, []);

  const computePath = useCallback((): string => {
    const pts = pointsRef.current;
    if (pts.length === 0) return "";
    const cart = pts.map((p) => ({
      x: Math.cos(p.angle) * p.r,
      y: Math.sin(p.angle) * p.r,
    }));
    const n = cart.length;
    let d = `M ${cart[0].x} ${cart[0].y} `;
    for (let i = 0; i < n; i++) {
      const curr = cart[i];
      const next = cart[(i + 1) % n];
      const prev = cart[(i - 1 + n) % n];
      const nextNext = cart[(i + 2) % n];
      const t = 0.3;
      d += `C ${curr.x + (next.x - prev.x) * t} ${curr.y + (next.y - prev.y) * t}, ${next.x - (nextNext.x - curr.x) * t} ${next.y - (nextNext.y - curr.y) * t}, ${next.x} ${next.y} `;
    }
    return d + "Z";
  }, []);

  const step = useCallback(() => {
    const pts = pointsRef.current;
    const { stiffness, damping } = material;
    const dt = 1 / 60;
    const n = pts.length;

    // Area conservation pressure
    const area = polygonArea(pts);
    const areaRatio = REST_AREA / Math.max(area, REST_AREA * 0.1);
    const pressureStrength = 60 * material.squishFactor * Math.max(0, areaRatio - 1);

    // Neighbor coupling snapshot
    const vrCopy = pts.map((p) => p.vr);

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const neighborInfluence =
        (vrCopy[(i - 1 + n) % n] + vrCopy[(i + 1) % n] - 2 * vrCopy[i]) * 0.12;
      const springForce = -stiffness * (p.r - p.baseR);
      const dampForce = -damping * p.vr;
      p.vr += (springForce + dampForce + pressureStrength + neighborInfluence) * dt;
      p.r += p.vr * dt;
      p.r = Math.max(p.r, BASE_RADIUS * 0.15);
    }
  }, [material]);

  // Press: push inward at contact angle
  const applyPress = useCallback(
    (localX: number, localY: number, force = 320) => {
      const pts = pointsRef.current;
      const pressAngle = Math.atan2(localY, localX);
      for (const p of pts) {
        let diff = p.angle - pressAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const influence = Math.exp((-diff * diff) / (2 * 1.1 * 1.1));
        p.vr -= force * influence * material.squishFactor;
      }
    },
    [material],
  );

  // Drag: elongate in movement direction
  const applyDrag = useCallback(
    (dx: number, dy: number) => {
      const pts = pointsRef.current;
      const mag = Math.sqrt(dx * dx + dy * dy);
      if (mag < 0.5) return;
      const impulse = Math.min(mag * 0.6, 80) * material.squishFactor;
      const nx = dx / mag;
      const ny = dy / mag;
      for (const p of pts) {
        const dot = Math.cos(p.angle) * nx + Math.sin(p.angle) * ny;
        p.vr += dot * impulse * 0.9;
      }
    },
    [material],
  );

  // Release: add velocity-scaled wobble — faster fling = bigger wobble
  const applyRelease = useCallback(
    (vx: number, vy: number) => {
      const pts = pointsRef.current;
      const speed = Math.sqrt(vx * vx + vy * vy);
      // Base wobble from material + bonus from fling speed (capped)
      const velocityBonus = Math.min(speed * 0.8, 60);
      const totalWobble = material.wobbliness + velocityBonus;

      // Fling direction adds directional stretch on release
      if (speed > 5) {
        applyDrag(vx * 0.3, vy * 0.3);
      }

      for (const p of pts) {
        p.vr += (Math.random() - 0.5) * totalWobble;
      }
    },
    [material, applyDrag],
  );

  // Pinch: squeeze all points inward (scale < 1) or push outward (scale > 1)
  const applyPinch = useCallback(
    (scaleDelta: number) => {
      const pts = pointsRef.current;
      // scaleDelta > 0: fingers spreading apart = push out
      // scaleDelta < 0: fingers pinching = push in
      const impulse = scaleDelta * 120 * material.squishFactor;
      for (const p of pts) {
        p.vr += impulse;
      }
    },
    [material],
  );

  // Pop charge tracking
  const addPopCharge = useCallback((dist: number) => {
    popChargeRef.current = Math.min(popChargeRef.current + dist * 0.005, 1);
  }, []);

  const consumePopCharge = useCallback((): boolean => {
    const charged = mode === "pop" && popChargeRef.current > 0.5;
    popChargeRef.current = 0;
    return charged;
  }, [mode]);

  const resetPopCharge = useCallback(() => {
    popChargeRef.current = 0;
  }, []);

  return {
    computePath,
    step,
    applyPress,
    applyDrag,
    applyRelease,
    applyPinch,
    addPopCharge,
    consumePopCharge,
    resetPopCharge,
    animFrameRef,
  };
}
