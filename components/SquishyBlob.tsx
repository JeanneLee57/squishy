"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { useDrag, usePinch } from "@use-gesture/react";
import { Material } from "@/lib/materials";
import { ColorPreset } from "@/lib/colors";
import { useSquishyPhysics, Mode, BASE_RADIUS } from "@/hooks/useSquishyPhysics";
import { vibrate } from "@/lib/haptics";

interface Props {
  material: Material;
  color: ColorPreset;
  mode: Mode;
  onPop: () => void;
  onPress: () => void;
  onStretch: () => void;
  isPopping: boolean;
}

const SVG_SIZE = 240;
const CENTER = SVG_SIZE / 2;

interface Particle {
  id: number;
  angle: number;
  size: number;
  distance: number;
  color: string;
}

export function SquishyBlob({ material, color, mode, onPop, onPress, onStretch, isPopping }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [path, setPath] = useState("");
  const [particles, setParticles] = useState<Particle[]>([]);
  const [popKey, setPopKey] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const stretchRecordedRef = useRef(false);

  const physics = useSquishyPhysics(material, mode);
  const gradId = `blob-grad-${color.id}`;

  // Animation loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      physics.step();
      setPath(physics.computePath());
      physics.animFrameRef.current = requestAnimationFrame(loop);
    };
    physics.animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(physics.animFrameRef.current);
    };
  }, [physics]);

  // Pop particles
  useEffect(() => {
    if (!isPopping) return;
    const count = 16;
    const colors = [color.fill, color.highlight, color.shadow];
    setParticles(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        angle: (i / count) * 360 + Math.random() * (360 / count),
        size: 6 + Math.random() * 8,
        distance: 70 + Math.random() * 50,
        color: colors[i % colors.length],
      }))
    );
    setPopKey((k) => k + 1);
    const t = setTimeout(() => setParticles([]), 700);
    return () => clearTimeout(t);
  }, [isPopping, color]);

  const getLocalXY = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect() ?? new DOMRect();
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  }, []);

  // Drag gesture — replaces raw pointer events
  useDrag(
    ({ first, last, movement: [mx, my], delta: [dx, dy], velocity: [vx, vy], xy: [cx, cy], event }) => {
      event.preventDefault();

      if (first) {
        setShowHint(false);
        stretchRecordedRef.current = false;
        physics.resetPopCharge();
        const { x, y } = getLocalXY(cx, cy);
        physics.applyPress(x, y);
        vibrate(material.hapticPress);
        onPress();
        return;
      }

      if (last) {
        // Pass actual release velocity (px/ms → scale up for impulse)
        physics.applyRelease(vx * 60, vy * 60);
        if (physics.consumePopCharge()) {
          vibrate(material.hapticPop);
          onPop();
        }
        return;
      }

      // Mid-drag: stretch in drag direction
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        physics.applyDrag(dx, dy);
      }

      const dist = Math.sqrt(mx * mx + my * my);
      physics.addPopCharge(dist);

      if (!stretchRecordedRef.current && dist > 20) {
        stretchRecordedRef.current = true;
        vibrate([10, 10, 10]);
        onStretch();
      }
    },
    {
      target: containerRef,
      eventOptions: { passive: false },
    }
  );

  // Pinch gesture — two-finger squeeze/expand
  usePinch(
    ({ delta: [dScale], first }) => {
      if (first) return;
      // dScale > 0: spread (expand), dScale < 0: pinch (compress)
      physics.applyPinch(dScale - 1);
    },
    {
      target: containerRef,
      eventOptions: { passive: false },
    }
  );

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center select-none touch-none"
      style={{ width: SVG_SIZE, height: SVG_SIZE, cursor: mode === "pop" ? "crosshair" : "grab" }}
    >
      <svg
        ref={svgRef}
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`${-CENTER} ${-CENTER} ${SVG_SIZE} ${SVG_SIZE}`}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <defs>
          <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor={color.highlight} />
            <stop offset="55%" stopColor={color.fill} />
            <stop offset="100%" stopColor={color.shadow} />
          </radialGradient>
          <filter id="blob-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor={color.shadow} floodOpacity="0.35" />
          </filter>
        </defs>

        {!isPopping && path && (
          <path d={path} fill={`url(#${gradId})`} filter="url(#blob-shadow)" />
        )}

        {!isPopping && path && (
          <ellipse
            cx={-BASE_RADIUS * 0.25}
            cy={-BASE_RADIUS * 0.3}
            rx={BASE_RADIUS * 0.22}
            ry={BASE_RADIUS * 0.14}
            fill={color.highlight}
            opacity="0.6"
            style={{ pointerEvents: "none" }}
          />
        )}
      </svg>

      {/* Pop particles */}
      {particles.map((p) => (
        <div
          key={`${popKey}-${p.id}`}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.color,
            transform: "translate(-50%, -50%)",
            animation: `popFly 0.65s cubic-bezier(0.2, 0, 0.8, 1) ${p.id * 15}ms forwards`,
            ["--pop-x" as string]: `${Math.cos((p.angle * Math.PI) / 180) * p.distance}px`,
            ["--pop-y" as string]: `${Math.sin((p.angle * Math.PI) / 180) * p.distance}px`,
          }}
        />
      ))}

      {showHint && (
        <span
          className="absolute text-xs font-medium pointer-events-none"
          style={{ color: color.shadow, opacity: 0.7 }}
        >
          눌러봐!
        </span>
      )}

      <style>{`
        @keyframes popFly {
          0%   { transform: translate(-50%, -50%) translate(0px, 0px) scale(1); opacity: 1; }
          60%  { opacity: 0.8; }
          100% { transform: translate(-50%, -50%) translate(var(--pop-x), var(--pop-y)) scale(0.1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
