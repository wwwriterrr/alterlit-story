import { useEffect, useState } from 'react';

export type Dock = 'static' | 'shown' | 'hidden';

const UNDOCK_Y = 70; // выше — ярмарка на своём месте
const DOCK_Y = 200; // ниже — прилипает к шапке
const TURN = 8; // столько пикселей в одну сторону — смена направления (без дрожания)

/**
 * Ярмарка при прокрутке (как раньше с ScrollMagic): ниже 200px прилипает под шапку в
 * компактном виде; листаешь вниз — уезжает, вверх — возвращается. Вернулся наверх — снова
 * на своём месте. Отступ сверху — по нижнему краю шапки сайта (высота у неё меняется).
 */
export function useDock(root: HTMLElement): Dock {
  const [dock, setDock] = useState<Dock>('static');

  useEffect(() => {
    let last = window.scrollY;
    let turnFrom = last;
    let dir: 1 | -1 = 1;
    let state: Dock = 'static';
    let frame = 0;

    const headerBottom = () => {
      const h = document.querySelector('body > * header, header');
      if (!h) return 0;
      const pos = getComputedStyle(h).position;
      return pos === 'fixed' || pos === 'sticky' ? Math.max(0, h.getBoundingClientRect().bottom) : 0;
    };

    const apply = () => {
      frame = 0;
      const y = window.scrollY;
      const d = y > last ? 1 : y < last ? -1 : dir;
      if (d !== dir) {
        dir = d;
        turnFrom = last;
      }
      last = y;
      let next: Dock = state;
      if (y <= UNDOCK_Y) next = 'static';
      else if (state === 'static') next = y >= DOCK_Y ? 'hidden' : 'static';
      else if (Math.abs(y - turnFrom) >= TURN) next = dir > 0 ? 'hidden' : 'shown';
      root.style.setProperty('--als-top', `${headerBottom()}px`);
      if (next !== state) {
        state = next;
        setDock(next);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [root]);

  return dock;
}
