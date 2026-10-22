import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Горизонтальная лента: на телефоне — обычная прокрутка пальцем, мышью — перетаскивание,
 * кнопки «назад/вперёд», колесо с Shift и тачпад — как обычно. Отдаёт, можно ли листать в
 * каждую сторону (кнопки и затухание по краям).
 */
export function useScroller(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const [edges, setEdges] = useState({ prev: false, next: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges((e) => {
      const prev = el.scrollLeft > 2;
      const next = el.scrollLeft < max - 2;
      return e.prev === prev && e.next === next ? e : { prev, next };
    });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, update, ...deps]);

  // перетаскивание мышью; клик после перетаскивания по ссылке не срабатывает
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0;
    let startLeft = 0;
    let id: number | null = null;
    let dragged = false;

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      // скелетон не листается
      if (el.getAttribute('aria-busy') === 'true') return;
      id = e.pointerId;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      dragged = false;
    };
    const move = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) < 6) return;
      if (!dragged) {
        dragged = true;
        el.setPointerCapture(e.pointerId);
        el.dataset.dragging = '';
      }
      el.scrollLeft = startLeft - dx;
    };
    const up = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      id = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      delete el.dataset.dragging;
    };
    const click = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // ссылки и картинки не должны «утаскиваться» браузером
    const dragstart = (e: DragEvent) => e.preventDefault();

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('dragstart', dragstart);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('dragstart', dragstart);
    };
  }, [ref]);

  const page = useCallback(
    (dir: 1 | -1) => {
      const el = ref.current;
      if (!el) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: reduce ? 'auto' : 'smooth' });
    },
    [ref],
  );

  return { ...edges, page };
}
