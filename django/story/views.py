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
