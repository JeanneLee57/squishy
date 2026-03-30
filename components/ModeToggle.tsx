"use client";
import { Mode } from "@/hooks/useSquishyPhysics";

interface Props {
  mode: Mode;
  onChange: (m: Mode) => void;
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex gap-1.5 w-full">
      <button
        onClick={() => onChange("free")}
        className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all duration-150 ${
          mode === "free"
            ? "bg-gray-900 text-white"
            : "bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100"
        }`}
      >
        자유 모드
      </button>
      <button
        onClick={() => onChange("pop")}
        className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all duration-150 ${
          mode === "pop"
            ? "bg-gray-900 text-white"
            : "bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100"
        }`}
      >
        터뜨리기
      </button>
    </div>
  );
}
