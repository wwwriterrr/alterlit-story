"""Собирает django/story_patch.py: шапка + модули пакета api/story/ по порядку."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'django'
MODULES = ['rules.py', 'payment.py', 'items.py', 'views.py', 'urls.py']

parts = [(ROOT / 'story_patch_header.txt').read_text().rstrip() + '\n']
parts.append('\n\n# ── 1. api/story/__init__.py — пустой файл ───────────────────────────────────\n')
for n, name in enumerate(MODULES, start=2):
    title = f'# ── {n}. api/story/{name} '
    parts.append('\n\n' + title + '─' * max(4, 80 - len(title)) + '\n')
    parts.append((ROOT / 'story' / name).read_text().rstrip() + '\n')
parts.append('\n\n' + (ROOT / 'story_patch_footer.txt').read_text().rstrip() + '\n')
(ROOT / 'story_patch.py').write_text(''.join(parts))
print('ok', ROOT / 'story_patch.py')
