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
