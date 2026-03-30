const STREAK_KEY = "squishy_streak";
const LAST_VISIT_KEY = "squishy_last_visit";

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function getStreak(): number {
  if (typeof document === "undefined") return 0;
  const raw = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(STREAK_KEY + "="));
  return raw ? parseInt(raw.split("=")[1], 10) : 0;
}

export function getLastVisit(): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(LAST_VISIT_KEY + "="));
  return raw ? raw.split("=")[1].trim() : null;
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

export function updateStreak(): number {
  const today = toDateStr(new Date());
  const lastVisit = getLastVisit();
  const currentStreak = getStreak();

  let newStreak: number;
  if (!lastVisit) {
    newStreak = 1;
  } else if (lastVisit === today) {
    return currentStreak; // Already visited today
  } else {
    const yesterday = toDateStr(new Date(Date.now() - 86400000));
    newStreak = lastVisit === yesterday ? currentStreak + 1 : 1;
  }

  setCookie(STREAK_KEY, String(newStreak));
  setCookie(LAST_VISIT_KEY, today);
  return newStreak;
}
