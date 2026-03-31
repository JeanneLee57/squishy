"use client";

// ============================================================
// 기존 스퀴시 앱 코드 — 연습 중 임시 주석처리
// 다시 활성화하려면 아래 블록 주석 해제 후 BunPractice 제거
// ============================================================

/*
import { useState, useEffect, useCallback, useRef } from "react";
import { WebGLBlob } from "@/components/WebGLBlob";
import { CustomizationBar } from "@/components/CustomizationBar";
import { ModeToggle } from "@/components/ModeToggle";
import { SessionEndCard } from "@/components/SessionEndCard";
import { MATERIALS, MaterialId } from "@/lib/materials";
import { COLORS, ColorId } from "@/lib/colors";
import { getDailySquish } from "@/lib/daily";
import { updateStreak, getStreak } from "@/lib/cookies";
import { parseShareParams, buildShareUrl } from "@/lib/share";
import { useSession } from "@/hooks/useSession";
import { Mode } from "@/hooks/useSquishyPhysics";

export default function Home() {
  const daily = getDailySquish();
  const [isReady, setIsReady] = useState(false);
  const [material, setMaterial] = useState<MaterialId>(daily.material.id);
  const [color, setColor] = useState<ColorId>(daily.color.id);
  const [mode, setMode] = useState<Mode>("free");
  const [streak, setStreak] = useState(0);
  const [isPopping, setIsPopping] = useState(false);
  const [showEndCard, setShowEndCard] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { stats, formatTime, recordPress, recordStretch, recordPop } = useSession();

  // Init: parse share params, update streak, then show UI
  useEffect(() => {
    const params = parseShareParams();
    if (params.material) setMaterial(params.material);
    if (params.color) setColor(params.color);
    const s = updateStreak();
    setStreak(s);

    // 0.5s landing delay as per design intent
    const t = setTimeout(() => setIsReady(true), 500);
    return () => clearTimeout(t);
  }, []);

  // Idle detection — show session end card after 60s of no interaction
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setShowEndCard(true), 60_000);
  }, []);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  const handlePop = useCallback(() => {
    recordPop();
    setIsPopping(true);
    setTimeout(() => setIsPopping(false), 700);
    resetIdleTimer();
  }, [recordPop, resetIdleTimer]);

  const handlePress = useCallback(() => {
    recordPress();
    resetIdleTimer();
  }, [recordPress, resetIdleTimer]);

  const handleStretch = useCallback(() => {
    recordStretch();
    resetIdleTimer();
  }, [recordStretch, resetIdleTimer]);

  const handleShare = useCallback(async () => {
    const url = buildShareUrl(material, color);
    const text = `오늘의 스퀴시를 같이 해봐! 👉 ${url}`;
    if (navigator.share) {
      await navigator.share({ text, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      alert("링크 복사됨!");
    }
  }, [material, color]);

  const handleDailySquish = useCallback(() => {
    setMaterial(daily.material.id);
    setColor(daily.color.id);
  }, [daily]);

  const formatTimer = () => {
    const m = Math.floor(stats.elapsedSeconds / 60);
    const s = stats.elapsedSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")} 스퀴시 중`;
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div
          className="text-2xl font-semibold text-gray-800"
          style={{
            animation: "fade-in 0.3s ease-out forwards",
            opacity: 0,
          }}
        >
          squishy
        </div>
      </div>
    );
  }

  return (
    <main
      className="min-h-screen bg-white flex items-center justify-center"
      style={{ touchAction: "none" }}
    >
      <div className="w-full max-w-xs px-4 py-6 flex flex-col gap-4 animate-fade-in">
        <div className="flex justify-between items-center">
          <span className="text-base font-semibold text-gray-900">squishy</span>
          <div className="flex gap-2 items-center">
            {streak > 0 && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                {streak}일 연속
              </span>
            )}
            <button className="w-7 h-7 rounded-full bg-gray-100 text-xs text-gray-400 flex items-center justify-center hover:bg-gray-200 transition-colors">
              ?
            </button>
          </div>
        </div>

        <div className="text-center">
          <span className="text-xs text-gray-400">{formatTimer()}</span>
        </div>

        <div className="flex items-center justify-center py-4">
          <WebGLBlob
            material={MATERIALS[material]}
            color={COLORS[color]}
            mode={mode}
            onPop={handlePop}
            onPress={handlePress}
            onStretch={handleStretch}
            isPopping={isPopping}
          />
        </div>

        <CustomizationBar
          selectedMaterial={material}
          selectedColor={color}
          onMaterialChange={setMaterial}
          onColorChange={setColor}
        />

        <ModeToggle mode={mode} onChange={setMode} />

        <div className="flex justify-center gap-0 pt-2 border-t border-gray-50">
          <button
            onClick={handleShare}
            className="flex-1 text-xs text-gray-400 py-2.5 hover:text-gray-600 transition-colors"
          >
            공유
          </button>
          <button
            onClick={handleDailySquish}
            className="flex-1 text-xs text-gray-400 py-2.5 hover:text-gray-600 transition-colors"
          >
            오늘의 스퀴시
          </button>
          <button className="flex-1 text-xs text-gray-400 py-2.5 hover:text-gray-600 transition-colors">
            소리 ON
          </button>
        </div>
      </div>

      {showEndCard && (
        <SessionEndCard
          stats={stats}
          formatTime={formatTime}
          streak={streak}
          materialId={material}
          colorId={color}
          onContinue={() => {
            setShowEndCard(false);
            resetIdleTimer();
          }}
          onClose={() => setShowEndCard(false)}
        />
      )}
    </main>
  );
}
*/

// ============================================================
// 현재 활성: 찐빵 연습 컴포넌트
// ============================================================

import { BunPractice } from "@/components/BunPractice";

export default function Home() {
  return <BunPractice />;
}
