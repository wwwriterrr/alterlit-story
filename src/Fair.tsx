import { useCallback, useEffect, useRef, useState } from 'react';
import type { Story } from './types';
import { getStories } from './api';
import { NO_AVATAR, StoryAvatar } from './StoryAvatar';
import { useMe } from './me';
import SloganTip, { displayName } from './SloganTip';
import AddDialog from './AddDialog';
import Viewer from './Viewer';
import { isSeen, markSeen } from './seen';
import { useScroller } from './useScroller';
import { useDock } from './useDock';

/** скелетон — по числу историй: на широком экране ряд заполнен до края */
const SKELETONS = 20;
/** на главной — только 20 последних историй */
const LIMIT = 20;
const HOVER_DELAY = 250;
const LONG_PRESS = 450;

type Tip = { story: Story; el: HTMLElement } | null;

export default function Fair({ root }: { root: HTMLElement }) {
  const [items, setItems] = useState<Story[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [tip, setTip] = useState<Tip>(null);
  // открытая в просмотре история — индекс в items; адрес ?story=<id>, «Назад» закрывает
  const [open, setOpen] = useState<number | null>(null);
  /** просмотр открыт кликом (своя запись в истории) — закрытие = шаг назад */
  const pushed = useRef(false);
  const [, setSeenTick] = useState(0);

  const dock = useDock(root);
  // undefined — ещё не знаем, вошёл ли: кружки пока скелетоном, чтобы «+» потом не сдвинул ленту
  const me = useMe();
  const ready = status === 'ready' && me !== undefined;

  const listRef = useRef<HTMLUListElement>(null);
  const { prev: canPrev, next: canNext, page } = useScroller(listRef, [items.length, ready]);

  // появление кружков — когда кружок впервые виден в ленте; кто стал виден вместе — волной
  useEffect(() => {
    const list = listRef.current;
    if (!list || !ready) return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target as HTMLElement)
          .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        seen.forEach((el, i) => {
          io.unobserve(el);
          el.style.setProperty('--als-delay', `${Math.min(i, 14) * 70}ms`);
          el.dataset.shown = '';
        });
      },
      { root: list, threshold: 0.3 },
    );
    list.querySelectorAll<HTMLElement>('.als-item[data-reveal]:not([data-shown])').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items, ready]);

  const load = useCallback(() => {
    setStatus('loading');
    getStories()
      .then((d) => {
        setItems(d.items);
        setViewerId(d.viewer.id);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);
  useEffect(load, [load]);

  // ── девиз: наведение мышью, фокус с клавиатуры, долгое нажатие пальцем ──
  const timer = useRef(0);
  const longPressed = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const clearTimer = () => window.clearTimeout(timer.current);
  useEffect(() => clearTimer, []);
  // при прокрутке ленты облачко прячем — иначе оно отстаёт от кружка
  useEffect(() => {
    const list = listRef.current;
    if (!list || !tip) return;
    const hide = () => setTip(null);
    list.addEventListener('scroll', hide, { passive: true });
    return () => list.removeEventListener('scroll', hide);
  }, [tip]);

  const itemHandlers = (story: Story) => ({
    onPointerEnter: (e: React.PointerEvent<HTMLAnchorElement>) => {
      if (e.pointerType !== 'mouse' || listRef.current?.dataset.dragging !== undefined) return;
      const el = e.currentTarget;
      clearTimer();
      timer.current = window.setTimeout(() => setTip({ story, el }), HOVER_DELAY);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLAnchorElement>) => {
      if (e.pointerType !== 'mouse') return;
      clearTimer();
      setTip((t) => (t?.story.id === story.id ? null : t));
    },
    onPointerDown: (e: React.PointerEvent<HTMLAnchorElement>) => {
      if (e.pointerType === 'mouse') {
        clearTimer();
        setTip(null);
        return;
      }
      longPressed.current = false;
      touchStart.current = { x: e.clientX, y: e.clientY };
      const el = e.currentTarget;
      clearTimer();
      timer.current = window.setTimeout(() => {
        longPressed.current = true;
        setTip({ story, el });
      }, LONG_PRESS);
    },
    onPointerMove: (e: React.PointerEvent<HTMLAnchorElement>) => {
      const s = touchStart.current;
      if (!s || e.pointerType === 'mouse') return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) {
        clearTimer();
        touchStart.current = null;
      }
    },
    onPointerUp: (e: React.PointerEvent<HTMLAnchorElement>) => {
      if (e.pointerType === 'mouse') return;
      clearTimer();
      touchStart.current = null;
      if (longPressed.current) setTip(null);
    },
    onPointerCancel: () => {
      clearTimer();
      touchStart.current = null;
      setTip(null);
    },
    onContextMenu: (e: React.MouseEvent) => {
      // долгое нажатие показало девиз — меню ссылки браузера не нужно
      if (longPressed.current) e.preventDefault();
    },
    onFocus: (e: React.FocusEvent<HTMLAnchorElement>) => {
      if (e.currentTarget.matches(':focus-visible')) setTip({ story, el: e.currentTarget });
    },
    onBlur: () => setTip(null),
    onClick: (e: React.MouseEvent) => {
      if (longPressed.current) {
        longPressed.current = false;
        e.preventDefault();
        return;
      }
      markSeen(story.id);
      setSeenTick((n) => n + 1);
      // обычный клик — просмотр «как сториз»; Ctrl/Cmd/средняя кнопка — ссылка как есть
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      clearTimer();
      setTip(null);
      openStory(story.id);
    },
  });

  const openStory = (id: number) => {
    const i = items.findIndex((s) => s.id === id);
    if (i < 0) return;
    const url = new URL(window.location.href);
    url.searchParams.set('story', String(id));
    window.history.pushState({ ...window.history.state, alsStory: id }, '', url);
    pushed.current = true;
    setOpen(i);
  };
  const showIndex = (i: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set('story', String(items[i].id));
    window.history.replaceState({ ...window.history.state, alsStory: items[i].id }, '', url);
    setOpen(i);
  };
  const closeViewer = () => {
    // открывали сами — шаг назад по истории (адрес вернётся), пришли по ссылке с ?story= — убрать параметр
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete('story');
      window.history.replaceState({ ...window.history.state, alsStory: undefined }, '', url);
      setOpen(null);
    }
    setSeenTick((n) => n + 1);
  };
  // «Назад»/«Вперёд» браузера
  useEffect(() => {
    const onPop = () => {
      const id = Number(new URL(window.location.href).searchParams.get('story'));
      const i = id ? items.findIndex((s) => s.id === id) : -1;
      if (i < 0) pushed.current = false;
      setOpen(i >= 0 ? i : null);
      setSeenTick((n) => n + 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [items]);
  // ссылка с ?story=<id> — сразу открыть
  const deepLinked = useRef(false);
  useEffect(() => {
    if (status !== 'ready' || deepLinked.current) return;
    deepLinked.current = true;
    const id = Number(new URL(window.location.href).searchParams.get('story'));
    const i = id ? items.findIndex((s) => s.id === id) : -1;
    if (i >= 0) setOpen(i);
  }, [status, items]);

  const onPublished = (story: Story | null) => {
    if (!story) {
      load();
      return;
    }
    setItems((old) => [story, ...old.filter((s) => s.id !== story.id)].slice(0, LIMIT));
    setFresh(story.id);
    listRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  };

  return (
    <div className="als-wrap" data-loading={!ready || undefined} data-dock={dock} data-prev={canPrev || undefined} data-next={canNext || undefined}>
      <ul ref={listRef} className="als-list" aria-label="Ярмарка тщеславия" aria-busy={!ready && status !== 'error'}>
        {/* «+» — только вошедшим: свой аватар в пунктирном круге и значок «+» */}
        {me ? (
          <li className="als-item als-add">
            <button
              type="button"
              className="als-link"
              onClick={() => setAdding(true)}
              aria-haspopup="dialog"
              title="Разместить свою публикацию на Ярмарке тщеславия"
            >
              <span className="als-avatar als-plus">
                <svg className="als-ring" viewBox="0 0 90 90" aria-hidden="true">
                  <circle className="als-plus-ring" cx="45" cy="45" r="43" />
                </svg>
                <img className="als-photo" src={me.avatar || NO_AVATAR} alt="" draggable={false} />
                <span className="als-plus-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 6v12M6 12h12" />
                  </svg>
                </span>
              </span>
              <span className="als-name">Разместить</span>
            </button>
          </li>
        ) : null}

        {!ready && status !== 'error'
          ? Array.from({ length: SKELETONS }, (_, i) => <SkeletonItem key={i} />)
          : items.map((s) => (
              <li key={s.id} className="als-item" data-reveal="" data-fresh={s.id === fresh || undefined}>
                <a
                  className="als-link"
                  href={s.url}
                  aria-label={`${displayName(s)}${s.slogan ? `: ${s.slogan}` : ''}`}
                  aria-describedby={tip?.story.id === s.id ? `als-tip-${s.id}` : undefined}
                  {...itemHandlers(s)}
                >
                  <StoryAvatar uid={String(s.id)} src={s.author.avatar} category={s.category?.slug} seen={isSeen(s.id)} />
                  <span className="als-name">{displayName(s)}</span>
                </a>
              </li>
            ))}

        {status === 'error' ? (
          <li className="als-item als-error">
            <span>Не удалось загрузить ярмарку</span>
            <button type="button" onClick={load}>
              Повторить
            </button>
          </li>
        ) : null}

      </ul>

      <button type="button" className="als-arrow als-prev" tabIndex={-1} aria-label="Назад" onClick={() => page(-1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 6l-6 6 6 6" />
        </svg>
      </button>
      <button type="button" className="als-arrow als-next" tabIndex={-1} aria-label="Дальше" onClick={() => page(1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9.5 6l6 6-6 6" />
        </svg>
      </button>

      {tip ? <SloganTip story={tip.story} anchor={tip.el} /> : null}
      {open !== null && items[open] ? (
        <Viewer
          items={items}
          index={open}
          guest={status === 'ready' && viewerId === null}
          onIndex={showIndex}
          onClose={closeViewer}
        />
      ) : null}
      {adding ? (
        <AddDialog guest={status === 'ready' && viewerId === null} onClose={() => setAdding(false)} onPublished={onPublished} />
      ) : null}
    </div>
  );
}

function SkeletonItem() {
  return (
    <li className="als-item als-skel" aria-hidden="true">
      <span className="als-link">
        <span className="als-avatar" />
        <span className="als-name" />
      </span>
    </li>
  );
}
