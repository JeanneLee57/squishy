"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export interface SessionStats {
  elapsedSeconds: number;
  pressCount: number;
  stretchCount: number;
  popCount: number;
}

export function useSession() {
  const [stats, setStats] = useState<SessionStats>({
    elapsedSeconds: 0,
    pressCount: 0,
    stretchCount: 0,
    popCount: 0,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setStats((s) => ({ ...s, elapsedSeconds: s.elapsedSeconds + 1 }));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const recordPress = useCallback(() => {
    setStats((s) => ({ ...s, pressCount: s.pressCount + 1 }));
  }, []);

  const recordStretch = useCallback(() => {
    setStats((s) => ({ ...s, stretchCount: s.stretchCount + 1 }));
  }, []);

  const recordPop = useCallback(() => {
    setStats((s) => ({ ...s, popCount: s.popCount + 1 }));
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}분 ${String(s).padStart(2, "0")}초`;
  };

  return { stats, formatTime, recordPress, recordStretch, recordPop };
}
