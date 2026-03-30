"use client";
import { SessionStats } from "@/hooks/useSession";
import { MaterialId } from "@/lib/materials";
import { MATERIALS } from "@/lib/materials";
import { buildShareUrl } from "@/lib/share";

interface Props {
  stats: SessionStats;
  formatTime: (s: number) => string;
  streak: number;
  materialId: MaterialId;
  colorId: string;
  onContinue: () => void;
  onClose: () => void;
}

const EMOJIS = ["😄", "😊", "😐", "😴"];
const EMOJI_LABELS = ["최고야!", "좋았어", "그냥그래", "졸렸어"];

// Rough "favorite material" based on total presses - just use prop for MVP
function getFavMaterial(materialId: MaterialId) {
  return MATERIALS[materialId].label;
}

export function SessionEndCard({
  stats,
  formatTime,
  streak,
  materialId,
  colorId,
  onContinue,
  onClose,
}: Props) {
  const shareUrl = buildShareUrl(materialId, colorId as Parameters<typeof buildShareUrl>[1]);

  const handleShare = async () => {
    const text = `오늘 ${formatTime(stats.elapsedSeconds)} 스퀴시했어! 누르기 ${stats.pressCount}회 · 늘리기 ${stats.stretchCount}회 · 터뜨리기 ${stats.popCount}회\n\n같이 스퀴시해봐 👉 ${shareUrl}`;
    if (navigator.share) {
      await navigator.share({ text, url: shareUrl }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text).catch(() => {});
      alert("링크가 복사됐어!");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex justify-between items-center px-4 pt-4 pb-0">
          <span className="text-base font-semibold">squishy</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-sm flex items-center justify-center hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Main stat */}
          <div className="bg-gray-50 rounded-xl p-5 text-center">
            <p className="text-xs text-gray-400 mb-1">오늘의 스퀴시 기록</p>
            <p className="text-3xl font-semibold text-gray-900">{formatTime(stats.elapsedSeconds)}</p>
            <p className="text-xs text-gray-400 mt-1">
              누르기 {stats.pressCount}회 · 늘리기 {stats.stretchCount}회 · 터뜨리기 {stats.popCount}회
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "연속 방문", value: `${streak}일` },
              { label: "총 스퀴시", value: `${stats.pressCount + stats.stretchCount}회` },
              { label: "최애 재질", value: getFavMaterial(materialId) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-lg font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Emoji feedback */}
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-3">오늘 스퀴시 어땠어?</p>
            <div className="flex justify-center gap-4">
              {EMOJIS.map((emoji, i) => (
                <button
                  key={emoji}
                  title={EMOJI_LABELS[i]}
                  className="text-3xl hover:scale-125 transition-transform active:scale-95"
                  onClick={() => {
                    // MVP: just close after feedback
                    onClose();
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleShare}
              className="w-full py-3 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors"
            >
              기록 공유하기
            </button>
            <button
              onClick={onContinue}
              className="w-full py-3 text-sm text-gray-500 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
            >
              한 번 더 스퀴시
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
