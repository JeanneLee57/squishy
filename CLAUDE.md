# CLAUDE.md — Squishy 프로젝트 컨텍스트

## 프로젝트 개요

**Squishy**는 인터랙티브 3D 데스크탑 토이 앱이다. 화면에 떠 있는 찐빵을 누르고, 쥐고, 폭발시킬 수 있는 스트레스 해소용 장난감이다.  
Electron 위에서 Next.js + React Three Fiber로 돌아가며, 커스텀 GLSL 셰이더와 절차적 Web Audio 합성이 핵심 기술이다.

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js ^16.2.1 (App Router), React ^19 |
| 3D | Three.js ^0.183, @react-three/fiber ^9, @react-three/drei ^10 |
| 제스처 | @use-gesture/react ^10 |
| 스타일 | Tailwind CSS ^3 |
| 데스크탑 | Electron ^41 |
| 언어 | TypeScript ^5 |
| 빌드 도구 | concurrently, wait-on |

---

## 디렉토리 구조

```
squishy/
├── app/
│   ├── layout.tsx          # 루트 레이아웃 + 메타데이터
│   ├── page.tsx            # 홈 페이지 — <Bun /> 렌더링
│   └── globals.css         # 전역 스타일 + CSS 애니메이션 keyframes
├── components/
│   ├── Bun.tsx             # 핵심 컴포넌트 (약 810줄) — 찐빵 전체 로직
│   └── WindowBar.tsx       # Electron 커스텀 타이틀바
├── electron/
│   ├── main.js             # Electron 메인 프로세스 — 창 생성, IPC
│   └── preload.js          # IPC 브릿지 (window.electron 노출)
├── lib/
│   └── sound.ts            # Web Audio API 절차적 음향 합성
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── postcss.config.mjs
```

---

## 핵심 컴포넌트 상세

### `components/Bun.tsx`

프로젝트의 심장. 다음을 모두 담고 있다:

**서브컴포넌트:**
- `BunMesh` — Three.js 메시 + 커스텀 셰이더 머티리얼 + 입력 처리
- `SteamEffect` — 8개 CSS 위스프가 위로 올라가는 증기 효과
- `BurstEffect` — 24개 파티클 div, 랜덤 궤적으로 폭발
- `ShaderControls` — 개발 모드 전용 실시간 슬라이더 패널 (31개 파라미터)

**애니메이션 상태 머신:**
```
normal ──(누르기 시작)──► 충전 중 ──(3.8초 초과)──► burst ──► regen ──► normal
                               ↓
                       강도/열/팽창/붉은 틴트 누적
```

**주요 타이밍 상수:**
- `BURST_TIME` = 3.8s (폭발 임계값)
- `INFLATE_START` = 2.0s (부풀기 시작)
- `HEAT_GAIN` = 0.5/s (열 누적 속도)
- `STEAM_THRESHOLD` = 1.5 (증기 효과 발동 열량)
- `REGEN_DURATION` = 1.5s (탄성 복귀 시간)

**셰이더 파라미터 (`DEFAULT_PARAMS`, 31개):**
- 크리스 형태: `basePinch`, `creasePinch`, `creaseSink`, `creaseBot`, `creaseTop`
- 누름 자국: `dentDepth`, `pressRadius`
- 조명: `ambient`, `diffuse`, `wrap`, `specPow`, `specStr`, `fresnelPow`, `fresnelStr`
- 색상: `bottomR/G/B`, `midR/G/B`, `topR/G/B`
- 그림자/효과: `creaseDark`, `dentDark`, `dentEdgeStr`, `dentSSS`

**셰이더 구조:**
- Vertex shader: LatheGeometry 빵 형태, 크리스 변형, 가우시안 누름 자국, 팽창, 흔들림
- Fragment shader: 그라디언트 색상 (하단 금색 → 중간 크림 → 상단 앰버), 조명 (ambient + diffuse + wrap + specular + Fresnel rim + SSS)

**지오메트리:**
- `LatheGeometry` — 10개 프로필 포인트를 Y축 기준 64세그먼트 회전
- `mergeVertices()` 로 중복 버텍스 합산 (노말 계산 정확도 향상)

### `lib/sound.ts`

오디오 파일 없이 Web Audio API로 모든 소리를 절차적으로 합성:
- `playPoof()` — 누를 때: 화이트 노이즈 → 로우패스 필터 스윕 (600→150 Hz)
- `playBoing()` — 뗄 때: 사인파 피치 벤드 (320→80 Hz), 스프링 감쇠
- `playPop()` — 폭발: 밴드패스 노이즈 스윕 + 베이스 쿵
- 증기 루프: 4kHz 하이패스 노이즈, 열량에 따라 볼륨 조절
- **중요**: AudioContext는 첫 사용자 제스처 시 지연 초기화 (브라우저 정책)

### `electron/main.js`

- 창 크기: 400×480, 프레임리스, 투명 배경
- `alwaysOnTop: true` (항상 다른 창 위에 표시)
- 개발: `http://localhost:3000` 로드, 프로덕션: 정적 HTML 로드
- IPC 핸들러: 창 드래그, 최소화, 닫기

### `components/WindowBar.tsx`

- Electron 환경에서만 렌더링 (웹에서는 숨김)
- macOS 스타일 노란(최소화) + 빨간(닫기) 버튼
- 드래그 이벤트 → Electron IPC 포워딩

---

## 개발 스크립트

```bash
npm run dev        # Next.js 개발 서버만 (포트 3000)
npm run build      # Next.js 프로덕션 빌드
npm run start      # 프로덕션 서버 실행
npm run electron   # Electron만 실행 (개발 모드)
npm run app        # 전체 개발 워크플로우 (권장)
                   # = Next.js 서버 시작 + 준비되면 Electron 자동 실행
```

**일반적인 개발 흐름:** `npm run app` 하나로 전부 된다.

---

## 코딩 컨벤션

1. **파일 네이밍**: 컴포넌트는 PascalCase (`Bun.tsx`), 유틸리티는 lowercase (`sound.ts`)
2. **클라이언트 컴포넌트**: 인터랙티브 3D 컴포넌트는 상단에 `'use client'` 선언
3. **성능 최적화**: 지오메트리/유니폼/파라미터 등 비싼 연산은 `useMemo`로 메모이제이션, 콜백은 `useCallback`
4. **섹션 구분**: `// ===== 섹션명 =====` 형태로 코드 블록 구분
5. **언어 혼용**: 주석과 변수명이 한국어/영어 혼용 (작성자가 한국어 화자)
6. **셰이더 주석**: 각 수학 연산에 목적 설명 인라인 주석 작성
7. **TypeScript**: strict 모드, 인터페이스 명시 (`ShaderParams`, `BunCallbacks`, `SliderDef`)

---

## 주목할 특이사항

- **완전 절차적 오디오**: WAV/MP3 파일 없음, 모든 소리는 Web Audio API로 실시간 합성
- **투명 창**: Electron 프레임리스 + 투명 배경으로 찐빵만 화면에 떠 보임
- **항상 위**: `alwaysOnTop` — 다른 창 위에 항상 표시
- **개발 모드 디버그 패널**: `NODE_ENV === 'development'`일 때만 31개 셰이더 파라미터 슬라이더 노출
- **한국어 UI**: 앱 내 텍스트와 주석에 한국어 다수 사용
- **따뜻한 색 팔레트**: 찐빵 색상이 금색→크림→앰버이며, 그림자도 회색이 아닌 따뜻한 톤

---

## 프로젝트 현재 상태 (2026-04 기준)

- `page.tsx`에 이전 풀 앱 코드(세션 트래킹, 소재, 공유, 일일 챌린지)가 주석 처리된 채 남아있음
- 현재는 셰이더 아트와 찐빵 퍼펙셔닝에 집중하는 단계
- 원래 MVP는 스프링 물리 기반 blob 시뮬레이션이었으나, 현재는 GLSL 셰이더 기반 3D 렌더링으로 전환 완료

---

## 자주 수정하는 지점

| 목적 | 위치 |
|------|------|
| 찐빵 외형/조명 튜닝 | `Bun.tsx` → `DEFAULT_PARAMS` 객체 |
| 셰이더 로직 변경 | `Bun.tsx` → `vertexShader` / `fragmentShader` 문자열 |
| 상태 머신/애니메이션 | `Bun.tsx` → `BunMesh` 컴포넌트 내 `useFrame` |
| 소리 변경 | `lib/sound.ts` |
| Electron 창 설정 | `electron/main.js` |
| CSS 애니메이션 | `app/globals.css` |
