export type MarkKind = 'admin' | 'chief_editor' | 'owner' | 'closed' | 'antipod';

export interface Author {
  id: number;
  username: string;
  /** есть — показываем его, нет — логин */
  nickname: string | null;
  avatar: string | null;
  url: string;
  marks: { kind: MarkKind; title: string }[];
}

/** История Ярмарки тщеславия */
export interface Story {
  id: number;
  url: string;
  slogan: string;
  /** дата размещения на ярмарке, ISO */
  date: string;
  /** рубрика — от неё цвет круга */
  category: { slug: string; title: string } | null;
  author: Author;
}

export interface StoriesPage {
  /** 20 последних историй */
  items: Story[];
  viewer: { id: number | null };
}

/** История целиком — для просмотра «как сториз» */
export interface StoryDetail extends Story {
  title: string;
  /** дата публикации поста, ISO */
  published: string;
  categories: { title: string; url: string; slug: string }[];
  /** текст по строкам, без HTML */
  text: string;
  image: { id: number; src: string; full: string; preload: string; width?: number; height?: number } | null;
  counts: { likes: number; comments: number; liked: boolean };
}

/** Своя публикация, которую можно разместить */
export interface Candidate {
  id: number;
  url: string;
  title: string;
  excerpt: string;
  date: string;
  status: 'published' | 'profile';
  categories: { title: string; url: string; slug: string }[];
  /** такая история уже есть — второй раз нельзя */
  duplicate: boolean;
}

export interface Offer {
  price: number;
  free: boolean;
  slogan: { min: number; max: number };
  allowed: boolean;
  reason: string;
  rules_url: string;
}

export interface CandidatesPage {
  posts: Candidate[];
  more: boolean;
  offer?: Offer;
}
