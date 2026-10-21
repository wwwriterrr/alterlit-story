export const NO_AVATAR = '/assets/img/noavatar_3.png';

/** Цвет круга по рубрике истории — как parts/scope_avatar.html и круг в ленте постов. */
const GRADIENTS: Record<string, [string, string, number, number]> = {
  // [цвет 1, цвет 2, offset 1, offset 2]
  ipsum: ['#AB2EE9', '#FF6240', 0, 0.755208],
  blog: ['#3CE977', '#48AAF1', 0.141858, 0.966434],
  stihi: ['#FDEA2C', '#F09000', 0, 0.651603],
  proza: ['#4CAFBF', '#5B48D1', 0, 0.651603],
  freshtrash: ['#93F858', '#21CE51', 0, 0.651603],
  imhoch: ['#E496F7', '#A415C7', 0, 0.651603],
};
const DEFAULT_GRADIENT: [string, string, number, number] = ['#AB2EE9', '#FF6240', 0, 0.651603];

export const categoryColor = (slug: string | undefined) => (GRADIENTS[slug ?? ''] ?? DEFAULT_GRADIENT)[1];

/**
 * Аватар в цветном круге. Круг «дорисовывается» при появлении (как раньше gsap), у
 * просмотренной истории — серый.
 */
export function StoryAvatar({
  uid,
  src,
  category,
  seen = false,
}: {
  /** уникален на странице: id градиента в SVG */
  uid: string;
  src: string | null;
  category: string | undefined;
  seen?: boolean;
}) {
  const [c1, c2, o1, o2] = GRADIENTS[category ?? ''] ?? DEFAULT_GRADIENT;
  const gid = `als-g-${uid}`;
  return (
    <span className="als-avatar" data-seen={seen || undefined}>
      <svg className="als-ring" viewBox="0 0 90 90" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="14.505" y1="4.14286" x2="73.4564" y2="85.9835" gradientUnits="userSpaceOnUse">
            <stop offset={o1} stopColor={c1} />
            <stop offset={o2} stopColor={c2} />
          </linearGradient>
        </defs>
        <circle className="als-ring-seen" cx="45" cy="45" r="43" />
        <circle className="als-ring-color" cx="45" cy="45" r="43" stroke={`url(#${gid})`} />
      </svg>
      <img
        className="als-photo"
        src={src || NO_AVATAR}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={(e) => {
          const img = e.currentTarget;
          if (!img.src.endsWith(NO_AVATAR)) img.src = NO_AVATAR;
        }}
      />
    </span>
  );
}
