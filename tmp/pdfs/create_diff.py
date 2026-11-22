import difflib
import subprocess
import textwrap
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A3, landscape

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/pdf/main-md-f9e4666-changes.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
def version(rev):
    return subprocess.check_output(['git', 'show', f'{rev}:main.md'], cwd=ROOT).decode('utf-8-sig').splitlines()
old, new = version('f9e4666^'), version('f9e4666')
groups = list(difflib.SequenceMatcher(None, old, new, autojunk=False).get_grouped_opcodes(3))
pdfmetrics.registerFont(TTFont('Consolas', r'C:\Windows\Fonts\consola.ttf'))
pdfmetrics.registerFont(TTFont('ConsolasBold', r'C:\Windows\Fonts\consolab.ttf'))
W, H = landscape(A3)
margin, gap = 25, 12
col = (W - 2 * margin - gap) / 2
line_height, font_size = 11, 8
char_width = pdfmetrics.stringWidth('M', 'Consolas', font_size)
width = int((col - 42) / char_width)
bg, fg = HexColor('#1e1e1e'), HexColor('#e4e4e4')
red, green = HexColor('#681b1e'), HexColor('#354c27')
muted, blue = HexColor('#949494'), HexColor('#6ebdf1')
c = canvas.Canvas(str(OUT), pagesize=(W, H))
c.setTitle('main.md changes - f9e4666')
page = 0
def start():
    global page, y
    page += 1
    c.setFillColor(bg); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(fg); c.setFont('ConsolasBold', 12)
    c.drawString(margin, H-25, 'main.md  |  commit f9e4666')
    c.setFont('Consolas', 8); c.setFillColor(muted)
    c.drawRightString(W-margin, H-24, f'Page {page}  |  red: removed  green: added')
    c.setFillColor(blue); c.setFont('ConsolasBold', 9)
    c.drawString(margin, H-43, 'BEFORE  c6f9fff')
    c.drawString(margin+col+gap, H-43, 'AFTER  f9e4666')
    c.setStrokeColor(HexColor('#505050')); c.line(margin+col+gap/2, 22, margin+col+gap/2, H-50)
    y = H-60
def nextpage():
    c.showPage(); start()
def wrapped(s):
    return textwrap.wrap(s.expandtabs(4), width=width, replace_whitespace=False, drop_whitespace=False, break_long_words=True, break_on_hyphens=False) or ['']
def row(left, right, kind):
    global y
    la = wrapped(left[1]) if left else []
    ra = wrapped(right[1]) if right else []
    for i in range(max(len(la), len(ra), 1)):
        if y < 30: nextpage()
        for x, item, lines, color in [(margin,left,la,red),(margin+col+gap,right,ra,green)]:
            if item and kind != 'equal':
                c.setFillColor(color); c.rect(x, y-3, col, line_height, fill=1, stroke=0)
            if item and i < len(lines):
                c.setFont('Consolas', font_size); c.setFillColor(muted)
                if i == 0: c.drawRightString(x+28, y, str(item[0]))
                c.setFillColor(fg if kind != 'equal' else HexColor('#bcbcbc'))
                c.drawString(x+36, y, lines[i])
        y -= line_height
start()
for n, group in enumerate(groups, 1):
    if y < 60: nextpage()
    c.setFillColor(blue); c.setFont('ConsolasBold', 8)
    c.drawString(margin, y, f'CHANGE {n} / {len(groups)}'); y -= 15
    for tag, a, b, x, z in group:
        if tag == 'equal':
            for i in range(b-a): row((a+i+1,old[a+i]), (x+i+1,new[x+i]), tag)
        else:
            for i in range(max(b-a,z-x)):
                row((a+i+1,old[a+i]) if a+i<b else None, (x+i+1,new[x+i]) if x+i<z else None, tag)
    y -= 14
c.save()
print(f'{OUT} | {page} pages | {len(groups)} change groups')
