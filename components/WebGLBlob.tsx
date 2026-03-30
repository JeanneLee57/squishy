"use client";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useDrag, usePinch } from "@use-gesture/react";
import * as THREE from "three";
import { Material } from "@/lib/materials";
import { ColorPreset } from "@/lib/colors";
import { useSquishyPhysics, Mode, BASE_RADIUS } from "@/hooks/useSquishyPhysics";
import { vibrate } from "@/lib/haptics";

const SVG_SIZE = 240;
const SHADER_POINTS = 64;

// ─── Catmull-Rom resampling ───────────────────────────────────────────────────

type Pt = { x: number; y: number };

function catmullRomSample(pts: Pt[], outCount: number): Pt[] {
  const n = pts.length;
  const result: Pt[] = [];
  for (let k = 0; k < outCount; k++) {
    const param = (k / outCount) * n;
    const i     = Math.floor(param);
    const t     = param - i;
    const p0    = pts[(i - 1 + n) % n];
    const p1    = pts[i % n];
    const p2    = pts[(i + 1) % n];
    const p3    = pts[(i + 2) % n];
    const t2 = t * t, t3 = t2 * t;
    result.push({
      x: 0.5 * (2*p1.x + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      y: 0.5 * (2*p1.y + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
    });
  }
  return result;
}

// ─── Shaders ──────────────────────────────────────────────────────────────────

const vertexShader = /* glsl */ `
out vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec2  uPoints[${SHADER_POINTS}];
uniform vec3  uColor;
uniform vec3  uHighlight;
uniform vec3  uShadow;
uniform float uTime;
uniform vec2  uLightDir;
uniform float uSSS;
uniform float uShininess;
uniform float uFresnelStr;
// Press dent
uniform vec2  uPressPos;
uniform float uPressStrength;  // 0..1

in  vec2 vPos;
out vec4 fragColor;

// ── Polygon SDF ───────────────────────────────────────────────────────────────
float polygonSDF(vec2 p) {
  float d = 1e6;
  bool  inside = false;
  for (int i = 0; i < ${SHADER_POINTS}; i++) {
    vec2 a = uPoints[i];
    vec2 b = uPoints[(i + 1) % ${SHADER_POINTS}];
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    d = min(d, length(pa - ba * h));
    bool c1 = (a.y <= p.y) && (b.y >  p.y);
    bool c2 = (b.y <= p.y) && (a.y >  p.y);
    if (c1 || c2) {
      float t = (p.y - a.y) / (b.y - a.y);
      if (p.x < a.x + t * (b.x - a.x)) inside = !inside;
    }
  }
  return inside ? -d : d;
}

vec2 sdfNormal2D(vec2 p) {
  const float e = 1.2;
  return normalize(vec2(
    polygonSDF(p + vec2(e, 0.0)) - polygonSDF(p - vec2(e, 0.0)),
    polygonSDF(p + vec2(0.0, e)) - polygonSDF(p - vec2(0.0, e))
  ));
}

void main() {
  float sdf = polygonSDF(vPos);
  if (sdf > 2.0) discard;
  float alpha = smoothstep(2.0, -1.0, sdf);

  // ── Bun normal (납작한 찐빵) ─────────────────────────────────────────────
  // Profile: h(r) = A * cos(r * π/2)  →  flat at center, gently slopes to edge
  vec2  normPos = vPos / float(${BASE_RADIUS});
  float r       = clamp(length(normPos), 0.0, 1.0);
  float bunA    = 0.28;                         // controls how flat (lower = flatter)
  float cosR    = cos(r * 1.5708);              // π/2
  float nz      = bunA * cosR;                  // height

  // Gradient of h  →  in-plane normal components
  float dhdr    = -bunA * sin(r * 1.5708) * 1.5708;
  vec2  nhXY    = (r > 0.001) ? (normPos / r) * dhdr * 0.35 : vec2(0.0);

  // Near the silhouette edge blend toward SDF gradient for crisp outline
  vec2  sdfGrad = sdfNormal2D(vPos);
  float edgeMix = smoothstep(0.55, 0.92, r);
  vec2  n2      = mix(nhXY, sdfGrad * 0.55, edgeMix);
  vec3  normal  = normalize(vec3(n2, max(nz, 0.05)));

  // ── Press dent ────────────────────────────────────────────────────────────
  // A Gaussian depression at the press point — creates darker center + bright rim
  if (uPressStrength > 0.01) {
    vec2  dp       = vPos - uPressPos;
    float dist     = length(dp);
    float sigma    = 38.0;
    float gaussian = exp(-dist * dist / (2.0 * sigma * sigma));
    float dent     = uPressStrength * gaussian;

    // Normal perturbation: rotate toward -z at center, flare outward at rim
    // Grad of gaussian points outward from press center
    vec2  gradG   = dp / (sigma * sigma) * gaussian * uPressStrength;
    // At center: gradG ≈ 0, but normal tilts inward via -z
    // At rim: gradG points outward, lifting the rim
    vec3  dentPerturb = vec3(gradG * 55.0, -dent * 0.55);
    normal = normalize(normal + dentPerturb);
  }

  // ── Lighting ──────────────────────────────────────────────────────────────
  vec3  lightDir = normalize(vec3(uLightDir, 1.4));
  vec3  viewDir  = vec3(0.0, 0.0, 1.0);
  vec3  halfDir  = normalize(lightDir + viewDir);

  float NdotL = max(dot(normal, lightDir), 0.0);
  float NdotH = max(dot(normal, halfDir),  0.0);
  float NdotV = max(dot(normal, viewDir),  0.0);

  float diffuse = NdotL * 0.72 + 0.28;
  float spec    = pow(NdotH, uShininess) * NdotL;
  float fresnel = pow(1.0 - NdotV, 3.0) * uFresnelStr;

  // ── SSS ───────────────────────────────────────────────────────────────────
  float thickness = clamp(-sdf / float(${BASE_RADIUS}), 0.0, 1.0);
  float scatter   = max(dot(-lightDir, viewDir), 0.0);
  float sssAmt    = uSSS * thickness * (0.55 + 0.45 * scatter);
  vec3  sssColor  = mix(uColor, uHighlight, 0.85) * 1.25;

  // ── Combine ───────────────────────────────────────────────────────────────
  vec3 col = uColor     * diffuse
           + uHighlight * spec    * 0.9
           + uHighlight * fresnel
           + sssColor   * sssAmt  * 0.42
           + uShadow    * max(0.0, -NdotL) * 0.15;

  float rim = pow(1.0 - NdotV, 2.2) * (1.0 - NdotL);
  col += uShadow * rim * 0.10;

  float pulse = 0.5 + 0.5 * sin(uTime * 1.1);
  col += uHighlight * pulse * 0.025 * (1.0 - thickness);

  fragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}
`;

// ─── Material uniforms ────────────────────────────────────────────────────────

function materialUniforms(mat: Material): { uSSS: number; uShininess: number; uFresnelStr: number } {
  const table: Record<string, { uSSS: number; uShininess: number; uFresnelStr: number }> = {
    jelly:   { uSSS: 0.55, uShininess: 80.0,  uFresnelStr: 0.70 },
    mochi:   { uSSS: 0.35, uShininess: 18.0,  uFresnelStr: 0.30 },
    slime:   { uSSS: 0.70, uShininess: 10.0,  uFresnelStr: 0.50 },
    balloon: { uSSS: 0.20, uShininess: 140.0, uFresnelStr: 0.90 },
  };
  return table[mat.id] ?? { uSSS: 0.45, uShininess: 60.0, uFresnelStr: 0.6 };
}

// ─── Press state shared ref ───────────────────────────────────────────────────

interface PressState { x: number; y: number; strength: number; active: boolean }

// ─── BlobMesh ─────────────────────────────────────────────────────────────────

interface BlobMeshProps {
  physics: ReturnType<typeof useSquishyPhysics>;
  color: ColorPreset;
  material: Material;
  pressRef: React.MutableRefObject<PressState>;
}

function BlobMesh({ physics, color, material, pressRef }: BlobMeshProps) {
  const uniforms = useMemo(() => {
    const { uSSS, uShininess, uFresnelStr } = materialUniforms(material);
    return {
      uPoints:      { value: Array.from({ length: SHADER_POINTS }, () => new THREE.Vector2()) },
      uColor:       { value: new THREE.Color(color.fill) },
      uHighlight:   { value: new THREE.Color(color.highlight) },
      uShadow:      { value: new THREE.Color(color.shadow) },
      uTime:        { value: 0 },
      uLightDir:    { value: new THREE.Vector2(-0.4, 0.6) },
      uSSS:         { value: uSSS },
      uShininess:   { value: uShininess },
      uFresnelStr:  { value: uFresnelStr },
      uPressPos:    { value: new THREE.Vector2(0, 0) },
      uPressStrength: { value: 0 },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    uniforms.uColor.value.set(color.fill);
    uniforms.uHighlight.value.set(color.highlight);
    uniforms.uShadow.value.set(color.shadow);
  }, [color, uniforms]);

  useEffect(() => {
    const p = materialUniforms(material);
    uniforms.uSSS.value        = p.uSSS;
    uniforms.uShininess.value  = p.uShininess;
    uniforms.uFresnelStr.value = p.uFresnelStr;
  }, [material, uniforms]);

  useFrame(({ clock }, delta) => {
    physics.step();
    const raw    = physics.getPoints();
    const smooth = catmullRomSample(raw, SHADER_POINTS);
    for (let i = 0; i < SHADER_POINTS; i++) {
      // Flip Y: physics uses screen-Y (down+), WebGL uses math-Y (up+)
      uniforms.uPoints.value[i].set(smooth[i].x, -smooth[i].y);
    }

    // Smooth press strength: ramp up while active, decay after release
    const ps = pressRef.current;
    const target = ps.active ? 1.0 : 0.0;
    const speed  = ps.active ? 12.0 : 5.0;
    ps.strength  = ps.strength + (target - ps.strength) * Math.min(1, delta * speed);

    uniforms.uPressPos.value.set(ps.x, -ps.y); // flip Y for shader
    uniforms.uPressStrength.value = ps.strength;
    uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh>
      <planeGeometry args={[SVG_SIZE, SVG_SIZE]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        glslVersion={THREE.GLSL3}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Particle burst ───────────────────────────────────────────────────────────

interface Particle { id: number; angle: number; size: number; distance: number; color: string }

// ─── Public component ─────────────────────────────────────────────────────────

interface Props {
  material: Material;
  color: ColorPreset;
  mode: Mode;
  onPop: () => void;
  onPress: () => void;
  onStretch: () => void;
  isPopping: boolean;
}

export function WebGLBlob({ material, color, mode, onPop, onPress, onStretch, isPopping }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const pressRef       = useRef<PressState>({ x: 0, y: 0, strength: 0, active: false });
  const [particles, setParticles] = useState<Particle[]>([]);
  const [popKey, setPopKey]       = useState(0);
  const [showHint, setShowHint]   = useState(true);
  const stretchRecordedRef        = useRef(false);

  const physics = useSquishyPhysics(material, mode);

  useEffect(() => {
    if (!isPopping) return;
    const count  = 16;
    const colors = [color.fill, color.highlight, color.shadow];
    setParticles(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        angle:    (i / count) * 360 + Math.random() * (360 / count),
        size:     6 + Math.random() * 8,
        distance: 70 + Math.random() * 50,
        color:    colors[i % colors.length],
      }))
    );
    setPopKey((k) => k + 1);
    const t = setTimeout(() => setParticles([]), 700);
    return () => clearTimeout(t);
  }, [isPopping, color]);

  const getLocalXY = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect() ?? new DOMRect();
    return {
      x: clientX - (rect.left + rect.width  / 2),
      y: clientY - (rect.top  + rect.height / 2),
    };
  }, []);

  useDrag(
    ({ first, last, movement: [mx, my], delta: [dx, dy], velocity: [vx, vy], xy: [cx, cy], event }) => {
      event.preventDefault();
      if (first) {
        setShowHint(false);
        stretchRecordedRef.current = false;
        physics.resetPopCharge();
        const { x, y } = getLocalXY(cx, cy);
        pressRef.current = { x, y, strength: 0, active: true };
        physics.applyPress(x, y);
        vibrate(material.hapticPress);
        onPress();
        return;
      }
      if (last) {
        pressRef.current.active = false;
        physics.applyRelease(vx * 60, vy * 60);
        if (physics.consumePopCharge()) {
          vibrate(material.hapticPop);
          onPop();
        }
        return;
      }
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
    { target: containerRef, eventOptions: { passive: false } }
  );

  usePinch(
    ({ delta: [dScale], first }) => {
      if (first) return;
      physics.applyPinch(dScale - 1);
    },
    { target: containerRef, eventOptions: { passive: false } }
  );

  const shadowColor = color.shadow + "59";

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center select-none touch-none"
      style={{ width: SVG_SIZE, height: SVG_SIZE, cursor: mode === "pop" ? "crosshair" : "grab" }}
    >
      <div
        style={{
          position: "absolute", inset: 0,
          filter: `drop-shadow(0px 8px 18px ${shadowColor})`,
          pointerEvents: "none",
        }}
      >
        <Canvas
          orthographic
          camera={{ zoom: 1, near: -100, far: 100, position: [0, 0, 10] }}
          style={{ width: SVG_SIZE, height: SVG_SIZE }}
          gl={{ antialias: true, alpha: true }}
        >
          <BlobMesh physics={physics} color={color} material={material} pressRef={pressRef} />
        </Canvas>
      </div>

      <div style={{ width: SVG_SIZE, height: SVG_SIZE }} />

      {particles.map((p) => (
        <div
          key={`${popKey}-${p.id}`}
          style={{
            position: "absolute", top: "50%", left: "50%",
            width: p.size, height: p.size,
            borderRadius: "50%", background: p.color,
            transform: "translate(-50%, -50%)",
            animation: `popFly 0.65s cubic-bezier(0.2,0,0.8,1) ${p.id * 15}ms forwards`,
            ["--pop-x" as string]: `${Math.cos((p.angle * Math.PI) / 180) * p.distance}px`,
            ["--pop-y" as string]: `${Math.sin((p.angle * Math.PI) / 180) * p.distance}px`,
          }}
        />
      ))}

      {showHint && (
        <span className="absolute text-xs font-medium pointer-events-none"
          style={{ color: color.shadow, opacity: 0.7 }}>
          눌러봐!
        </span>
      )}

      <style>{`
        @keyframes popFly {
          0%   { transform:translate(-50%,-50%) translate(0px,0px) scale(1); opacity:1; }
          60%  { opacity:0.8; }
          100% { transform:translate(-50%,-50%) translate(var(--pop-x),var(--pop-y)) scale(0.1); opacity:0; }
        }
      `}</style>
    </div>
  );
}
