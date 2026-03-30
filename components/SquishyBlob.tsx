"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { Material } from "@/lib/materials";
import { ColorPreset } from "@/lib/colors";
import { useSquishyPhysics, Mode, BASE_RADIUS } from "@/hooks/useSquishyPhysics";

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
  const svgRef = useRef<SVGSVGElement>(null);
  const [path, setPath] = useState("");
  const [particles, setParticles] = useState<Particle[]>([]);
  const [popKey, setPopKey] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const physics = useSquishyPhysics(material, mode, onPop, onPress, onStretch);
  const gradId = `blob-grad-${color.id}`;
  const filterId = `blob-shadow`;

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

  // Pop particles — rendered as absolute divs so CSS transform works properly
  useEffect(() => {
    if (!isPopping) return;
    const count = 16;
    const colors = [color.fill, color.highlight, color.shadow];
    const newParticles: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      angle: (i / count) * 360 + Math.random() * (360 / count),
      size: 6 + Math.random() * 8,
      distance: 70 + Math.random() * 50,
      color: colors[i % colors.length],
    }));
    setParticles(newParticles);
    setPopKey((k) => k + 1);
    const t = setTimeout(() => setParticles([]), 700);
    return () => clearTimeout(t);
  }, [isPopping, color]);

  const getSvgRect = useCallback(() => {
    return svgRef.current?.getBoundingClientRect() ?? new DOMRect();
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGElement>) => {
      setShowHint(false);
      physics.onPointerDown(e, getSvgRect());
    },
    [physics, getSvgRect],
  );

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: SVG_SIZE, height: SVG_SIZE }}>
      <svg
        ref={svgRef}
        width={SVG_SIZE}
        height={SVG_SIZE}
        // Coordinate system: center is (0,0)
        viewBox={`${-CENTER} ${-CENTER} ${SVG_SIZE} ${SVG_SIZE}`}
        style={{ cursor: mode === "pop" ? "crosshair" : "grab", touchAction: "none", overflow: "visible" }}
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => physics.onPointerMove(e, getSvgRect())}
        onPointerUp={physics.onPointerUp}
        onPointerLeave={physics.onPointerUp}
      >
        <defs>
          <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor={color.highlight} />
            <stop offset="55%" stopColor={color.fill} />
            <stop offset="100%" stopColor={color.shadow} />
          </radialGradient>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor={color.shadow} floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Main blob */}
        {!isPopping && path && (
          <path
            d={path}
            fill={`url(#${gradId})`}
            filter={`url(#${filterId})`}
          />
        )}

        {/* Specular highlight — moves slightly with blob */}
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

      {/* Pop particles — absolutely positioned relative to blob container */}
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
            // CSS custom properties to pass angle/distance into keyframes
            ["--pop-x" as string]: `${Math.cos((p.angle * Math.PI) / 180) * p.distance}px`,
            ["--pop-y" as string]: `${Math.sin((p.angle * Math.PI) / 180) * p.distance}px`,
          }}
        />
      ))}

      {/* Hint */}
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
