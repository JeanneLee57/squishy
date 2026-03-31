'use client'

/**
 * BunPractice.tsx - 찐빵 셰이더 연습
 *
 * 학습 단계:
 * ✅ 1단계: LatheGeometry로 찐빵 형태
 * ✅ 2단계: 커스텀 셰이더 + 클릭 시 말랑 들어감  ← 지금 여기
 *    - 버텍스 셰이더: 클릭 지점 주변 정점을 안쪽으로 밀어넣기
 *    - 프래그먼트 셰이더: 디퓨즈 조명 + 눌린 곳 색상 변화
 * □ 3단계: 서브서피스 스캐터링 (빛 투과)
 * □ 4단계: 드래그로 늘리기
 */

import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useMemo, useRef } from 'react'

// =============================================
// 셰이더 코드
// =============================================

/**
 * 버텍스 셰이더 (Vertex Shader)
 * 역할: 각 정점(vertex)의 위치를 결정한다
 *
 * 핵심 아이디어:
 *   클릭한 지점에서 가까운 정점일수록 → 법선(normal) 방향 안쪽으로 밀어넣기
 *   = 가우시안 감쇠 (Gaussian falloff)
 *
 * Three.js가 자동으로 넣어주는 변수들 (선언 없이 사용 가능):
 *   - position: 정점 위치 (로컬 좌표)
 *   - normal: 정점 법선 벡터
 *   - projectionMatrix, modelViewMatrix, modelMatrix, normalMatrix
 */
const vertexShader = /* glsl */ `
  // === 유니폼: JS에서 셰이더로 전달하는 값 ===
  uniform vec3 uPressPoint;     // 클릭한 위치 (로컬 좌표)
  uniform float uPressStrength; // 눌림 세기 (0 = 안 눌림, 1 = 최대)
  uniform float uPressRadius;   // 눌림이 영향을 미치는 반경

  // === 베어링(varying): 버텍스 → 프래그먼트로 전달하는 값 ===
  varying vec3 vNormal;    // 법선 (조명 계산용)
  varying vec3 vPosition;  // 변형 후 위치
  varying float vDent;     // 이 정점이 얼마나 들어갔는지 (0~1)

  void main() {
    // 1) 클릭 지점과 이 정점 사이의 거리
    float dist = distance(position, uPressPoint);

    // 2) 가우시안 감쇠: e^(-d²/2σ²)
    //    dist=0 → 1.0 (최대 변형), dist가 클수록 → 0에 수렴
    float gaussian = exp(-(dist * dist) / (2.0 * uPressRadius * uPressRadius));
    float dent = uPressStrength * gaussian;

    // 3) 법선 방향의 안쪽(-)으로 밀어넣기
    //    0.12 = 최대 들어가는 깊이 (바꿔보면서 감 잡기)
    vec3 displaced = position - normal * dent * 0.4;

    // 프래그먼트 셰이더로 전달
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
    vDent = dent;

    // 최종 화면 좌표
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`

/**
 * 프래그먼트 셰이더 (Fragment Shader)
 * 역할: 각 픽셀의 최종 색상을 결정한다
 *
 * 지금은 디퓨즈(Lambertian) + wrap 조명.
 * 눌린 부분은 살짝 어둡고 따뜻한 색 → "말랑 반죽" 느낌.
 */
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;      // 기본 색상
  uniform vec3 uLightDir;   // 광원 방향

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDent;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightDir);

    // --- 디퓨즈 조명 (Lambertian) ---
    // dot(N, L): 법선과 광원 방향의 내적
    // 빛을 정면으로 받으면 1.0, 옆이면 0.0
    float diffuse = max(dot(N, L), 0.0);

    // wrap lighting: 뒷면도 약간 밝혀줌
    // 찐빵 반죽은 빛이 살짝 투과하니까 완전 깜깜하면 안 됨
    float wrap = max(dot(N, L) * 0.5 + 0.5, 0.0);

    float brightness = 0.25 + diffuse * 0.45 + wrap * 0.3;
    brightness *= (1.0 - vDent * 0.15);

    // --- 눌린 부분 색상 변화 ---
    // 반죽이 눌리면 그림자 + 살짝 따뜻해짐
    vec3 dentColor = uColor * 0.7 + vec3(0.06, 0.01, -0.02);
    vec3 color = mix(uColor, dentColor, vDent);

    gl_FragColor = vec4(color * brightness, 1.0);
  }
`

// =============================================
// 찐빵 Mesh 컴포넌트
// =============================================

function BunMesh() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  // 눌림 상태 (ref로 관리: 리렌더 없이 매 프레임 업데이트)
  const press = useRef({
    point: new THREE.Vector3(0, -10, 0), // 화면 밖 초기값
    strength: 0,
    held: false,       // 지금 누르고 있는 중인지
    recovering: false,
  })

  // === 조절 가능한 파라미터 ===
  const MAX_DEPTH = 1.0     // 최대 눌림 깊이 (0~1, 이 값 × 셰이더의 0.3 = 실제 깊이)
  const CHARGE_SPEED = 3.0  // 눌림 속도 (클수록 빨리 깊어짐)
  //   약 0.5초에 50% 도달, 1.5초에 95% 도달 (지수 접근)

  // 셰이더 유니폼
  const uniforms = useMemo(() => ({
    uPressPoint:    { value: new THREE.Vector3(0, -10, 0) },
    uPressStrength: { value: 0.0 },
    uPressRadius:   { value: 0.35 },  // 클수록 넓게 움푹
    uColor:         { value: new THREE.Color('#f0d9b5') },
    uLightDir:      { value: new THREE.Vector3(3, 5, 3).normalize() },
  }), [])

  // 찐빵 지오메트리 (1단계에서 만든 것과 동일)
  const geometry = useMemo(() => {
    const spline = new THREE.SplineCurve([
      new THREE.Vector2(0.001, -0.25),
      new THREE.Vector2(0.40,  -0.25),
      new THREE.Vector2(0.72,  -0.24),
      new THREE.Vector2(0.90,  -0.15),
      new THREE.Vector2(0.96,   0.00),
      new THREE.Vector2(0.88,   0.20),
      new THREE.Vector2(0.74,   0.32),
      new THREE.Vector2(0.50,   0.42),
      new THREE.Vector2(0.25,   0.47),
      new THREE.Vector2(0.002,  0.49),
    ])
    const profilePoints = spline.getPoints(60)
    const geo = new THREE.LatheGeometry(profilePoints, 48)
    geo.computeVertexNormals()
    return geo
  }, [])

  // 매 프레임: 눌림 충전 + 복원 애니메이션
  useFrame((_, delta) => {
    if (!matRef.current) return
    const p = press.current

    if (p.held) {
      // 누르고 있는 동안: 지수 접근 (exponential approach)
      // strength가 MAX_DEPTH에 점점 가까워짐
      // 공식: strength += (목표 - 현재) × 속도 × delta
      //   → 처음엔 빠르게, MAX_DEPTH 근처에선 느리게 (말랑한 느낌)
      p.strength += (MAX_DEPTH - p.strength) * CHARGE_SPEED * delta
    } else if (p.recovering) {
      // 손 뗀 후: 지수 감쇠로 부드럽게 복원
      p.strength *= Math.pow(0.02, delta)
      if (p.strength < 0.005) {
        p.strength = 0
        p.recovering = false
      }
    }

    matRef.current.uniforms.uPressStrength.value = p.strength
  })

  // 클릭: 눌림 시작
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const p = press.current

    // e.point = 레이캐스트 교차점 (월드 좌표 = 로컬 좌표, 메시 변환 없으므로)
    p.point.copy(e.point)
    p.held = true
    p.recovering = false
    // strength는 0에서 시작 → useFrame에서 점진적으로 증가

    matRef.current!.uniforms.uPressPoint.value.copy(e.point)
  }

  // 뗌: 충전 중단 → 복원 시작
  const handlePointerUp = () => {
    press.current.held = false
    press.current.recovering = true
  }

  return (
    <mesh
      geometry={geometry}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      castShadow
      receiveShadow
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
// 씬
// =============================================

function Scene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[3, 5, 3]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-2, 2, -2]} intensity={0.3} color="#b0c4de" />

      <BunMesh />

      <Grid
        position={[0, -0.26, 0]}
        args={[6, 6]}
        cellSize={0.3}
        cellThickness={0.5}
        cellColor="#aaaaaa"
        sectionSize={1.5}
        sectionThickness={1}
        sectionColor="#666666"
        fadeDistance={8}
        fadeStrength={1}
        infiniteGrid={false}
      />

      <OrbitControls
        target={[0, 0.1, 0]}
        minDistance={1.5}
        maxDistance={6}
        enablePan={false}
      />
    </>
  )
}

// =============================================
// 메인 컴포넌트
// =============================================

export function BunPractice() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e', position: 'relative' }}>
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 10,
        color: 'white',
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 1.6,
        background: 'rgba(0,0,0,0.5)',
        padding: '10px 14px',
        borderRadius: 8,
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>찐빵 연습 #2 — 커스텀 셰이더 + 클릭 눌림</div>
        <div style={{ color: '#aaa' }}>클릭: 말랑 눌림 | 드래그: 회전 | 스크롤: 줌</div>
        <div style={{ color: '#aaa', marginTop: 4 }}>파일: components/BunPractice.tsx</div>
      </div>

      <Canvas
        camera={{ position: [1.5, 1.0, 2.5], fov: 45 }}
        shadows
      >
        <Scene />
      </Canvas>
    </div>
  )
}
