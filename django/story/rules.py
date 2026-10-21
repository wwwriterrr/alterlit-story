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
