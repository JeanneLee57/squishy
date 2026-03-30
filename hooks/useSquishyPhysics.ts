"use client";
import { useRef, useCallback, useEffect } from "react";
import { Material } from "@/lib/materials";
import { vibrate } from "@/lib/haptics";

export type Mode = "free" | "pop";

const NUM_POINTS = 16;
export const BASE_RADIUS = 80;

export interface BlobPoint {
  angle: number;
  r: number;
  vr: number;
  baseR: number;
}

// How much press force to apply — tuned so deformation is always visible
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
    const baseVariance = 4;
    pointsRef.current = Array.from({ length: NUM_POINTS }, (_, i) => {
      const angle = (i / NUM_POINTS) * Math.PI * 2;
      const r = BASE_RADIUS + (Math.random() - 0.5) * baseVariance;
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

    for (const p of pts) {
      const springForce = -stiffness * (p.r - p.baseR);
      const dampForce = -damping * p.vr;
      p.vr += (springForce + dampForce) * dt;
      p.r += p.vr * dt;
      p.r = Math.max(p.r, BASE_RADIUS * 0.15); // allow deeper squish
    }
  }, [material]);

  // Push points inward toward press location
  const applyPressAt = useCallback(
    (localX: number, localY: number, force: number) => {
      const pts = pointsRef.current;
      const pressAngle = Math.atan2(localY, localX);
      // Wider spread (σ=1.1) so the whole side squishes, not just one point
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

  // Directional stretch: blob elongates in drag direction
  const applyDragStretch = useCallback(
    (dragX: number, dragY: number) => {
      const pts = pointsRef.current;
      const mag = Math.sqrt(dragX * dragX + dragY * dragY);
      if (mag < 1) return;
      const nx = dragX / mag;
      const ny = dragY / mag;
      const stretchImpulse = Math.min(mag * 0.6, 80) * material.squishFactor;

      for (const p of pts) {
        const px = Math.cos(p.angle);
        const py = Math.sin(p.angle);
        // Dot product: points in drag direction stretch OUT, opposite side squishes IN
        const dot = px * nx + py * ny;
        p.vr += dot * stretchImpulse * 0.9;
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

      void svgRect; // used by caller to compute local coords if needed
    },
    [applyDragStretch, onStretch],
  );

  const onPointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const pts = pointsRef.current;
    const wobble = material.wobbliness;
    for (const p of pts) {
      p.vr += (Math.random() - 0.5) * wobble;
    }

    if (mode === "pop" && popChargeRef.current > 0.5) {
      vibrate(material.hapticPop);
      onPop();
    }

    popChargeRef.current = 0;
  }, [material, mode, onPop]);

  return { computePath, step, onPointerDown, onPointerMove, onPointerUp, animFrameRef };
}
