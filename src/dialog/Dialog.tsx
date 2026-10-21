import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Окно — нативный <dialog> (showModal): затемнение, фокус и Esc от браузера.
 * Порталом в body: ярмарка прилипает к шапке (position: fixed) и обрезает всё по краям.
 */
export default function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // страница под окном не прокручивается
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className="als-dialog"
      aria-label={title}
      onClose={onClose}
      // клик по затемнению (вне окна) закрывает
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
      // клики не уходят в старые обработчики base.html на body
      onClick={(e) => e.nativeEvent.stopPropagation()}
    >
      <div className="als-d-box">
        <button type="button" className="als-d-close" aria-label="Закрыть" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 className="als-d-title">{title}</h2>
        <div className="als-d-body">{children}</div>
      </div>
    </dialog>,
    document.body,
  );
}
