const KEY = 'zs-best-score';

export function getBest() {
  try {
    return Number(window.localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Сохраняет рекорд, если больше текущего. Возвращает true, если рекорд обновлён */
export function saveBest(score) {
  if (!Number.isFinite(score) || score <= 0) return false;
  try {
    if (score > getBest()) {
      window.localStorage.setItem(KEY, String(Math.floor(score)));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
