import { useState } from 'react';

interface Roll {
  /** что показываем */
  value: number;
  /** что было до изменения */
  old: number;
  /** куда крутить: больше — новая цифра сверху, меньше — снизу; null — покой */
  dir: 'up' | 'down' | null;
  /** номер изменения — новый key, анимация с начала при быстрых кликах */
  n: number;
}

/** 0 у счётчиков сайта не пишется — пусто. */
const text = (v: number) => (v ? String(v) : '');

/**
 * Число «барабаном»: при росте новые цифры спускаются сверху, старые уходят вниз; при
 * уменьшении — наоборот. Крутятся только изменившиеся разряды (12→13 — последний, 9→10 — оба).
 */
export default function RollingNumber({ value }: { value: number }) {
  const [roll, setRoll] = useState<Roll>({ value, old: value, dir: null, n: 0 });
  // новое значение — запоминаем прежнее и направление (обновление при рендере, без эффекта)
  if (roll.value !== value) {
    setRoll({ value, old: roll.value, dir: value > roll.value ? 'up' : 'down', n: roll.n + 1 });
  }

  const cur = text(roll.value);
  // и в покое — та же обёртка, чтобы до и после прокрутки число стояло на одном месте
  if (!roll.dir) return <span className="als-roll">{cur}</span>;

  const old = text(roll.old);
  const len = Math.max(cur.length, old.length);
  const a = cur.padStart(len, ' ');
  const b = old.padStart(len, ' ');
  // разряды крутятся одинаково долго — по концу любого возвращаемся к простому числу
  const n = roll.n;
  const done = () => setRoll((r) => (r.n === n ? { ...r, dir: null } : r));

  return (
    <span className="als-roll" aria-label={cur || '0'}>
      {Array.from(a, (ch, i) => {
        if (ch === b[i]) return <span key={i} aria-hidden="true">{ch.trim()}</span>;
        return (
          <span key={`${roll.n}-${i}`} className={`als-digit als-digit--${roll.dir}`} aria-hidden="true">
            <span className="als-digit-in" onAnimationEnd={done}>
              {ch.trim()}
            </span>
            <span className="als-digit-out">{b[i].trim()}</span>
          </span>
        );
      })}
    </span>
  );
}
