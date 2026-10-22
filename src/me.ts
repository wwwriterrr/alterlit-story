import { useEffect, useState } from 'react';

export interface Me {
  avatar: string | null;
  name: string;
}

let pending: Promise<Me | null> | null = null;

/** Текущий пользователь (аватар и имя) — один запрос на страницу; гость — null. */
function loadMe() {
  pending ??= fetch('/api/v1/users/session/self/', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((u) => (u ? { avatar: u.avatar || null, name: u.name || u.username } : null))
    .catch(() => null);
  return pending;
}

/** undefined — ещё не знаем (запрос идёт), null — гость. */
export function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadMe().then((m) => alive && setMe(m));
    return () => {
      alive = false;
    };
  }, []);
  return me;
}
