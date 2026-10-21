import { useEffect, useId, useState } from 'react';
import Dialog from './dialog/Dialog';
import type { Candidate, Offer, Story } from './types';
import { ApiError, getBalance, getCandidates, publishStory } from './api';
import { StoryAvatar } from './StoryAvatar';
import { formatDay, lits } from './format';
import { useMe } from './me';

type Step = 'pick' | 'slogan' | 'done';

/**
 * «+» на ярмарке: выбрать свою публикацию → написать девиз → разместить (с оплатой).
 * Гостю — приглашение войти.
 */
export default function AddDialog({
  guest,
  onClose,
  onPublished,
}: {
  guest: boolean;
  onClose: () => void;
  onPublished: (story: Story | null) => void;
}) {
  const [authNeeded, setAuthNeeded] = useState(guest);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [posts, setPosts] = useState<Candidate[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(!guest);
  const [loadError, setLoadError] = useState('');
  const [balance, setBalance] = useState<number | null>(null);

  const [step, setStep] = useState<Step>('pick');
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [slogan, setSlogan] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [charged, setCharged] = useState(false);

  const loadPage = (before?: number) => {
    setLoading(true);
    setLoadError('');
    getCandidates(before)
      .then((d) => {
        setPosts((old) => (before ? [...old, ...d.posts] : d.posts));
        setMore(d.more);
        if (d.offer) setOffer(d.offer);
      })
      .catch((e: ApiError) => {
        if (e.status === 401 || e.status === 403) setAuthNeeded(true);
        else setLoadError(e.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (guest) return;
    loadPage();
    getBalance()
      .then((b) => setBalance(b.lits))
      .catch(() => setBalance(null));
    // баланс меняется на лету — событие блока пользователя (userbar)
    const onBalance = (e: Event) => {
      const v = (e as CustomEvent<{ lits?: number }>).detail?.lits;
      if (typeof v === 'number') setBalance(v);
    };
    window.addEventListener('alterlit:balance', onBalance);
    return () => window.removeEventListener('alterlit:balance', onBalance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest]);

  if (authNeeded) {
    return (
      <Dialog title="Ярмарка тщеславия" onClose={onClose}>
        <p className="als-d-lead">
          Здесь авторы показывают свои тексты всем, кто открывает главную. Чтобы разместить свою публикацию, войдите на
          сайт.
        </p>
        <div className="als-d-row">
          <a className="als-d-btn" href="/auth/">
            Войти
          </a>
          <a className="als-d-btn als-d-secondary" href="/registration/">
            Зарегистрироваться
          </a>
        </div>
      </Dialog>
    );
  }

  const price = offer?.price ?? 0;
  const free = offer?.free ?? false;
  const short = !free && balance !== null && offer !== null && balance < price;

  if (step === 'done' && picked) {
    return (
      <Dialog title="Готово!" onClose={onClose}>
        <div className="als-d-done">
          <svg className="als-d-check" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="23" />
            <path d="M15 27l7 7 15-16" />
          </svg>
          <p>
            «{picked.title}» — на Ярмарке тщеславия.
            {charged ? <> Списано {lits(price)}.</> : null}
          </p>
          <button type="button" className="als-d-btn" onClick={onClose} autoFocus>
            Отлично
          </button>
        </div>
      </Dialog>
    );
  }

  if (step === 'slogan' && picked && offer) {
    const len = slogan.trim().length;
    const { min, max } = offer.slogan;
    const valid = len >= min && len <= max;
    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!valid || sending || short) return;
      setSending(true);
      setSendError('');
      publishStory(picked.id, slogan.trim())
        .then((r) => {
          setCharged(r.charged);
          setStep('done');
          onPublished(r.item);
        })
        .catch((err: ApiError) => {
          if (err.status === 401) setAuthNeeded(true);
          else setSendError(err.message);
        })
        .finally(() => setSending(false));
    };
    return (
      <Dialog title="Девиз публикации" onClose={onClose}>
        <form className="als-d-form" onSubmit={submit}>
          <button type="button" className="als-d-picked" onClick={() => setStep('pick')} disabled={sending}>
            <span className="als-d-picked-title">{picked.title}</span>
            <span className="als-d-picked-change">Выбрать другую</span>
          </button>

          <SloganField value={slogan} onChange={setSlogan} min={min} max={max} disabled={sending} />

          <Preview candidate={picked} slogan={slogan.trim()} />

          {sendError ? (
            <p className="als-d-error" role="alert">
              {sendError}
            </p>
          ) : null}
          {short ? <ShortOfLits need={price - (balance ?? 0)} /> : null}

          <button type="submit" className="als-d-btn" disabled={!valid || sending || short}>
            {sending ? 'Размещаем…' : free ? 'Разместить бесплатно' : `Разместить за ${lits(price)}`}
          </button>
          <p className="als-d-note">
            {free ? 'Для администрации размещение бесплатное.' : <>Литы спишутся с вашего счёта сразу после размещения.</>}{' '}
            <a href={offer.rules_url} target="_blank" rel="noreferrer">
              Правила Ярмарки
            </a>
          </p>
        </form>
      </Dialog>
    );
  }

  return (
    <Dialog title="Разместить на Ярмарке" onClose={onClose}>
      {offer ? (
        <p className="als-d-lead">
          Кружок с вашим аватаром встанет первым в ленту на главной, а девиз читатели увидят, наведя на кружок мышь или задержав на нём палец.{' '}
          {free ? (
            <b>Для администрации — бесплатно.</b>
          ) : (
            <>
              Стоимость — <b>{lits(price)}</b>
              {balance !== null ? <>, на счёте {lits(balance)}</> : null}.
            </>
          )}{' '}
          <a href={offer.rules_url} target="_blank" rel="noreferrer">
            Правила
          </a>
        </p>
      ) : null}

      {offer && !offer.allowed ? (
        <p className="als-d-error" role="alert">
          {offer.reason}
          {/лит|баланс|сч[её]т/i.test(offer.reason) ? (
            <>
              {' '}
              <a href="/finance/" target="_blank" rel="noreferrer">
                Пополнить счёт
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {offer?.allowed && short ? <ShortOfLits need={price - (balance ?? 0)} /> : null}

      {loadError ? (
        <p className="als-d-error" role="alert">
          {loadError}{' '}
          <button type="button" className="als-d-link" onClick={() => loadPage()}>
            Повторить
          </button>
        </p>
      ) : null}

      {offer?.allowed !== false ? (
        <>
          <p className="als-d-label">Выберите публикацию</p>
          <ul className="als-d-list" aria-busy={loading}>
            {posts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="als-d-post"
                  disabled={p.duplicate}
                  aria-pressed={picked?.id === p.id}
                  onClick={() => {
                    setPicked(p);
                    setSendError('');
                    setStep('slogan');
                  }}
                >
                  <span className="als-d-post-head">
                    <span className="als-d-post-title">{p.title}</span>
                    <time dateTime={p.date}>{formatDay(p.date)}</time>
                  </span>
                  <span className="als-d-post-meta">
                    {p.categories.map((c) => c.title).join(', ')}
                    {p.status === 'profile' ? <em>в профиле</em> : null}
                    {p.duplicate ? <em className="als-d-dup">уже на ярмарке</em> : null}
                  </span>
                  {p.excerpt ? <span className="als-d-post-excerpt">{p.excerpt}</span> : null}
                </button>
              </li>
            ))}
            {loading ? Array.from({ length: posts.length ? 1 : 3 }, (_, i) => <li key={`s${i}`} className="als-d-skel" />) : null}
          </ul>
          {!loading && !loadError && posts.length === 0 ? (
            <p className="als-d-empty">
              Пока нечего размещать: на ярмарку попадают ваши опубликованные тексты (в том числе в профиле).
            </p>
          ) : null}
          {more && !loading ? (
            <button type="button" className="als-d-more" onClick={() => loadPage(posts[posts.length - 1]?.id)}>
              Показать ещё
            </button>
          ) : null}
        </>
      ) : null}
    </Dialog>
  );
}

function SloganField({
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  disabled: boolean;
}) {
  const id = useId();
  const len = value.trim().length;
  const over = len > max;
  return (
    <div className="als-d-field">
      <label htmlFor={id} className="als-d-label">
        Опишите коротко, о чём текст, — чтобы захотелось открыть
      </label>
      <textarea
        id={id}
        className="als-d-input"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, ' '))}
        placeholder="Например: «История о том, как я потерял ключи от лета»"
        rows={2}
        maxLength={max + 20}
        aria-invalid={over || undefined}
        aria-describedby={`${id}-count`}
        disabled={disabled}
        autoFocus
        onKeyDown={(e) => {
          // Enter — отправить, как в поле ввода
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <span id={`${id}-count`} className="als-d-count" data-over={over || undefined} aria-live="polite">
        {len < min && len > 0 ? `ещё хотя бы ${min - len} · ` : ''}
        {len} / {max}
      </span>
    </div>
  );
}

/** Как это будет выглядеть на ярмарке: кружок и облачко с девизом. */
function Preview({ candidate, slogan }: { candidate: Candidate; slogan: string }) {
  const me = useMe();
  return (
    <div className="als-d-preview" aria-hidden="true">
      <span className="als-d-preview-label">Так увидят читатели</span>
      <div className="als-d-preview-row">
        <span className="als-d-preview-item">
          <StoryAvatar uid="preview" src={me?.avatar ?? null} category={candidate.categories[0]?.slug} />
          <span className="als-name">{me?.name ?? ''}</span>
        </span>
        <span className="als-d-preview-tip">
          <span className={slogan ? undefined : 'als-d-preview-empty'}>{slogan || 'Здесь будет ваш девиз'}</span>
        </span>
      </div>
    </div>
  );
}

function ShortOfLits({ need }: { need: number }) {
  return (
    <p className="als-d-error" role="alert">
      Не хватает {lits(need)}.{' '}
      <a href="/finance/" target="_blank" rel="noreferrer">
        Пополнить счёт
      </a>
    </p>
  );
}
