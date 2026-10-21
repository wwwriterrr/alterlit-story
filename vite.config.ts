import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Пока ручки /api/v1/story/ нет на сервере: DEV_FIXTURES=1 в .env.local — истории из
 * dev-fixtures/stories.json (20 последних), свои публикации — dev-fixtures/candidates.json,
 * публикация отвечает заглушкой (на сервер ничего не уходит). FIXTURE_AS=guest|staff — гость
 * или администратор (бесплатно); FIXTURE_DENY=1 — размещение недоступно.
 */
function storyFixture(env: Record<string, string>): Plugin {
  const LIMIT = 20;
  const read = (f: string) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {});
  const json = (res: import('node:http').ServerResponse, data: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(data));
  };
  const guest = env.FIXTURE_AS === 'guest';
  const added: unknown[] = [];
  return {
    name: 'story-fixture',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '', 'http://x');
        const path = url.pathname;
        if (path === '/api/v1/story/' && req.method === 'GET') {
          const items = [...added, ...(read('dev-fixtures/stories.json').items ?? [])].slice(0, LIMIT);
          // задержка — чтобы был виден скелетон
          setTimeout(() => json(res, { items, viewer: { id: guest ? null : 79728 } }), 700);
          return;
        }
        if (path === '/api/v1/story/' && req.method === 'POST') {
          if (guest) return json(res, { detail: 'Учетные данные не были предоставлены.' }, 403);
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            const { post_id, slogan } = JSON.parse(body || '{}');
            const post = (read('dev-fixtures/candidates.json').posts ?? []).find((p: { id: number }) => p.id === post_id);
            if (!post) return json(res, { detail: 'Публикация не найдена' }, 404);
            if (post.duplicate) return json(res, { detail: 'Запрещено несколько раз публиковать одну и ту же публикацию в ленту' }, 400);
            const item = {
              id: post.id,
              url: post.url,
              slogan,
              date: new Date().toISOString().slice(0, 19),
              category: post.categories[0] ? { slug: post.categories[0].slug, title: post.categories[0].title } : null,
              author: { id: 79728, username: 'devil', nickname: 'I am Dijavol', avatar: '/media/avatars/blob_wgufEu3', url: '/profile/devil/', marks: [] },
            };
            added.unshift(item);
            setTimeout(() => json(res, { item, charged: env.FIXTURE_AS !== 'staff' }, 201), 900);
          });
          return;
        }
        if (path === '/api/v1/story/candidates/') {
          if (guest) return json(res, { detail: 'Учетные данные не были предоставлены.' }, 403);
          const posts = read('dev-fixtures/candidates.json').posts ?? [];
          const before = Number(url.searchParams.get('before') || 0);
          const start = before ? posts.findIndex((p: { id: number }) => p.id === before) + 1 : 0;
          const page = posts.slice(start, start + 6);
          const deny = Boolean(env.FIXTURE_DENY);
          setTimeout(
            () =>
              json(res, {
                posts: page,
                more: start + 6 < posts.length,
                ...(before
                  ? {}
                  : {
                      offer: {
                        price: 100,
                        free: env.FIXTURE_AS === 'staff',
                        slogan: { min: 3, max: 45 },
                        allowed: !deny,
                        reason: deny ? 'Недостаточно литов на счёте' : '',
                        rules_url: '/alterlit-rules/?doc=scope_rules',
                      },
                    }),
              }),
            500,
          );
          return;
        }
        next();
      });
    },
  };
}

/**
 * Главная сайта как есть (с прода, с сессией DEV_COOKIE), только блок ярмарки (#fair-wrap и
 * его скрипт lightSlider) заменён на остров. Так видно, как он встаёт между шапкой и лентой.
 * Голая страница без сайта — /sandbox.html.
 */
function liveIndex(backend: string, cookie: string): Plugin {
  return {
    name: 'live-index',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' || !/^\/(\?.*)?$/.test(req.url ?? '')) return next();
        try {
          const r = await fetch(backend + '/', { headers: cookie ? { cookie } : {} });
          let html = await r.text();
          html = html.replace(
            /<div id="fair-wrap">[\s\S]*?<\/ul>\s*<\/div>\s*<script>[\s\S]*?<\/script>/,
            '<div id="alterlit-story"></div>',
          );
          // счётчики посещаемости в dev не нужны
          html = html.replace(/<script[^>]*>[^<]*(mc\.yandex|metrika)[\s\S]*?<\/script>/gi, '');
          // модульные скрипты сайта (/assets/…, напр. viewer.js) Vite не трогает: он принял бы их
          // за свои файлы, не нашёл и начал следить за корнем диска (падает на /proc)
          const site: string[] = [];
          html = html.replace(/<script\b[^>]*\bsrc="\/assets\/[^"]*"[^>]*><\/script>/g, (tag) => {
            site.push(tag);
            return `<!--site-script-${site.length - 1}-->`;
          });
          html = html.replace('</body>', '<script type="module" src="/src/main.tsx"></script></body>');
          html = await server.transformIndexHtml('/', html);
          html = html.replace(/<!--site-script-(\d+)-->/g, (_, i) => site[Number(i)]);
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

/**
 * Без заглушек размещение на dev ушло бы на прод — со списанием литов. Поэтому POST
 * /api/v1/story/ на dev отвечает отказом, а лайк — заглушкой, пока в .env.local нет DEV_ALLOW_PUBLISH=1.
 */
function publishGuard(env: Record<string, string>): Plugin {
  return {
    name: 'publish-guard',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (env.DEV_FIXTURES || env.DEV_ALLOW_PUBLISH || req.method !== 'POST') return next();
        // лайк с dev на прод тоже не уходит: заглушка, клиент оставляет свой счётчик (count: -1)
        if (req.url?.startsWith('/likes/post/')) {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ code: 200, count: -1 }));
          return;
        }
        if (!req.url?.startsWith('/api/v1/story/')) return next();
        res.statusCode = 403;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ detail: 'dev: размещение на прод выключено (DEV_ALLOW_PUBLISH=1 в .env.local)' }));
      });
    },
  };
}

/**
 * Пока GET /api/v1/story/<id>/ нет на сервере: DEV_DETAIL_FALLBACK=1 — история собирается из уже
 * работающих ручек (GET /api/v1/posts/<id>/ — текст, /api/v1/images/session/<id>/ — первая
 * картинка, /api/v1/story/ — девиз и рубрика). Лайки и комментарии — условные числа.
 */
function detailFallback(backend: string, cookie: string): Plugin {
  const get = async (path: string) => {
    const r = await fetch(backend + path, { headers: cookie ? { cookie } : {} });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  };
  const toLines = (html: string) =>
    html
      .replace(/<br\s*\/?>|<\/p\s*>|<\/div\s*>|<\/li\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\/\*(?:vote|audio|file|preorder)-\d+\*\//g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&laquo;/g, '«')
      .replace(/&raquo;/g, '»')
      .replace(/&mdash;/g, '—')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  return {
    name: 'detail-fallback',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/api\/v1\/story\/(\d+)\/$/.exec(req.url ?? '');
        if (!m || req.method !== 'GET') return next();
        try {
          const id = Number(m[1]);
          const [post, list] = await Promise.all([get(`/api/v1/posts/${id}/`), get('/api/v1/story/')]);
          const item = list.items.find((s: { id: number }) => s.id === id);
          const imgId = /post_image-(\d+)/.exec(post.content)?.[1];
          const img = imgId ? await get(`/api/v1/images/session/${imgId}/`).catch(() => null) : null;
          const data = {
            ...item,
            title: post.title,
            published: new Date(post.dt + 3 * 3600_000).toISOString().slice(0, 19),
            categories: post.category.map((c: { title: string; slug: string }) => ({ ...c, url: `/archive/category/${c.slug}/` })),
            text: toLines(post.content),
            image: img ? { id: img.id, src: img.url, full: img.url, preload: img.preview } : null,
            counts: { likes: id % 37, comments: id % 11, liked: false },
          };
          setTimeout(() => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(data));
          }, 400);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

// В dev-режиме API, медиа и статика сайта проксируются на бэкенд, чтобы cookie работали как
// same-origin. DEV_COOKIE (строка Cookie из браузера) в .env.local — прокси подставит её сам,
// а заодно X-CSRFToken, Origin и Referer для Django CSRF.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = (env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const asAdmin = env.DEV_AS === 'admin' && Boolean(env.DEV_COOKIE_ADMIN);
  const devCookie = (asAdmin ? env.DEV_COOKIE_ADMIN : env.DEV_COOKIE) || '';
  if (command === 'serve' && devCookie) console.log(`  dev-сессия: ${asAdmin ? 'администратор' : 'пользователь'}`);
  const csrf = /(?:^|;\s*)csrftoken=([^;]+)/.exec(devCookie)?.[1];

  const proxy = (): ProxyOptions => ({
    target: backend,
    changeOrigin: true,
    secure: true,
    configure: (p) => {
      if (!devCookie) return;
      p.on('proxyReq', (req) => {
        req.setHeader('cookie', devCookie);
        req.setHeader('origin', backend);
        req.setHeader('referer', backend + '/');
        // токен из DEV_COOKIE: своя кука csrftoken у браузера на dev-хосте с ней не совпадёт
        if (csrf) req.setHeader('x-csrftoken', csrf);
      });
      // сессией управляет DEV_COOKIE — куки бэкенда в браузер не пропускаем
      p.on('proxyRes', (res) => {
        delete res.headers['set-cookie'];
      });
    },
  });

  return {
    // Статику отдаёт Django с /assets/story/
    base: command === 'build' ? env.VITE_ASSETS_BASE || '/assets/story/' : '/',
    plugins: [
      react(),
      ...(command === 'serve' && env.DEV_FIXTURES ? [storyFixture(env)] : []),
      ...(command === 'serve' ? [liveIndex(backend, devCookie), publishGuard(env)] : []),
      ...(command === 'serve' && env.DEV_DETAIL_FALLBACK ? [detailFallback(backend, devCookie)] : []),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: {
        // точка входа без index.html: её подключает шаблон Django
        input: 'src/main.tsx',
        output: {
          // один файл скрипта и один стилей со статическими именами — прописаны в шаблоне (с ?v=)
          entryFileNames: 'story.js',
          inlineDynamicImports: true,
          assetFileNames: (info) =>
            info.names?.some((n) => n.endsWith('.css')) ? 'story.css' : 'assets/[name]-[hash][extname]',
        },
      },
    },
    server: {
      port: 5182,
      proxy: {
        '/api': proxy(),
        '/media': proxy(),
        '/assets': proxy(),
        '/likes': proxy(),
        '/static': proxy(),
        // старая лента главной (archive POST method=get-posts) — только чтение
        '/archive': proxy(),
      },
    },
  };
});
