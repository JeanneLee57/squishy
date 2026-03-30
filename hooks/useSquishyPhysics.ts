"use client";
import { useRef, useCallback, useEffect } from "react";
import { Material } from "@/lib/materials";
import { vibrate } from "@/lib/haptics";

export type Mode = "free" | "pop";

const NUM_POINTS = 24;
export const BASE_RADIUS = 80;
const REST_AREA = Math.PI * BASE_RADIUS * BASE_RADIUS; // ~20106

// Polygon area via shoelace formula
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

const PRESS_IMPULSE = 320;

export function useSquishyPhysics(
  material: Material,
  mode: Mode,
  onPop: () => void,
  onPress: () => void,
  onStretch: () => void,
) {
  const pointsRef = useRef<BlobPoint[]>([]);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number>(0);
  const popChargeRef = useRef(0);
  const stretchRecordedRef = useRef(false);

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
      const cp1x = curr.x + (next.x - prev.x) * t;
      const cp1y = curr.y + (next.y - prev.y) * t;
      const cp2x = next.x - (nextNext.x - curr.x) * t;
      const cp2y = next.y - (nextNext.y - curr.y) * t;
      d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y} `;
    }
    return d + "Z";
  }, []);

  const step = useCallback(() => {
    const pts = pointsRef.current;
    const { stiffness, damping } = material;
    const dt = 1 / 60;
    const n = pts.length;

    // ── 1. Area conservation pressure ──────────────────────────────
    // If blob has been squished smaller than rest area, push outward
    const area = polygonArea(pts);
    const areaRatio = REST_AREA / Math.max(area, REST_AREA * 0.1);
    // Pressure force scales up the more it's compressed
    const pressureStrength = 60 * material.squishFactor * Math.max(0, areaRatio - 1);

    // ── 2. Neighbor coupling ────────────────────────────────────────
    // Each point pulls its neighbors toward its own velocity (wave propagation)
    const neighborCoupling = 0.12;
    const vrCopy = pts.map((p) => p.vr);

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prev = vrCopy[(i - 1 + n) % n];
      const next = vrCopy[(i + 1) % n];
      const neighborInfluence = (prev + next - 2 * vrCopy[i]) * neighborCoupling;

      // Spring + damping + pressure + neighbor
      const springForce = -stiffness * (p.r - p.baseR);
      const dampForce = -damping * p.vr;
      const pressure = pressureStrength;

      p.vr += (springForce + dampForce + pressure + neighborInfluence) * dt;
      p.r += p.vr * dt;
      p.r = Math.max(p.r, BASE_RADIUS * 0.15);
    }
  }, [material]);

  const applyPressAt = useCallback(
    (localX: number, localY: number, force: number) => {
      const pts = pointsRef.current;
      const pressAngle = Math.atan2(localY, localX);
      const sigma = 1.1;
      for (const p of pts) {
        let diff = p.angle - pressAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const influence = Math.exp((-diff * diff) / (2 * sigma * sigma));
        p.vr -= force * influence * material.squishFactor;
      }
    },
    [material],
  );

  const applyDragStretch = useCallback(
    (dx: number, dy: number) => {
      const pts = pointsRef.current;
      const mag = Math.sqrt(dx * dx + dy * dy);
      if (mag < 1) return;
      const nx = dx / mag;
      const ny = dy / mag;
      const impulse = Math.min(mag * 0.6, 80) * material.squishFactor;
      for (const p of pts) {
        const dot = Math.cos(p.angle) * nx + Math.sin(p.angle) * ny;
        p.vr += dot * impulse * 0.9;
      }
    },
    [material],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGElement>, svgRect: DOMRect) => {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      stretchRecordedRef.current = false;
      popChargeRef.current = 0;

      const cx = svgRect.left + svgRect.width / 2;
      const cy = svgRect.top + svgRect.height / 2;
      applyPressAt(e.clientX - cx, e.clientY - cy, PRESS_IMPULSE);
      vibrate(material.hapticPress);
      onPress();
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [applyPressAt, material, onPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGElement>, svgRect: DOMRect) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };

      const totalDx = e.clientX - dragStartRef.current.x;
      const totalDy = e.clientY - dragStartRef.current.y;
      const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        applyDragStretch(dx, dy);
      }

      popChargeRef.current = Math.min(popChargeRef.current + totalDist * 0.005, 1);

      if (!stretchRecordedRef.current && totalDist > 20) {
        stretchRecordedRef.current = true;
        vibrate([10, 10, 10]);
        onStretch();
      }
      void svgRect;
    },
    [applyDragStretch, onStretch],
  );

  const onPointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const pts = pointsRef.current;
    for (const p of pts) {
      p.vr += (Math.random() - 0.5) * material.wobbliness;
    }

    if (mode === "pop" && popChargeRef.current > 0.5) {
      vibrate(material.hapticPop);
      onPop();
    }
    popChargeRef.current = 0;
  }, [material, mode, onPop]);

  return { computePath, step, onPointerDown, onPointerMove, onPointerUp, animFrameRef };
}
