"""Build the offline lecture map and include its custom search interface."""
from pathlib import Path
import os
import subprocess
import tempfile

folder = Path(__file__).resolve().parent
source = (folder / 'Lecture-map.md').read_text(encoding='utf-8-sig')
source = source.removeprefix('# Lecture map\n').removeprefix('# Lecture map\r\n')
frontmatter = '---\ntitle: Lecture map\n---\n\n'
output = folder / 'Lecture-map.html'
with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.md', prefix='.lecture-map-', dir=folder, delete=False) as temp:
    temp.write(frontmatter + source)
    input_path = Path(temp.name)
try:
    subprocess.run(['npx.cmd' if os.name == 'nt' else 'npx', '--yes', '@markmap/cli@1.1.1', str(input_path), '--no-open', '-o', str(output)], check=True)
    html = output.read_text(encoding='utf-8')
    script = '\n'.join((folder / name).read_text(encoding='utf-8-sig') for name in (
        'lecture-map-search.js', 'lecture-map-quiz.js',
    ))
    if html.count('</body>') != 1 or '</script' in script.lower():
        raise ValueError('Unexpected generated HTML or unsafe script content')
    output.write_text(html.replace('</body>', '<script>\n' + script + '\n</script>\n</body>'), encoding='utf-8')
finally:
    input_path.unlink(missing_ok=True)
