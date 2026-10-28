const PROGRESS_KEY = "hanjie_progress_v2";
const AUDIO_KEY = "hanjie_audio_v2";
let unavailable = false;

// 隔离隐私模式、损坏存档与容量限制，存储不可用时仍可游戏。
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    unavailable = true;
  }
}
export function loadProgress() {
  const raw = read(PROGRESS_KEY, []);
  return Array.from({ length: 9 }, (_, i) => {
    const entry = Array.isArray(raw) ? raw[i] : null;
    return {
      stars: Math.max(0, Math.min(3, Math.floor(Number(entry?.stars) || 0))),
      best: Math.max(0, Number(entry?.best) || 0),
    };
  });
}
export function saveProgress(progress) {
  write(PROGRESS_KEY, progress);
}
export function storageUnavailable() {
  return unavailable;
}
export function loadAudio() {
  const raw = read(AUDIO_KEY, {});
  return {
    effects: raw?.effects !== false,
    music: raw?.music !== false,
    volume: Math.max(
      0,
      Math.min(1, Number.isFinite(raw?.volume) ? raw.volume : 0.55),
    ),
  };
}
export function saveAudio(settings) {
  write(AUDIO_KEY, settings);
}
