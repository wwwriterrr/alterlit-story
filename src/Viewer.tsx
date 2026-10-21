import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Story, StoryDetail } from './types';
import { ApiError, getStory, toggleLike } from './api';
import { StoryAvatar, categoryColor } from './StoryAvatar';
import { displayName } from './SloganTip';
import { formatDate, formatFullDate } from './date';
import { markSeen } from './seen';
import { Comment, Like } from './icons';
import RollingNumber from './RollingNumber';

// ── загруженные истории: одна загрузка на историю, соседние — заранее ──
const cache = new Map<number, Promise<StoryDetail>>();
function load(id: number) {
  let p = cache.get(id);
  if (!p) {
    p = getStory(id);
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p;
}

/**
 * Просмотр ярмарки «как сториз»: история во весь экран (на широком — карточкой-кадром на фоне
 * размытой картинки поста), влево-вправо по ярмарке без таймера. Стрелки, клавиши ←/→,
 * свайп; Esc, крестик и «Назад» в браузере — закрыть.
 */
export default function Viewer({
  items,
  index,
  guest,
  onIndex,
  onClose,
}: {
  items: Story[];
  index: number;
  guest: boolean;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const story = items[index];
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [error, setError] = useState('');
  const [dir, setDir] = useState<1 | -1>(1);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError('');
    markSeen(story.id);
    load(story.id)
      .then((d) => alive && setDetail(d))
      .catch((e: ApiError) => alive && setError(e.message));
    // соседние — заранее, чтобы листалось без ожидания
    for (const k of [index + 1, index - 1]) if (items[k]) load(items[k].id).catch(() => {});
    return () => {
      alive = false;
    };
  }, [story.id, index, items]);

  const go = useCallback(
    (step: 1 | -1) => {
      const next = index + step;
      if (next < 0 || next >= items.length) return;
      setDir(step);
      onIndex(next);
    },
    [index, items.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // свайп влево-вправо (вертикальная прокрутка текста не мешает)
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 800) go(dx < 0 ? 1 : -1);
  };

  const prevStory = items[index - 1];
  const nextStory = items[index + 1];
  const bg = detail?.id === story.id ? detail.image?.src : undefined;
  const [c1, c2] = [categoryColor(story.category?.slug), '#1d3b13'];

  return createPortal(
    <dialog
      ref={ref}
      className="als-viewer"
      aria-label={`Ярмарка тщеславия: ${displayName(story)}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.nativeEvent.stopPropagation()}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* фон: размытая картинка поста, без картинки — цвет рубрики */}
      <div className="als-v-bg" aria-hidden="true">
        <div className="als-v-bg-color" style={{ background: `radial-gradient(circle at 30% 20%, ${c1}55, transparent 60%), ${c2}` }} />
        {bg ? <img key={bg} className="als-v-bg-img" src={bg} alt="" /> : null}
      </div>

      <button type="button" className="als-v-close" aria-label="Закрыть" onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div className="als-v-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {/* соседние — уменьшенные карточки по бокам (на широком экране) */}
        <Peek story={prevStory} side="prev" onClick={() => go(-1)} />

        <button type="button" className="als-v-arrow" aria-label="Предыдущая" disabled={!prevStory} onClick={() => go(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6l-6 6 6 6" />
          </svg>
        </button>

        <article key={story.id} className="als-v-card" data-dir={dir} aria-live="polite">
          <ol className="als-v-steps" aria-label={`История ${index + 1} из ${items.length}`}>
            {items.map((s, i) => (
              <li key={s.id} data-state={i < index ? 'past' : i === index ? 'now' : undefined} />
            ))}
          </ol>

          <div className="als-v-head">
            <a className="als-v-author" href={story.author.url}>
              <StoryAvatar uid={`v${story.id}`} src={story.author.avatar} category={story.category?.slug} />
              <span className="als-v-who">
                <b>{displayName(story)}</b>
                {detail ? (
                  <time dateTime={detail.published} title={formatFullDate(detail.published)}>
                    {formatDate(detail.published)}
                  </time>
                ) : (
                  <span className="als-v-skel-line" />
                )}
              </span>
            </a>
            {story.category ? (
              <a className="als-v-cat" href={`/archive/category/${story.category.slug}/`}>
                <i style={{ background: categoryColor(story.category.slug) }} />
                {story.category.title}
              </a>
            ) : null}
          </div>

          <div className="als-v-body">
            {story.slogan ? <p className="als-v-slogan">{story.slogan}</p> : null}
            {error ? (
              <p className="als-v-error" role="alert">
                {error}
              </p>
            ) : detail ? (
              <Content detail={detail} />
            ) : (
              <div className="als-v-skel" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <div className="als-v-foot">
            {detail ? <Actions key={detail.id} detail={detail} guest={guest} /> : <span className="als-v-actions" />}
            <a className="als-v-go" href={story.url}>
              Перейти к публикации
            </a>
          </div>
        </article>

        <button type="button" className="als-v-arrow" aria-label="Следующая" disabled={!nextStory} onClick={() => go(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 6l6 6-6 6" />
          </svg>
        </button>

        <Peek story={nextStory} side="next" onClick={() => go(1)} />
      </div>
    </dialog>,
    document.body,
  );
}

function Content({ detail }: { detail: StoryDetail }) {
  const img = detail.image;
  return (
    <>
      {img ? (
        <figure
          className="als-v-img"
          style={img.width && img.height ? { aspectRatio: `${img.width} / ${img.height}` } : undefined}
        >
          <img src={img.src} alt="" style={{ backgroundImage: `url(${img.preload})` }} />
        </figure>
      ) : null}
      <h2 className="als-v-title">{detail.title}</h2>
      <div className="als-v-text">{detail.text}</div>
    </>
  );
}

function Actions({ detail, guest }: { detail: StoryDetail; guest: boolean }) {
  const [liked, setLiked] = useState(detail.counts.liked);
  const [likes, setLikes] = useState(detail.counts.likes);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [pulse, setPulse] = useState(0);

  const like = () => {
    if (guest) {
      setHint('auth');
      return;
    }
    if (busy) return;
    const was = liked;
    setLiked(!was);
    setLikes((n) => Math.max(0, n + (was ? -1 : 1)));
    if (!was) setPulse((n) => n + 1);
    setBusy(true);
    toggleLike(detail.id)
      .then((count) => {
        if (count >= 0) setLikes(count);
        // счётчик в кэше — чтобы при возврате к истории было как сейчас
        cache.set(detail.id, Promise.resolve({ ...detail, counts: { ...detail.counts, liked: !was, likes: count >= 0 ? count : likes + (was ? -1 : 1) } }));
      })
      .catch((e: ApiError) => {
        setLiked(was);
        setLikes(detail.counts.likes);
        setHint(e.status === 401 || e.status === 403 ? 'auth' : e.message);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="als-v-actions">
      <button
        type="button"
        className="als-v-like"
        aria-pressed={liked}
        aria-label={liked ? 'Убрать лайк' : 'Нравится'}
        onClick={like}
      >
        <Like key={pulse} className={`als-heart${pulse ? ' als-heart-pulse' : ''}`} />
        <span>
          <RollingNumber value={likes} />
        </span>
      </button>
      <a className={`als-v-comments${detail.counts.comments ? ' als-v-commented' : ''}`} href={`${detail.url}?anchor=comments`} aria-label={`Комментарии: ${detail.counts.comments}`}>
        <Comment />
        <span>{detail.counts.comments || ''}</span>
      </a>
      {hint ? (
        <span className="als-v-hint" role="status">
          {hint === 'auth' ? (
            <>
              <a href="/auth/">Войдите</a>, чтобы ставить лайки
            </>
          ) : (
            hint
          )}
        </span>
      ) : null}
    </div>
  );
}

function Peek({ story, side, onClick }: { story: Story | undefined; side: 'prev' | 'next'; onClick: () => void }) {
  if (!story) return <div className={`als-v-peek als-v-peek-${side}`} aria-hidden="true" data-empty="" />;
  return (
    <button
      type="button"
      className={`als-v-peek als-v-peek-${side}`}
      onClick={onClick}
      tabIndex={-1}
      aria-hidden="true"
      style={{ '--als-peek': categoryColor(story.category?.slug) } as React.CSSProperties}
    >
      <StoryAvatar uid={`p${side}${story.id}`} src={story.author.avatar} category={story.category?.slug} />
      <b>{displayName(story)}</b>
      {story.slogan ? <span>{story.slogan}</span> : null}
    </button>
  );
}
