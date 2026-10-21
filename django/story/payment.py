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
