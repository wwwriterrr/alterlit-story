// Даты — как в комментариях и сообщениях.
// С сервера они приходят без часового пояса (USE_TZ=False) — это время сервера, Москва.
const SERVER_OFFSET = '+03:00';

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const full = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
const stamp = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const parseDate = (value: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : value + SERVER_OFFSET);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** «14:05», «вчера, 14:05», «3 октября, 14:05», «3 октября 2024 г., 14:05». */
export function formatDate(value: string) {
  const d = parseDate(value);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  const hm = time.format(d);
  if (days === 0) return hm;
  if (days === 1) return `вчера, ${hm}`;
  const day = d.getFullYear() === new Date().getFullYear() ? dayMonth.format(d) : dayMonthYear.format(d);
  return `${day}, ${hm}`;
}

/** Подсказка: «14 октября 2026 г. в 14:05». */
export const formatFullDate = (value: string) => full.format(parseDate(value));

/** «Публикация отложена до 17.10.2026 18:00» */
export const formatStamp = (value: string) => stamp.format(parseDate(value)).replace(',', '');

export const isFuture = (value: string) => parseDate(value).getTime() > Date.now();
