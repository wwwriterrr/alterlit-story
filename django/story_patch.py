# Ярмарка тщеславия v2 — остров React над лентой главной. Бэк — api/story/, параллельно
# старому (#fair-wrap в шаблоне главной, select_ebloscope / selectscope, Post.post_to_story не трогаем).
#
#   GET  /api/v1/story/                    — 20 последних историй ярмарки, новые сверху (по story_date);
#                                            остальным статус меняется вручную
#        → {"items": [{"id", "url", "slogan", "date", "category": {"slug", "title"} | null,
#                      "author": {"id", "username", "nickname", "avatar", "url", "marks"}}],
#           "viewer": {"id": int | null}}
#   GET  /api/v1/story/<id>/               — история целиком для просмотра «как сториз»
#        → {...как в списке, "title", "published", "categories", "text" (строки без HTML),
#           "image": {"src", "full", "preload", "width", "height", …} | null,
#           "counts": {"likes", "comments", "liked"}}; 404 — не история ярмарки
#        Лайк — старой ручкой POST /likes/post/<id>/, как в ленте постов.
#   GET  /api/v1/story/candidates/         — свои публикации, которые можно разместить (вход обязателен)
#   GET  /api/v1/story/candidates/?before=<id>
#        → {"posts": [{"id", "url", "title", "excerpt", "date", "status", "categories", "duplicate"}],
#           "more": bool,
#           на первой странице "offer": {"price", "free", "slogan": {"min", "max"}, "allowed", "reason",
#                                       "rules_url"}}
#   POST /api/v1/story/  {"post_id": int, "slogan": "…"}  — разместить (вход обязателен, X-CSRFToken)
#        → 201 {"item": {...история} | null, "charged": bool}
#        → 400/403/404 {"detail": "…"} — текст для пользователя (длина девиза, «Публикация не найдена»,
#          «Операция запрещена», причины из Post.can_story_publish / post_to_story / оплаты)
#
# Правила — в одном месте (rules.py), как в select_ebloscope и Post.post_to_story:
#   • показываем: post_type="story", статусы «опубликовано» и «в профиле», сайт по request.mode,
#     story_date задана; порядок — story_date, id; только 20 последних;
#   • разместить можно: свои post / creative в статусах «опубликовано» и «в профиле» своего сайта;
#     с правом blog.add_post — и чужие (как раньше, sender=админ);
#   • разрешено ли вообще — Post.can_story_publish(user, get_reason=True) и хотя бы один свой
#     опубликованный post (как в select_ebloscope);
#   • такая же история уже есть (тот же заголовок и текст) — в списке помечена «уже на ярмарке»,
#     post_to_story её и так отклонит;
#   • цена — SiteParams scope_price или settings.ALTERMONEY_CONST["story_price"];
#     длина девиза — Post.SLOGAN_SIZE.
#
# Оплата — через API (payment.py), в одной транзакции с размещением:
#   1) строка профиля блокируется (select_for_update) — два одновременных размещения одного
#      пользователя проходят по очереди;
#   2) проверки Post.can_story_publish (баланс, лимиты) — уже под блокировкой, с балансом из базы;
#      не is_staff — Transaction.scope_pay(user, post); is_staff — бесплатно;
#   3) post.post_to_story(slogan, sender=…) — старая логика как есть (смена типа, story_date, save()).
#   Любая ошибка на шаге 2–3 — откат всего: и списания, и размещения.
#
#   ВРЕМЕННО литы списываются ДВАЖДЫ — здесь и в Post.save() (блок «списание_литов_за_публикацию_в_еблоскоп»),
#   как договорились: пока остров включён только у вас (админ — бесплатно в обоих местах).
#   Перед включением для всех отключите этот блок в Post.save().
#
# Зависимость: api/feed (cards._author, _categories, _excerpt) — уже на сервере.
#
# Подключение: пакет api/story/ (п. 1–6), в api/urls.py — path('story/', include('api.story.urls')),
# в INSTALLED_APPS не добавлять. Места «ПРОВЕРЬТЕ» — допущения, которые нужно сверить с кодом.


# ── 1. api/story/__init__.py — пустой файл ───────────────────────────────────


# ── 2. api/story/rules.py ─────────────────────────────────────────────────────
"""
Ярмарка тщеславия — ЕДИНСТВЕННОЕ место с правилами: какие истории показываем, какие свои
публикации можно разместить, сколько это стоит и кто платит.

Правила перенесены из blog/views.py select_ebloscope и Post.post_to_story / Post.save;
старый код не трогаем, ярмарка работает параллельно.
"""
import decimal

from django.conf import settings
from django.db.models import Prefetch

from blog.models import Category, Post, SiteParams

SITES = {'alterlit': ['AL', 'ALL'], 'altcg': ['ALT', 'ALL']}

# что показываем на ярмарке
STORY_STATUSES = ['published', 'profile']  # ПРОВЕРЬТЕ: те же статусы, что выбирает главная сейчас
STORIES_LIMIT = 20                         # на главной — только 20 последних (остальным статус потом меняют вручную)

# что можно разместить (select_ebloscope: post_type post + creative, «опубликовано» и «в профиле»)
CANDIDATE_TYPES = ['post', 'creative']
CANDIDATE_STATUSES = ['published', 'profile']
CANDIDATES_LIMIT = 20


def sites_for(mode):
    return SITES.get(mode, SITES['alterlit'])


def price():
    """Цена размещения в литах — как в select_ebloscope."""
    return SiteParams.get_param('scope_price') or decimal.Decimal(settings.ALTERMONEY_CONST['story_price'])


def slogan_size():
    """(мин, макс) длина девиза."""
    return tuple(Post.SLOGAN_SIZE)


def is_free(user):
    """Админы размещают бесплатно (решение 2026-10-21: платят все, кроме is_staff).
    Внимание: Post.can_story_publish и блок оплаты в Post.save() считают админом того, у кого
    право blog.add_post, а не is_staff."""
    return bool(user.is_staff)


def can_publish(user):
    """Можно ли пользователю размещать на ярмарке: правила сайта (Post.can_story_publish —
    бан, баланс и т. п.) и хотя бы один опубликованный пост, как в select_ebloscope.
    → (True, '') или (False, причина)."""
    # баланс (user.profile.balance), лимит своих историй среди последних 20 (scope_limit),
    # не больше двух подряд; с правом blog.add_post — всё можно
    status = Post.can_story_publish(user, get_reason=True)
    if not status['status']:
        return False, status.get('reason') or 'Размещение на Ярмарке Тщеславия сейчас недоступно'
    if not user.posts.filter(post_type='post', status__in=CANDIDATE_STATUSES).exists():
        return False, 'У вас нет опубликованных креативов!'
    return True, ''


def _with_categories(qs):
    return qs.prefetch_related(
        Prefetch('category', queryset=Category.objects.select_related('parent'), to_attr='v2_category'))


def stories(mode):
    """20 последних историй ярмарки — новые сверху (по дате размещения story_date)."""
    qs = Post.objects.filter(post_type='story', status__in=STORY_STATUSES, site__in=sites_for(mode),
                             story_date__isnull=False)
    qs = _with_categories(qs.select_related('author', 'author__profile'))
    return list(qs.order_by('-story_date', '-id')[:STORIES_LIMIT])


def candidates(user, mode, before=None):
    """Свои публикации, которые можно разместить (select_ebloscope), новые сверху; курсор — id."""
    qs = Post.objects.filter(author=user, post_type__in=CANDIDATE_TYPES, status__in=CANDIDATE_STATUSES,
                             site__in=sites_for(mode))
    if before is not None:
        qs = qs.filter(id__lt=before)
    items = list(_with_categories(qs).order_by('-id')[:CANDIDATES_LIMIT + 1])
    return items[:CANDIDATES_LIMIT], len(items) > CANDIDATES_LIMIT


def duplicates(posts):
    """id постов, у которых уже есть такая же история (тот же заголовок и текст) —
    Post.post_to_story такие отклоняет. Один запрос по заголовкам страницы."""
    titles = {p.title for p in posts}
    if not titles:
        return set()
    taken = set(Post.objects.filter(post_type='story', title__in=titles).values_list('title', 'content'))
    return {p.id for p in posts if (p.title, p.content) in taken}


def stories_by_ids(ids, mode):
    """Только что размещённая история — в том же виде, что в ленте ярмарки (если она туда попадает)."""
    qs = Post.objects.filter(id__in=ids, post_type='story', status__in=STORY_STATUSES, site__in=sites_for(mode),
                             story_date__isnull=False)
    return list(_with_categories(qs.select_related('author', 'author__profile')))


# ── 3. api/story/payment.py ───────────────────────────────────────────────────
"""
Оплата размещения на ярмарке — через API.

ВРЕМЕННО списание идёт ДВАЖДЫ: здесь и в Post.save() (блок «списание_литов_за_публикацию_в_еблоскоп»).
Так задумано на время проверки (решение 2026-10-21): ярмарка в новом виде включена только у
администратора, а админы не платят. Перед включением для всех этот блок в Post.save() отключить.
"""
from altermoney.models import Transaction

from api.story.rules import is_free


class PaymentError(Exception):
    pass


def lock_wallet(user):
    """Строка профиля под блокировкой до конца транзакции: два одновременных размещения одного
    пользователя идут по очереди. Профиль перечитывается из базы — проверка баланса в
    Post.can_story_publish (user.profile.balance) видит свежее значение, а не то, что было
    в памяти на начало запроса."""
    profile = user.profile
    user.profile = type(profile).objects.select_for_update().get(pk=profile.pk)


def charge(user, post):
    """Списать плату за размещение post. Админы (is_staff) не платят.
    Transaction.scope_pay баланс не проверяет — его проверяет Post.can_story_publish до списания
    (rules.can_publish, под блокировкой профиля)."""
    if is_free(user):
        return False
    try:
        Transaction.scope_pay(user, post)
    except Exception as ex:
        raise PaymentError(ex.args[0] if ex.args else 'Не удалось списать литы') from ex
    # баланс после списания — для второй проверки в Post.save() (пока списание двойное)
    user.profile.refresh_from_db()
    return True


# ── 4. api/story/items.py ─────────────────────────────────────────────────────
"""JSON ярмарки — только данные; кружок, цвет по рубрике и подсказку с девизом рисует клиент."""
import html

from django.utils.html import strip_tags

from api.feed.cards import _author, _categories, _counts, _excerpt, _first_images, _image, _lines


def _category(post, mode):
    """Рубрика истории — от неё цвет круга (как parts/scope_avatar.html): первая рубрика своего сайта."""
    cats = _categories(post, mode)
    return {'slug': cats[0]['slug'], 'title': cats[0]['title']} if cats else None


def story(post, mode):
    return {
        'id': post.id,
        'url': post.get_url(),
        'slogan': (post.slogan or '').strip(),
        'date': post.story_date.isoformat(),
        'category': _category(post, mode),
        'author': _author(post.author),
    }


def candidate(post, mode, duplicate):
    return {
        'id': post.id,
        'url': post.get_url(),
        'title': html.unescape(strip_tags(post.title or '')),
        'excerpt': _excerpt(post),
        'date': post.date.isoformat(),
        'status': post.status,  # published | profile — «в профиле» помечаем в списке
        'categories': _categories(post, mode),
        # такая история уже есть — разместить ещё раз нельзя (Post.post_to_story)
        'duplicate': duplicate,
    }


def detail(post, mode, sites, user):
    """История целиком — для просмотра «как сториз»: текст по строкам (без HTML и шорткодов),
    первая картинка (и как размытый фон), лайки и комментарии."""
    _first_images([post])
    likes, comments, _reviews, liked = _counts([post], sites, user)
    images = post.v2_images
    return {
        **story(post, mode),
        'title': html.unescape(strip_tags(post.title or '')),
        'published': post.date.isoformat(),
        'categories': _categories(post, mode),
        'text': '\n'.join(_lines(post.content)),
        'image': _image(images[0]) if images else None,
        'counts': {
            'likes': likes.get(post.id, 0),
            'comments': comments.get(post.id, 0),
            'liked': post.id in liked,
        },
    }


# ── 5. api/story/views.py ─────────────────────────────────────────────────────
import logging

from django.db import transaction
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from blog.models import Post

from api.story import rules
from api.story.items import candidate, detail, story
from api.story.payment import PaymentError, charge, lock_wallet

logger = logging.getLogger(__name__)


def _mode(request):
    return getattr(request, 'mode', 'alterlit')


def _offer(user):
    """Условия размещения для окна «+»."""
    allowed, reason = rules.can_publish(user)
    lo, hi = rules.slogan_size()
    return {
        'price': float(rules.price()),
        'free': rules.is_free(user),
        'slogan': {'min': lo, 'max': hi},
        'allowed': allowed,
        'reason': reason,
        'rules_url': '/alterlit-rules/?doc=scope_rules',
    }


class StoryList(APIView):
    """
    GET  /api/v1/story/  — 20 последних историй ярмарки, новые сверху
         → {"items": [...], "viewer": {"id": int | null}}
    POST /api/v1/story/ {"post_id": int, "slogan": str} — разместить свою публикацию (оплата — здесь)
         → 201 {"item": {...история}, "charged": bool}; ошибка — 400/403/404 {"detail": "…"}
    """
    authentication_classes = [SessionAuthentication]

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == 'POST' else [AllowAny()]

    def get(self, request):
        mode = _mode(request)
        return Response({
            'items': [story(p, mode) for p in rules.stories(mode)],
            'viewer': {'id': request.user.id if request.user.is_authenticated else None},
        })

    def post(self, request):
        user, mode = request.user, _mode(request)
        try:
            post_id = int(request.data.get('post_id'))
        except (TypeError, ValueError):
            return Response({'detail': 'Не выбрана публикация'}, status=400)
        slogan = str(request.data.get('slogan') or '').strip()
        lo, hi = rules.slogan_size()
        if not lo <= len(slogan) <= hi:
            return Response({'detail': f'Длина девиза — от {lo} до {hi} символов'}, status=400)

        is_editor = user.has_perm('blog.add_post')
        try:
            with transaction.atomic():
                lock_wallet(user)
                # баланс и лимиты — под блокировкой: второй одновременный запрос увидит первое списание
                allowed, reason = rules.can_publish(user)
                if not allowed:
                    return Response({'detail': reason}, status=403)
                try:
                    p = Post.objects.select_for_update().get(id=post_id)
                except Post.DoesNotExist:
                    return Response({'detail': 'Публикация не найдена'}, status=404)
                if p.author_id != user.id and not is_editor:
                    return Response({'detail': 'Операция запрещена'}, status=403)
                if p.post_type not in rules.CANDIDATE_TYPES or p.site not in rules.sites_for(mode):
                    return Response({'detail': 'Эту публикацию нельзя разместить на Ярмарке Тщеславия'}, status=400)

                charged = charge(user, p)
                # дальше — старая логика как есть: проверки, смена типа на story, story_date, save()
                # (ВРЕМЕННО save() тоже списывает литы — см. payment.py)
                p.post_to_story(slogan, sender=user if is_editor else None)
        except PaymentError as ex:
            return Response({'detail': str(ex)}, status=400)
        except Exception as ex:
            # Post.post_to_story и Post.save сообщают причину текстом исключения
            logger.warning('story publish %s: %s', post_id, ex, exc_info=True)
            return Response({'detail': ex.args[0] if ex.args else 'Не удалось разместить публикацию'}, status=400)

        p = rules.stories_by_ids([p.id], mode)
        if not p:
            # размещено, но в ленту ярмарки не попадает (статус или сайт) — клиент перезапросит ленту
            return Response({'item': None, 'charged': charged}, status=201)
        return Response({'item': story(p[0], mode), 'charged': charged}, status=201)


class StoryDetail(APIView):
    """
    GET /api/v1/story/<id>/ — история целиком для просмотра «как сториз»
        → {...как в списке, "title", "published", "categories", "text", "image": {...} | null,
           "counts": {"likes", "comments", "liked"}}; не история / чужой сайт / не тот статус — 404
    Лайк — старой ручкой POST /likes/post/<id>/, как в ленте.
    """
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request, pk):
        mode = _mode(request)
        found = rules.stories_by_ids([pk], mode)
        if not found:
            return Response({'detail': 'Публикация не найдена'}, status=404)
        return Response(detail(found[0], mode, rules.sites_for(mode), request.user))


class Candidates(APIView):
    """
    GET /api/v1/story/candidates/?before=<id> — свои публикации, которые можно разместить
        → {"posts": [...], "more": bool, на первой странице "offer": {price, free, slogan:{min,max},
           allowed, reason, rules_url}}
    """
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        mode = _mode(request)
        before = request.query_params.get('before')
        before = int(before) if before and before.isdigit() else None
        posts, more = rules.candidates(request.user, mode, before=before)
        dup = rules.duplicates(posts)
        data = {'posts': [candidate(p, mode, p.id in dup) for p in posts], 'more': more}
        if before is None:
            data['offer'] = _offer(request.user)
        return Response(data)


# ── 6. api/story/urls.py ──────────────────────────────────────────────────────
from django.urls import path

from api.story import views

# в api/urls.py: path('story/', include('api.story.urls')),
urlpatterns = [
    path('', views.StoryList.as_view(), name='story'),
    path('<int:pk>/', views.StoryDetail.as_view(), name='story-detail'),
    path('candidates/', views.Candidates.as_view(), name='story-candidates'),
]


# ── 7. api/urls.py (общий файл API, /api/v1/…) ─────────────────────────────────
#     path('story/', include('api.story.urls')),


# ── 8. Шаблон главной ───────────────────────────────────────────────────────────
# Блок <div id="fair-wrap">…</div> и его <script> с fair.lightSlider(…) — под условие; сначала
# остров только у вас:
#
#     {% if request.user.id == 1 %}
#         <div id="alterlit-story" data-csrf="{{ csrf_token }}"></div>
#     {% else %}
#         … старый #fair-wrap и скрипт lightSlider как есть …
#     {% endif %}
#
# и подключить сборку (в блоке стилей и скриптов страницы, при том же условии):
#
#     <link rel="stylesheet" href="/assets/story/story.css?v=1">
#     <script type="module" src="/assets/story/story.js?v=1"></script>
#
# Остров встаёт туда же, где был #fair-wrap (position: absolute, top: 70px), с теми же размерами
# кружков — отступ #alterlit (--pad-top) в шаблоне менять не нужно. Прилипание к шапке при
# прокрутке (раньше ScrollMagic + классы fix/min) остров делает сам; старые сцены ScrollMagic
# ищут #fair-wrap — без него они ничего не делают.
#
# Когда остров будет у всех: удалить #fair-wrap, его стили (#fair…, #fair-wrap…), скрипт lightSlider
# на главной, сцены ScrollMagic для #fair-wrap и _add_fair_handler / обработчики #fair .f-link в base.html.
