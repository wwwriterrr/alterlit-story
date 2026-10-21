import type { CandidatesPage, StoriesPage, Story, StoryDetail } from './types';

let csrfFallback = '';
/** Токен CSRF, если куки csrftoken нет: <div id="alterlit-story" data-csrf="{{ csrf_token }}"> */
export function setCsrfFallback(token: string) {
  csrfFallback = token;
}

function csrfToken() {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : csrfFallback;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && typeof data.detail === 'string' ? data.detail : '';
    throw new ApiError(detail || 'Возникла ошибка на сервере. Попробуйте позже.', res.status);
  }
  return data as T;
}

export const getStories = () => request<StoriesPage>('/api/v1/story/');

export const getStory = (id: number) => request<StoryDetail>(`/api/v1/story/${id}/`);

/** Лайк — старая ручка ленты: POST /likes/post/<id>/ (форма) → {code, count}; переключатель. */
export async function toggleLike(id: number) {
  const r = await request<{ code: number; count: number; msg?: string }>(`/likes/post/${id}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrfToken() },
    body: '',
  });
  if (r.code !== 200) throw new ApiError(r.msg || 'Не удалось поставить лайк', r.code);
  return r.count;
}

export const getCandidates = (before?: number) =>
  request<CandidatesPage>('/api/v1/story/candidates/' + (before ? `?before=${before}` : ''));

export const getBalance = () => request<{ lits: number; books: number }>('/api/v1/users/balance/');

export const publishStory = (postId: number, slogan: string) =>
  request<{ item: Story | null; charged: boolean }>('/api/v1/story/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
    body: JSON.stringify({ post_id: postId, slogan }),
  });
