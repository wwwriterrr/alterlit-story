// С сервера даты приходят без часового пояса (USE_TZ=False) — это время сервера, Москва.
const SERVER_OFFSET = '+03:00';
const parse = (v: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + SERVER_OFFSET);

const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const dayYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

/** «3 окт.», в прошлые годы — «3 окт. 2024 г.» */
export function formatDay(value: string) {
  const d = parse(value);
  return (d.getFullYear() === new Date().getFullYear() ? day : dayYear).format(d);
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

const num = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/** «100 литов», «1 лит», «2,5 лита» */
export function lits(n: number) {
  const word = Number.isInteger(n) ? plural(n, 'лит', 'лита', 'литов') : 'лита';
  return `${num.format(n)} ${word}`;
}
