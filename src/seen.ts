/**
 * Просмотренные истории — как в известных лентах историй: круг просмотренной становится серым.
 * Только в этом браузере (localStorage): это удобство для читателя, а не данные сайта.
 */
const KEY = 'als-seen';
const MAX = 300;

function load(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

let ids = load();

export function isSeen(id: number) {
  return ids.includes(id);
}

export function markSeen(id: number) {
  if (ids.includes(id)) return;
  ids = [id, ...ids].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* приватный режим — просто не запомним */
  }
}
