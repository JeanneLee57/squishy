'use client'

/**
 * BunPractice.tsx - 찐빵 데스크톱 토이
 *
 * ✅ 1단계: LatheGeometry 찐빵 형태
 * ✅ 2단계: 커스텀 셰이더 + 클릭 눌림
 * ✅ 3단계: 소리 + 터지기 + 김 모락모락 + 투명 배경
 * ✅ 4단계: 셰이더 파라미터 실시간 슬라이더
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
const CHARGE_SPEED = 7.0
const INFLATE_START = 2.0     // 부풀기 시작 (초)
const BURST_TIME = 3.8        // 터지는 시점 (초)
const REGEN_DELAY = 0.6       // 터진 후 재생 시작까지 대기
const REGEN_DURATION = 1.5    // 재생 애니메이션 시간
const HEAT_GAIN = 0.5         // 초당 열 축적
const HEAT_DECAY = 0.15       // 초당 열 감소
const STEAM_THRESHOLD = 1.5   // 김 나기 시작 온도

// =============================================
// 셰이더 파라미터 기본값
// =============================================
export const DEFAULT_PARAMS = {
  // 칼집 (Vertex)
  basePinch:   0.20,   // 꼭대기 전체 수축량
  creasePinch: 0.48,   // 칼집 선 추가 수축량
  creaseSink:  0.055,  // 칼집 선 아래로 꺼지는 깊이
  creaseBot:   0.28,   // 칼집 영향 시작 높이 (smoothstep 하한)
  creaseTop:   0.68,   // 칼집 영향 최대 높이 (smoothstep 상한)
  // 눌림 (Vertex)
  dentDepth:   0.40,   // 눌림 변위 깊이 배율
  pressRadius: 0.35,   // 눌림 가우시안 반지름
  // 조명 (Fragment)
  ambient:     0.56,   // 환경광
  diffuse:     0.36,   // 확산광 강도
  wrap:        0.24,   // 랩 라이팅 (그늘쪽 보정)
  specPow:     36.0,   // 스페큘러 지수 (높을수록 작고 선명)
  specStr:     0.20,   // 스페큘러 강도
  fresnelPow:  4.0,    // 프레넬 지수 (높을수록 테두리에만)
  fresnelStr:  0.05,   // 프레넬 강도
  // 색상 (Fragment)
  bottomR: 0.859, bottomG: 0.710, bottomB: 0.284,  // 바닥 골드
  midR:    0.925, midG:    0.827, midB:    0.549,   // 중간 크림
  topR:    0.882, topG:    0.592, topB:    0.235,   // 꼭대기 앰버
  // 칼집·눌림 어둠 (Fragment)
  creaseDark:  0.80,   // 칼집 그림자 믹스 강도
  dentDark:    0.65,   // 눌림 warm AO 강도
  dentEdgeStr: 0.40,   // 눌림 가장자리 반짝임 강도
  dentSSS:     0.22,   // 눌림 가장자리 투과광 강도 (SSS)
}
export type ShaderParams = typeof DEFAULT_PARAMS

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

  uniform float uBasePinch;
  uniform float uCreasePinch;
  uniform float uCreaseSink;
  uniform float uCreaseBot;
  uniform float uCreaseTop;
  uniform float uDentDepth;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDent;
  varying float vCrease;

  void main() {
    vec3 pos = position;

    // =============================================
    // 1) 칼집 (크리스) — 꼭대기 4갈래 별 모양 변형
    // =============================================
    float topFactor = smoothstep(uCreaseBot, uCreaseTop, position.y);
    float angle = atan(pos.z, pos.x);
    float crease = pow(abs(cos(angle * 2.0)), 3.0);

    float basePinch   = topFactor * topFactor * uBasePinch;
    float creasePinch = topFactor * topFactor * crease * uCreasePinch;
    pos.xz *= (1.0 - basePinch - creasePinch);
    pos.y -= topFactor * topFactor * crease * uCreaseSink;

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
    pos -= normal * dent * uDentDepth;

    // =============================================
    // 5) 떨림
    // =============================================
    pos += vec3(
      sin(uTime * 40.0 + pos.y * 10.0),
      cos(uTime * 53.0 + pos.x * 10.0),
      sin(uTime * 37.0 + pos.z * 10.0)
    ) * uShake;

    // 눌림 노멀 보정: 림(rim, r≈σ)에서 최대가 되는 바깥쪽 기울기
    // slope ∝ r × gaussian → 중심(r=0)과 원거리(gaussian→0) 모두 0, 림에서 최대
    vec3 fromCenter = pos - uPressPoint * uScale;
    float d = max(length(fromCenter), 0.001);
    float slope = (d / (uPressRadius * uPressRadius)) * dent;
    vec3 perturbedNormal = normalize(normal + normalize(fromCenter) * slope * uDentDepth * 0.6);
    vNormal = normalize(normalMatrix * perturbedNormal);
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

  uniform float uAmbient;
  uniform float uDiffuse;
  uniform float uWrap;
  uniform float uSpecPow;
  uniform float uSpecStr;
  uniform float uFresnelPow;
  uniform float uFresnelStr;
  uniform float uCreaseDark;
  uniform float uDentDark;
  uniform float uDentEdgeStr;  // 눌림 가장자리 반짝임 강도
  uniform float uDentSSS;      // 얇아진 가장자리 투과광 강도
  uniform vec3 uBottomColor;
  uniform vec3 uMidColor;
  uniform vec3 uTopColor;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDent;
  varying float vCrease;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vPosition);
    vec3 H = normalize(L + V);

    // =============================================
    // 그라데이션 색상
    // =============================================
    float heightT = clamp((vPosition.y + 0.28) / 0.96, 0.0, 1.0);
    vec3 baseColor = heightT < 0.5
      ? mix(uBottomColor, uMidColor, heightT * 2.0)
      : mix(uMidColor, uTopColor, (heightT - 0.5) * 2.0);

    // 과열
    baseColor = mix(baseColor, vec3(0.95, 0.32, 0.18), uRedTint);

    // =============================================
    // 칼집 그림자
    // =============================================
    vec3 creaseColor = baseColor * 0.50 + vec3(0.06, 0.01, -0.04);
    baseColor = mix(baseColor, creaseColor, vCrease * uCreaseDark);

    // =============================================
    // 조명
    // =============================================
    float diffuse = max(dot(N, L), 0.0);
    float wrap    = max(dot(N, L) * 0.5 + 0.5, 0.0);
    float spec    = pow(max(dot(N, H), 0.0), uSpecPow)   * uSpecStr;
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelPow) * uFresnelStr;
    float brightness = uAmbient + diffuse * uDiffuse + wrap * uWrap;

    // =============================================
    // 눌림 — vDent 기반 (따뜻한 회화 접근)
    // =============================================
    float dentAmount = smoothstep(0.0, 0.4, vDent);
    float dentCenter = smoothstep(0.2, 0.7, vDent);
    float dentEdge   = dentAmount * (1.0 - dentCenter);

    // 1. Warm AO: 어두워질수록 회색이 아니라 더 진한 앰버/갈색
    //    (찐빵은 그림자도 따뜻한 색)
    vec3 warmShadow = baseColor * vec3(0.84, 0.70, 0.45);
    vec3 color = mix(baseColor, warmShadow, dentAmount * uDentDark);

    // 2. Rim specular: 림 가장자리 — 팽팽해진 표면의 반짝임 (wrap lighting으로 부드럽게)
    float rimFacing = max(dot(N, L) * 0.5 + 0.5, 0.0);
    color += vec3(1.0, 0.96, 0.82) * dentEdge * rimFacing * uDentEdgeStr;

    // 3. SSS: 얇아진 가장자리 — 따뜻한 투과광
    color += vec3(0.98, 0.72, 0.35) * dentEdge * uDentSSS;

    // 중앙 밝아짐 완화: 깊이 파일수록 중앙을 살짝 어둡게 보정
    color *= 1.0 - dentCenter * 0.12;

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

function BunMesh({ callbacks, params }: { callbacks: BunCallbacks; params: ShaderParams }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const state = useRef({
    point: new THREE.Vector3(0, -10, 0),
    strength: 0,
    held: false,
    recovering: false,
    holdTime: 0,
    heat: 0,
    wasSteaming: false,
    phase: 'normal' as 'normal' | 'burst' | 'regen',
    burstTimer: 0,
    scale: 1,
  })

  const uniforms = useMemo(() => ({
    uPressPoint:    { value: new THREE.Vector3(0, -10, 0) },
    uPressStrength: { value: 0.0 },
    uPressRadius:   { value: DEFAULT_PARAMS.pressRadius },
    uInflation:     { value: 0.0 },
    uShake:         { value: 0.0 },
    uScale:         { value: 1.0 },
    uTime:          { value: 0.0 },
    uLightDir:      { value: new THREE.Vector3(2, 5, 4).normalize() },
    uRedTint:       { value: 0.0 },
    // 칼집
    uBasePinch:     { value: DEFAULT_PARAMS.basePinch },
    uCreasePinch:   { value: DEFAULT_PARAMS.creasePinch },
    uCreaseSink:    { value: DEFAULT_PARAMS.creaseSink },
    uCreaseBot:     { value: DEFAULT_PARAMS.creaseBot },
    uCreaseTop:     { value: DEFAULT_PARAMS.creaseTop },
    // 눌림
    uDentDepth:     { value: DEFAULT_PARAMS.dentDepth },
    // 조명
    uAmbient:       { value: DEFAULT_PARAMS.ambient },
    uDiffuse:       { value: DEFAULT_PARAMS.diffuse },
    uWrap:          { value: DEFAULT_PARAMS.wrap },
    uSpecPow:       { value: DEFAULT_PARAMS.specPow },
    uSpecStr:       { value: DEFAULT_PARAMS.specStr },
    uFresnelPow:    { value: DEFAULT_PARAMS.fresnelPow },
    uFresnelStr:    { value: DEFAULT_PARAMS.fresnelStr },
    uCreaseDark:    { value: DEFAULT_PARAMS.creaseDark },
    uDentDark:      { value: DEFAULT_PARAMS.dentDark },
    uDentEdgeStr:   { value: DEFAULT_PARAMS.dentEdgeStr },
    uDentSSS:       { value: DEFAULT_PARAMS.dentSSS },
    // 색상
    uBottomColor:   { value: new THREE.Color(DEFAULT_PARAMS.bottomR, DEFAULT_PARAMS.bottomG, DEFAULT_PARAMS.bottomB) },
    uMidColor:      { value: new THREE.Color(DEFAULT_PARAMS.midR,    DEFAULT_PARAMS.midG,    DEFAULT_PARAMS.midB) },
    uTopColor:      { value: new THREE.Color(DEFAULT_PARAMS.topR,    DEFAULT_PARAMS.topG,    DEFAULT_PARAMS.topB) },
  }), [])

  // params 변경 → 유니폼 동기화
  useEffect(() => {
    if (!matRef.current) return
    const u = matRef.current.uniforms
    u.uPressRadius.value  = params.pressRadius
    u.uBasePinch.value    = params.basePinch
    u.uCreasePinch.value  = params.creasePinch
    u.uCreaseSink.value   = params.creaseSink
    u.uCreaseBot.value    = params.creaseBot
    u.uCreaseTop.value    = params.creaseTop
    u.uDentDepth.value    = params.dentDepth
    u.uAmbient.value      = params.ambient
    u.uDiffuse.value      = params.diffuse
    u.uWrap.value         = params.wrap
    u.uSpecPow.value      = params.specPow
    u.uSpecStr.value      = params.specStr
    u.uFresnelPow.value   = params.fresnelPow
    u.uFresnelStr.value   = params.fresnelStr
    u.uCreaseDark.value   = params.creaseDark
    u.uDentDark.value     = params.dentDark
    u.uDentEdgeStr.value  = params.dentEdgeStr
    u.uDentSSS.value      = params.dentSSS
    u.uBottomColor.value.setRGB(params.bottomR, params.bottomG, params.bottomB)
    u.uMidColor.value.setRGB(params.midR,    params.midG,    params.midB)
    u.uTopColor.value.setRGB(params.topR,    params.topG,    params.topB)
  }, [params])

  const geometry = useMemo(() => {
    const spline = new THREE.SplineCurve([
      new THREE.Vector2(0.001, -0.26),
      new THREE.Vector2(0.40,  -0.26),
      new THREE.Vector2(0.68,  -0.24),
      new THREE.Vector2(0.84,  -0.10),
      new THREE.Vector2(0.88,   0.06),
      new THREE.Vector2(0.82,   0.24),
      new THREE.Vector2(0.65,   0.42),
      new THREE.Vector2(0.44,   0.55),
      new THREE.Vector2(0.20,   0.63),
      new THREE.Vector2(0.001,  0.66),
    ])
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

    if (s.phase === 'normal') {
      if (s.held) {
        s.strength += (MAX_DEPTH - s.strength) * CHARGE_SPEED * delta
        s.holdTime += delta
        s.heat += HEAT_GAIN * delta

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

      if (!s.held) {
        s.heat = Math.max(0, s.heat - HEAT_DECAY * delta)
      }
    }

    const isSteaming = s.heat > STEAM_THRESHOLD && s.phase === 'normal'
    if (isSteaming !== s.wasSteaming) {
      s.wasSteaming = isSteaming
      callbacks.onSteamChange(isSteaming)
    }

    let inflation = 0
    let shake = 0
    let redTint = 0

    if (s.holdTime > INFLATE_START) {
      const t = (s.holdTime - INFLATE_START) / (BURST_TIME - INFLATE_START)
      inflation = Math.min(t, 1) * 0.15
      redTint = Math.min(t, 1) * 0.35
      if (t > 0.5) {
        shake = Math.pow((t - 0.5) / 0.5, 2) * 0.018
      }
    }

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
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
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
        ty: Math.sin(angle) * dist - 20,
        size: 5 + Math.random() * 12,
        delay: Math.random() * 0.06,
        hue: Math.random() > 0.5 ? '#f0d9b5' : '#e8c9a0',
      }
    }), [])

  if (!active) return null

  return (
    <div style={{ position: 'absolute', top: '42%', left: '50%', pointerEvents: 'none' }}>
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
// 셰이더 컨트롤 패널
// =============================================
type SliderDef = { key: keyof ShaderParams; label: string; min: number; max: number; step: number }
type GroupDef  = { title: string; sliders: SliderDef[] }

const SLIDER_GROUPS: GroupDef[] = [
  {
    title: '칼집',
    sliders: [
      { key: 'basePinch',   label: 'basePinch',   min: 0,    max: 0.5,  step: 0.005 },
      { key: 'creasePinch', label: 'creasePinch', min: 0,    max: 0.8,  step: 0.005 },
      { key: 'creaseSink',  label: 'creaseSink',  min: 0,    max: 0.15, step: 0.002 },
      { key: 'creaseBot',   label: 'creaseBot',   min: 0,    max: 0.6,  step: 0.01  },
      { key: 'creaseTop',   label: 'creaseTop',   min: 0.3,  max: 1.0,  step: 0.01  },
    ],
  },
  {
    title: '눌림',
    sliders: [
      { key: 'dentDepth',   label: 'dentDepth',   min: 0,    max: 1.0,  step: 0.01  },
      { key: 'pressRadius', label: 'pressRadius', min: 0.05, max: 0.8,  step: 0.01  },
    ],
  },
  {
    title: '조명',
    sliders: [
      { key: 'ambient',    label: 'ambient',    min: 0,   max: 1,   step: 0.01 },
      { key: 'diffuse',    label: 'diffuse',    min: 0,   max: 1,   step: 0.01 },
      { key: 'wrap',       label: 'wrap',       min: 0,   max: 0.5, step: 0.01 },
      { key: 'specPow',    label: 'specPow',    min: 1,   max: 128, step: 1    },
      { key: 'specStr',    label: 'specStr',    min: 0,   max: 1,   step: 0.01 },
      { key: 'fresnelPow', label: 'fresnelPow', min: 1,   max: 8,   step: 0.1  },
      { key: 'fresnelStr', label: 'fresnelStr', min: 0,   max: 0.5, step: 0.01 },
    ],
  },
  {
    title: '색상 — 바닥',
    sliders: [
      { key: 'bottomR', label: 'R', min: 0, max: 1, step: 0.01 },
      { key: 'bottomG', label: 'G', min: 0, max: 1, step: 0.01 },
      { key: 'bottomB', label: 'B', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: '색상 — 중간',
    sliders: [
      { key: 'midR', label: 'R', min: 0, max: 1, step: 0.01 },
      { key: 'midG', label: 'G', min: 0, max: 1, step: 0.01 },
      { key: 'midB', label: 'B', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: '색상 — 꼭대기',
    sliders: [
      { key: 'topR', label: 'R', min: 0, max: 1, step: 0.01 },
      { key: 'topG', label: 'G', min: 0, max: 1, step: 0.01 },
      { key: 'topB', label: 'B', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: '칼집·눌림',
    sliders: [
      { key: 'creaseDark',  label: 'creaseDark',  min: 0, max: 1,   step: 0.01 },
      { key: 'dentDark',    label: 'dentDark',    min: 0, max: 1,   step: 0.01 },
      { key: 'dentEdgeStr', label: 'dentEdgeStr', min: 0, max: 1.5, step: 0.01 },
      { key: 'dentSSS',     label: 'dentSSS',     min: 0, max: 0.8, step: 0.01 },
    ],
  },
]

function ShaderControls({
  params,
  onChange,
}: {
  params: ShaderParams
  onChange: (key: keyof ShaderParams, value: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      position: 'fixed',
      top: 40,
      right: 0,
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
    }}>
      {/* 토글 버튼 */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'rgba(0,0,0,0.55)',
          color: '#ccc',
          border: 'none',
          borderRadius: '6px 0 0 6px',
          padding: '4px 8px',
          fontSize: 11,
          cursor: 'pointer',
          letterSpacing: 1,
          marginBottom: 2,
        }}
      >
        {open ? '▶ 닫기' : '◀ 파라미터'}
      </button>

      {open && (
        <div style={{
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(6px)',
          borderRadius: '6px 0 0 6px',
          padding: '8px 10px',
          width: 220,
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
          color: '#ddd',
          fontSize: 10,
          fontFamily: 'monospace',
        }}>
          {SLIDER_GROUPS.map(group => (
            <div key={group.title} style={{ marginBottom: 10 }}>
              <div style={{
                color: '#aaa',
                fontWeight: 'bold',
                marginBottom: 4,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                paddingBottom: 2,
              }}>
                {group.title}
              </div>
              {group.sliders.map(s => (
                <div key={s.key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 3,
                }}>
                  <span style={{ width: 76, color: '#bbb', flexShrink: 0 }}>{s.label}</span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={params[s.key]}
                    onChange={e => onChange(s.key, parseFloat(e.target.value))}
                    style={{ flex: 1, accentColor: '#f5c842', cursor: 'pointer' }}
                  />
                  <span style={{ width: 36, textAlign: 'right', color: '#f5c842' }}>
                    {Number(params[s.key]).toFixed(
                      s.step < 0.01 ? 3 : s.step < 0.1 ? 2 : s.step < 1 ? 1 : 0
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}

          <button
            style={{
              marginTop: 4,
              width: '100%',
              background: 'rgba(255,255,255,0.08)',
              color: '#aaa',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              padding: '3px 0',
              fontSize: 10,
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
            onClick={() => {
              Object.keys(DEFAULT_PARAMS).forEach(k => {
                onChange(k as keyof ShaderParams, DEFAULT_PARAMS[k as keyof ShaderParams])
              })
            }}
          >
            기본값으로 리셋
          </button>
        </div>
      )}
    </div>
  )
}

// =============================================
// 씬
// =============================================
function Scene({ callbacks, params }: { callbacks: BunCallbacks; params: ShaderParams }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 3]} intensity={1.2} />
      <directionalLight position={[-2, 2, -2]} intensity={0.3} color="#f5ede0" />
      <BunMesh callbacks={callbacks} params={params} />
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
  const [params, setParams] = useState<ShaderParams>({ ...DEFAULT_PARAMS })

  const handleParamChange = useCallback((key: keyof ShaderParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }))
  }, [])

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

  // 모바일에서 화면 꽉 차는 문제: 세로 좁을수록 카메라를 멀리
  const cameraZ = typeof window !== 'undefined' && window.innerWidth < 640 ? 4.8 : 3.2

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'transparent', position: 'relative' }}>
      <WindowBar />

      <Canvas
        camera={{ position: [0, 0.05, cameraZ], fov: 48 }}
        gl={{ alpha: true }}
        style={{ background: 'transparent', touchAction: 'none' }}
      >
        <Scene callbacks={callbacks} params={params} />
      </Canvas>

      <SteamEffect active={isSteaming} />
      <BurstEffect active={isBursting} onComplete={handleBurstComplete} />
      {process.env.NODE_ENV === 'development' && (
        <ShaderControls params={params} onChange={handleParamChange} />
      )}
    </div>
  )
}
