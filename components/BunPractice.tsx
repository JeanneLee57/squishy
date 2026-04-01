'use client'

/**
 * BunPractice.tsx - 찐빵 데스크톱 토이
 *
 * ✅ 1단계: LatheGeometry 찐빵 형태
 * ✅ 2단계: 커스텀 셰이더 + 클릭 눌림
 * ✅ 3단계: 소리 + 터지기 + 김 모락모락 + 투명 배경
 */

import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { WindowBar } from './WindowBar'
import { soundEngine } from '@/lib/sound'

// =============================================
// 타이밍 상수
// =============================================
const MAX_DEPTH = 1.0
const CHARGE_SPEED = 3.0
const INFLATE_START = 2.0     // 부풀기 시작 (초)
const BURST_TIME = 3.8        // 터지는 시점 (초)
const REGEN_DELAY = 0.6       // 터진 후 재생 시작까지 대기
const REGEN_DURATION = 1.5    // 재생 애니메이션 시간
const HEAT_GAIN = 0.5         // 초당 열 축적
const HEAT_DECAY = 0.15       // 초당 열 감소
const STEAM_THRESHOLD = 1.5   // 김 나기 시작 온도

// =============================================
// 셰이더 — 버텍스
// =============================================
const vertexShader = /* glsl */ `
  uniform vec3 uPressPoint;
  uniform float uPressStrength;
  uniform float uPressRadius;
  uniform float uInflation;
  uniform float uShake;
  uniform float uScale;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDent;
  varying float vCrease;  // 칼집 깊이 (0=없음, 1=최대) → 프래그먼트에서 어둡게

  void main() {
    vec3 pos = position;

    // =============================================
    // 1) 칼집 (크리스) — 꼭대기 4갈래 별 모양 변형
    // =============================================
    // smoothstep: position.y가 0.30 이하면 0, 0.68 이상이면 1
    float topFactor = smoothstep(0.28, 0.68, position.y);

    // atan(z, x): 이 정점의 Y축 기준 각도
    // abs(cos(2θ)): 4방향(0°/90°/180°/270°)에서 1, 45°/135°에서 0
    // pow(..., 3): 칼집 선을 더 날카롭게 (값이 클수록 더 가늘어짐)
    float angle = atan(pos.z, pos.x);
    float crease = pow(abs(cos(angle * 2.0)), 3.0);

    // 전체 꼭대기를 중심으로 핀치(pinch): 모든 방향 안쪽으로
    float basePinch   = topFactor * topFactor * 0.20;
    // 칼집 선 방향은 추가로 더 당김
    float creasePinch = topFactor * topFactor * crease * 0.48;
    pos.xz *= (1.0 - basePinch - creasePinch);

    // 칼집 선은 살짝 아래로 꺼짐 (주름이 파인 느낌)
    pos.y -= topFactor * topFactor * crease * 0.055;

    vCrease = topFactor * crease;

    // =============================================
    // 2) 스케일 (터지기/재생)
    // =============================================
    pos *= uScale;

    // =============================================
    // 3) 부풀기
    // =============================================
    pos += normal * uInflation;

    // =============================================
    // 4) 눌림
    // =============================================
    float dist = distance(pos, uPressPoint * uScale);
    float gaussian = exp(-(dist * dist) / (2.0 * uPressRadius * uPressRadius));
    float dent = uPressStrength * gaussian;
    pos -= normal * dent * 0.4;

    // =============================================
    // 5) 떨림
    // =============================================
    pos += vec3(
      sin(uTime * 40.0 + pos.y * 10.0),
      cos(uTime * 53.0 + pos.x * 10.0),
      sin(uTime * 37.0 + pos.z * 10.0)
    ) * uShake;

    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vDent = dent;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

// =============================================
// 셰이더 — 프래그먼트
// =============================================
const fragmentShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform float uRedTint;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDent;
  varying float vCrease;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightDir);
    // cameraPosition: Three.js가 자동으로 주입하는 카메라 위치
    vec3 V = normalize(cameraPosition - vPosition);
    vec3 H = normalize(L + V);

    // =============================================
    // 그라데이션 색상 (바닥 앰버 → 중간 골드 → 꼭대기 크림)
    // =============================================
    // 바닥 y≈-0.48, 꼭대기 y≈0.68 → 0~1 정규화
    float heightT = clamp((vPosition.y + 0.28) / 0.96, 0.0, 1.0);

    vec3 bottomColor = vec3(0.859,0.71,0.284);  // 골드 (바닥/측면 그림자)
    vec3 midColor    = vec3(0.925,0.827,0.549);  // 크림 (몸통)
    vec3 topColor    = vec3(0.882,0.592,0.235);  // 진한 앰버 (꼭대기)

    vec3 baseColor = heightT < 0.5
      ? mix(bottomColor, midColor, heightT * 2.0)
      : mix(midColor, topColor, (heightT - 0.5) * 2.0);

    // 과열
    baseColor = mix(baseColor, vec3(0.95, 0.32, 0.18), uRedTint);

    // =============================================
    // 칼집 그림자: 크리스 선을 어둡고 진하게
    // =============================================
    vec3 creaseColor = baseColor * 0.50 + vec3(0.06, 0.01, -0.04);
    baseColor = mix(baseColor, creaseColor, vCrease * 0.80);

    // =============================================
    // 조명
    // =============================================
    float diffuse = max(dot(N, L), 0.0);
    // wrap lighting: 빛 반대편도 완전히 깜깜하지 않게
    float wrap = max(dot(N, L) * 0.5 + 0.5, 0.0);

    // 스페큘러 (Blinn-Phong): 36=약간 넓고 부드러운 광택
    float spec = pow(max(dot(N, H), 0.0), 36.0) * 0.2;

    // 프레넬 (Fresnel): 옆면/테두리가 살짝 밝아지는 효과
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.05;

    float brightness = 0.4 + diffuse * 0.44 + wrap * 0.20;

    // 눌림: 조금 더 어둡게
    vec3 dentColor = baseColor * 0.65 + vec3(0.04, 0.0, -0.02);
    vec3 color = mix(baseColor, dentColor, vDent);

    // 스페큘러/프레넬은 따뜻한 흰빛으로 위에 더함
    vec3 specLight  = vec3(1.00, 0.97, 0.88) * spec;
    vec3 fresnelRim = vec3(1.00, 0.94, 0.82) * fresnel;

    gl_FragColor = vec4(color * brightness + specLight + fresnelRim, 1.0);
  }
`

// =============================================
// 탄성 이징 함수
// =============================================
function elasticOut(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1
}

// =============================================
// 찐빵 Mesh
// =============================================
type BunCallbacks = {
  onBurst: () => void
  onSteamChange: (active: boolean) => void
  onPoofSound: () => void
  onBoingSound: () => void
}

function BunMesh({ callbacks }: { callbacks: BunCallbacks }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const state = useRef({
    // 누르기
    point: new THREE.Vector3(0, -10, 0),
    strength: 0,
    held: false,
    recovering: false,
    holdTime: 0,

    // 열/김
    heat: 0,
    wasSteaming: false,

    // 터지기/재생
    phase: 'normal' as 'normal' | 'burst' | 'regen',
    burstTimer: 0,
    scale: 1,
  })

  const uniforms = useMemo(() => ({
    uPressPoint:    { value: new THREE.Vector3(0, -10, 0) },
    uPressStrength: { value: 0.0 },
    uPressRadius:   { value: 0.35 },
    uInflation:     { value: 0.0 },
    uShake:         { value: 0.0 },
    uScale:         { value: 1.0 },
    uTime:          { value: 0.0 },
    uLightDir:      { value: new THREE.Vector3(2, 5, 4).normalize() },
    uRedTint:       { value: 0.0 },
  }), [])

  const geometry = useMemo(() => {
    const spline = new THREE.SplineCurve([
      // 바닥: 평평
      new THREE.Vector2(0.001, -0.26),
      new THREE.Vector2(0.40,  -0.26),
      new THREE.Vector2(0.68,  -0.24),

      // 옆면
      new THREE.Vector2(0.84,  -0.10),
      new THREE.Vector2(0.88,   0.06),  // 가장 넓은 부분

      // 돔
      new THREE.Vector2(0.82,   0.24),
      new THREE.Vector2(0.65,   0.42),
      new THREE.Vector2(0.44,   0.55),
      new THREE.Vector2(0.20,   0.63),
      new THREE.Vector2(0.001,  0.66),  // 꼭대기
    ])
    // 세그먼트 많을수록 칼집이 세밀하게 표현됨
    const profilePoints = spline.getPoints(80)
    const geo = new THREE.LatheGeometry(profilePoints, 64)

    const merged = mergeVertices(geo, 0.0001)
    merged.computeVertexNormals()
    return merged
  }, [])

  useFrame(({ clock }, delta) => {
    if (!matRef.current) return
    const s = state.current
    const u = matRef.current.uniforms

    u.uTime.value = clock.elapsedTime

    // === 터지기/재생 페이즈 ===
    if (s.phase === 'burst') {
      s.burstTimer += delta
      s.scale = 0
      if (s.burstTimer > REGEN_DELAY) {
        s.phase = 'regen'
        s.burstTimer = 0
      }
    } else if (s.phase === 'regen') {
      s.burstTimer += delta
      const progress = Math.min(s.burstTimer / REGEN_DURATION, 1)
      s.scale = elasticOut(progress)
      if (progress >= 1) {
        s.phase = 'normal'
        s.scale = 1
        s.holdTime = 0
        s.heat = 0
        s.strength = 0
        callbacks.onSteamChange(false)
      }
    }

    // === 누르기 ===
    if (s.phase === 'normal') {
      if (s.held) {
        s.strength += (MAX_DEPTH - s.strength) * CHARGE_SPEED * delta
        s.holdTime += delta
        s.heat += HEAT_GAIN * delta

        // 터지기 체크
        if (s.holdTime > BURST_TIME) {
          s.phase = 'burst'
          s.burstTimer = 0
          s.held = false
          s.strength = 0
          s.holdTime = 0
          callbacks.onBurst()
          return
        }
      } else if (s.recovering) {
        s.strength *= Math.pow(0.02, delta)
        s.holdTime *= Math.pow(0.01, delta)
        if (s.strength < 0.005) {
          s.strength = 0
          s.holdTime = 0
          s.recovering = false
        }
      }

      // 열 감소 (누르지 않을 때)
      if (!s.held) {
        s.heat = Math.max(0, s.heat - HEAT_DECAY * delta)
      }
    }

    // === 김 모락모락 판정 ===
    const isSteaming = s.heat > STEAM_THRESHOLD && s.phase === 'normal'
    if (isSteaming !== s.wasSteaming) {
      s.wasSteaming = isSteaming
      callbacks.onSteamChange(isSteaming)
    }

    // === 부풀기/떨림/붉어짐 (holdTime 기반) ===
    let inflation = 0
    let shake = 0
    let redTint = 0

    if (s.holdTime > INFLATE_START) {
      const t = (s.holdTime - INFLATE_START) / (BURST_TIME - INFLATE_START)
      inflation = Math.min(t, 1) * 0.15
      redTint = Math.min(t, 1) * 0.35

      // 부풀기 후반부에 떨림 추가
      if (t > 0.5) {
        shake = Math.pow((t - 0.5) / 0.5, 2) * 0.018
      }
    }

    // === 유니폼 업데이트 ===
    u.uPressStrength.value = s.strength
    u.uInflation.value = inflation
    u.uShake.value = shake
    u.uScale.value = s.scale
    u.uRedTint.value = redTint
  })

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const s = state.current
    if (s.phase !== 'normal') return

    s.point.copy(e.point)
    s.held = true
    s.recovering = false
    matRef.current!.uniforms.uPressPoint.value.copy(e.point)

    callbacks.onPoofSound()
  }

  const handlePointerUp = () => {
    const s = state.current
    if (!s.held) return
    s.held = false
    s.recovering = true
    callbacks.onBoingSound()
  }

  return (
    <mesh
      geometry={geometry}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// =============================================
// 김 모락모락 (CSS 파티클)
// =============================================
function SteamEffect({ active }: { active: boolean }) {
  if (!active) return null

  const wisps = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: 42 + Math.sin(i * 1.3) * 14,
      size: 10 + (i % 3) * 6,
      duration: 1.8 + (i % 4) * 0.4,
      delay: i * 0.25,
    })), [])

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none', overflow: 'hidden',
    }}>
      {wisps.map(w => (
        <div key={w.id} style={{
          position: 'absolute',
          left: `${w.left}%`,
          top: '32%',
          width: w.size,
          height: w.size,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent)',
          animation: `steamRise ${w.duration}s ease-out ${w.delay}s infinite`,
          opacity: 0,
        }} />
      ))}
    </div>
  )
}

// =============================================
// 터지기 파티클 (CSS)
// =============================================
function BurstEffect({ active, onComplete }: { active: boolean, onComplete: () => void }) {
  useEffect(() => {
    if (active) {
      const t = setTimeout(onComplete, 900)
      return () => clearTimeout(t)
    }
  }, [active, onComplete])

  const particles = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
      const dist = 50 + Math.random() * 90
      return {
        id: i,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist - 20, // 약간 위로 편향
        size: 5 + Math.random() * 12,
        delay: Math.random() * 0.06,
        hue: Math.random() > 0.5 ? '#f0d9b5' : '#e8c9a0',
      }
    }), [])

  if (!active) return null

  return (
    <div style={{
      position: 'absolute',
      top: '42%', left: '50%',
      pointerEvents: 'none',
    }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: p.hue,
          animation: `burstFly 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${p.delay}s forwards`,
          ['--tx' as string]: `${p.tx}px`,
          ['--ty' as string]: `${p.ty}px`,
        }} />
      ))}
    </div>
  )
}

// =============================================
// 씬
// =============================================
function Scene({ callbacks }: { callbacks: BunCallbacks }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 3]} intensity={1.2} />
      <directionalLight position={[-2, 2, -2]} intensity={0.3} color="#b0c4de" />
      <BunMesh callbacks={callbacks} />
      <OrbitControls
        enablePan={false}
        minDistance={1.5}
        maxDistance={6}
        target={[0, 0.05, 0]}
      />
    </>
  )
}

// =============================================
// 메인 컴포넌트
// =============================================
export function BunPractice() {
  const [isSteaming, setIsSteaming] = useState(false)
  const [isBursting, setIsBursting] = useState(false)

  const callbacks = useMemo<BunCallbacks>(() => ({
    onBurst: () => {
      soundEngine.playPop()
      setIsBursting(true)
    },
    onSteamChange: (active) => {
      setIsSteaming(active)
      if (active) soundEngine.startSteam()
      else soundEngine.stopSteam()
    },
    onPoofSound: () => soundEngine.playPoof(),
    onBoingSound: () => soundEngine.playBoing(),
  }), [])

  const handleBurstComplete = useCallback(() => setIsBursting(false), [])

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'transparent',
      position: 'relative',
    }}>
      <WindowBar />

      {/* R3F Canvas — alpha로 투명 배경 */}
      <Canvas
        camera={{ position: [0, 0.05, 3.2], fov: 48 }}
        gl={{ alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Scene callbacks={callbacks} />
      </Canvas>

      {/* 김 모락모락 */}
      <SteamEffect active={isSteaming} />

      {/* 터지기 파티클 */}
      <BurstEffect active={isBursting} onComplete={handleBurstComplete} />
    </div>
  )
}
