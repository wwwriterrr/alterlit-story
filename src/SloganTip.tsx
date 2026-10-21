import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Story } from './types';
import { categoryColor } from './StoryAvatar';

export const displayName = (s: Story) => s.author.nickname || s.author.username;

/**
 * Девиз истории — облачко под кружком. Порталом в body с position: fixed: лента обрезает всё,
 * что выходит за её край. Не вылезает за края окна, хвостик смотрит на кружок.
 */
export default function SloganTip({ story, anchor }: { story: Story; anchor: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; above: boolean } | null>(null);

  useLayoutEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const place = () => {
      const a = (anchor.querySelector('.als-avatar') ?? anchor).getBoundingClientRect();
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const margin = 10;
      const cx = a.left + a.width / 2;
      const left = Math.min(Math.max(cx - w / 2, margin), window.innerWidth - w - margin);
      // под кружком; не помещается — над ним
      const above = a.bottom + 12 + h > window.innerHeight && a.top - 12 - h > 0;
      const top = above ? a.top - 12 - h : a.bottom + 12;
      setPos({ left, top, arrow: Math.min(Math.max(cx - left, 18), w - 18), above });
    };
    place();
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [anchor, story]);

  return createPortal(
    <div
      ref={ref}
      className="als-tip"
      role="tooltip"
      id={`als-tip-${story.id}`}
      data-above={pos?.above || undefined}
      style={
        pos
          ? ({ left: pos.left, top: pos.top, '--als-arrow': `${pos.arrow}px` } as React.CSSProperties)
          : { visibility: 'hidden', left: 0, top: 0 }
      }
    >
      {story.slogan ? <p className="als-tip-slogan">{story.slogan}</p> : null}
      <p className="als-tip-meta">
        <b>{displayName(story)}</b>
        {story.category ? (
          <span className="als-tip-cat">
            <i style={{ background: categoryColor(story.category.slug) }} />
            {story.category.title}
          </span>
        ) : null}
      </p>
    </div>,
    document.body,
  );
}
