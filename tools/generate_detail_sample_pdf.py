"""Generate the bright one-page sample used to review the detailed result PDF."""

from io import BytesIO
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


PROJECT = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[3]
DIST = PROJECT / "dist"
OUTPUT = ROOT / "output" / "pdf" / "talent-monster-detail-sample-hiramekira.pdf"
FONT_REGULAR = Path(r"C:\Windows\Fonts\BIZ-UDGothicR.ttc")
FONT_BOLD = Path(r"C:\Windows\Fonts\BIZ-UDGothicB.ttc")

W, H = A4
NAVY = HexColor("#16366F")
INK = HexColor("#243B64")
MUTED = HexColor("#526889")
CYAN = HexColor("#54D9F4")
YELLOW = HexColor("#FFE071")
PINK = HexColor("#FFBBDD")
MINT = HexColor("#9AE7D1")


def sprite(path: Path, index: int = 0) -> ImageReader:
    image = Image.open(path).convert("RGBA")
    cell_w, cell_h = image.width // 4, image.height // 3
    col, row = index % 4, index // 4
    crop = image.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
    buffer = BytesIO()
    crop.save(buffer, format="PNG")
    buffer.seek(0)
    return ImageReader(buffer)


def rounded_box(pdf, x, y, width, height, fill, stroke=None, radius=10, line=1):
    pdf.setFillColor(fill)
    pdf.setStrokeColor(stroke or fill)
    pdf.setLineWidth(line)
    pdf.roundRect(x, y, width, height, radius, fill=1, stroke=1)


def paragraph(pdf, text, x, top, width, size=8.2, leading=13, color=INK, bold=False, max_height=120):
    style = ParagraphStyle(
        "jp",
        fontName="BIZ-Bold" if bold else "BIZ-Regular",
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=TA_LEFT,
        spaceAfter=0,
    )
    block = Paragraph(text, style)
    _, height = block.wrap(width, max_height)
    block.drawOn(pdf, x, top - height)
    return height


def draw_contained(pdf, image, x, y, width, height, pad=4):
    pdf.drawImage(image, x + pad, y + pad, width - 2 * pad, height - 2 * pad, preserveAspectRatio=True, anchor="c", mask="auto")


def build_pdf(output: Path = OUTPUT):
    output.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("BIZ-Regular", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("BIZ-Bold", str(FONT_BOLD)))

    egg = sprite(DIST / "monster-eggs-roster.png")
    first = sprite(DIST / "monster-roster.png")
    evolved = sprite(DIST / "monster-evolved-roster.png")

    pdf = canvas.Canvas(str(output), pagesize=A4)
    pdf.setTitle("才能モンスター 詳細診断シート｜ヒラメキラ")
    pdf.setAuthor("こども起業家研究所 ～博士ちゃんラボ～")

    # Bright paper and decorative bubbles.
    pdf.setFillColor(HexColor("#F7FCFF"))
    pdf.rect(0, 0, W, H, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#FFF3AD"))
    pdf.circle(W - 28, H - 28, 58, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#DFF8FF"))
    pdf.circle(12, H * 0.57, 65, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#FFEAF5"))
    pdf.circle(W - 8, 105, 52, fill=1, stroke=0)

    margin = 38
    inner = W - 2 * margin

    pdf.setFillColor(HexColor("#2F6BBF"))
    pdf.setFont("BIZ-Bold", 8.5)
    pdf.drawString(margin, H - 40, "TALENT MONSTER REPORT")
    pdf.setFillColor(NAVY)
    pdf.setFont("BIZ-Bold", 23)
    pdf.drawString(margin, H - 66, "才能モンスター 詳細診断シート")
    rounded_box(pdf, W - margin - 80, H - 66, 80, 22, NAVY, radius=11)
    pdf.setFillColor(HexColor("#FFFFFF"))
    pdf.setFont("BIZ-Bold", 8.5)
    pdf.drawCentredString(W - margin - 40, H - 59, "TYPE 01 / 12")
    pdf.setStrokeColor(CYAN)
    pdf.setLineWidth(4)
    pdf.line(margin, H - 78, W - margin, H - 78)

    # Hero: egg + monster summary.
    hero_top = H - 94
    hero_h = 174
    image_w = 158
    rounded_box(pdf, margin, hero_top - hero_h, image_w, hero_h, HexColor("#FFF9D7"), HexColor("#8FE7F5"), radius=18, line=1.5)
    rounded_box(pdf, margin + 12, hero_top - 139, image_w - 24, 126, HexColor("#FFFFFF"), radius=14)
    draw_contained(pdf, egg, margin + 14, hero_top - 137, image_w - 28, 122, pad=2)
    pdf.setFillColor(HexColor("#3E5E8C"))
    pdf.setFont("BIZ-Bold", 8.2)
    pdf.drawCentredString(margin + image_w / 2, hero_top - 156, "可能性いっぱいのモンスターの卵")

    sx = margin + image_w + 22
    sw = inner - image_w - 22
    rounded_box(pdf, sx, hero_top - 22, 58, 20, HexColor("#DDF8FD"), radius=10)
    pdf.setFillColor(HexColor("#1A5F8C"))
    pdf.setFont("BIZ-Bold", 8.7)
    pdf.drawCentredString(sx + 29, hero_top - 15, "創造の星")
    pdf.setFillColor(NAVY)
    pdf.setFont("BIZ-Bold", 27)
    pdf.drawString(sx, hero_top - 53, "ヒラメキラ")
    pdf.setFillColor(MUTED)
    pdf.setFont("BIZ-Bold", 9.8)
    pdf.drawString(sx, hero_top - 70, "ひらめき発明家タイプ")
    paragraph(pdf, "まだないものを思いつく、<br/>アイデアの冒険者", sx, hero_top - 88, sw, size=12.8, leading=17, color=NAVY, bold=True)
    paragraph(pdf, "決まったやり方にとらわれず、「こんなのはどう？」と新しい景色を描ける子。ふとした思いつきの中に、誰かを驚かせる小さな発明が眠っています。", sx, hero_top - 127, sw, size=8.8, leading=13.5, color=INK)
    chips = [("発想する力", CYAN), ("工夫する力", YELLOW), ("新しい見方", PINK)]
    chip_x = sx
    for label, color in chips:
        rounded_box(pdf, chip_x, hero_top - 174, 66, 20, color, radius=10)
        pdf.setFillColor(NAVY)
        pdf.setFont("BIZ-Bold", 7.8)
        pdf.drawCentredString(chip_x + 33, hero_top - 167, label)
        chip_x += 72

    # Growth cards.
    cards_top = hero_top - hero_h - 16
    gap = 12
    card_w = (inner - gap) / 2
    card_h = 94
    rounded_box(pdf, margin, cards_top - card_h, card_w, card_h, HexColor("#FFF3C9"), HexColor("#FFDA63"), radius=14, line=1.2)
    rounded_box(pdf, margin + card_w + gap, cards_top - card_h, card_w, card_h, HexColor("#E7F9F4"), HexColor("#75DCC0"), radius=14, line=1.2)
    pdf.setFillColor(NAVY)
    pdf.setFont("BIZ-Bold", 10.7)
    pdf.drawString(margin + 12, cards_top - 19, "才能を育てるヒント")
    pdf.drawString(margin + card_w + gap + 12, cards_top - 19, "今日からできる最初の一歩")
    paragraph(pdf, "「おもしろいね。もう少し聞かせて」と、まずアイデアを最後まで聞いてみて。実現できるかを急いで決めず、絵やメモにすると才能が育ちます。", margin + 12, cards_top - 31, card_w - 24, size=8.2, leading=12.2, color=INK)
    paragraph(pdf, "思いついたアイデアを絵にして、1枚の「発明メモ」を作ってみよう。", margin + card_w + gap + 12, cards_top - 31, card_w - 24, size=8.6, leading=13, color=INK, bold=True)

    # Evolution story.
    evolution_top = cards_top - card_h - 18
    pdf.setFillColor(NAVY)
    pdf.setFont("BIZ-Bold", 11.5)
    pdf.drawString(margin, evolution_top, "モンスターの進化ストーリー")
    pdf.setFillColor(MUTED)
    pdf.setFont("BIZ-Regular", 8)
    pdf.drawString(margin + 151, evolution_top, "得意なところを育てるほど、姿も力も進化していく！")
    stage_top = evolution_top - 10
    stage_h = 112
    stage_gap = 10
    stage_w = (inner - 2 * stage_gap) / 3
    stages = [("卵", "まだ見ぬ可能性", egg), ("進化①", "好きを試して育つ", first), ("進化②", "得意を力に変える", evolved)]
    for i, (label, note, image) in enumerate(stages):
        x = margin + i * (stage_w + stage_gap)
        rounded_box(pdf, x, stage_top - stage_h, stage_w, stage_h, HexColor("#FFFFFF"), HexColor("#C7D9F7"), radius=13, line=1)
        rounded_box(pdf, x + 8, stage_top - 79, stage_w - 16, 70, HexColor("#EFFBFF"), radius=10)
        draw_contained(pdf, image, x + 10, stage_top - 77, stage_w - 20, 66, pad=1)
        pdf.setFillColor(NAVY)
        pdf.setFont("BIZ-Bold", 9.3)
        pdf.drawCentredString(x + stage_w / 2, stage_top - 92, label)
        pdf.setFillColor(MUTED)
        pdf.setFont("BIZ-Regular", 7.6)
        pdf.drawCentredString(x + stage_w / 2, stage_top - 104, note)

    # Shop prediction and footer.
    shop_top = stage_top - stage_h - 14
    shop_h = 59
    rounded_box(pdf, margin, shop_top - shop_h, inner, shop_h, HexColor("#F8EAFD"), HexColor("#E3B9E7"), radius=14, line=1)
    pdf.setFillColor(HexColor("#82448F"))
    pdf.setFont("BIZ-Bold", 9.8)
    pdf.drawString(margin + 13, shop_top - 20, "お店タイプ予報")
    pdf.setFillColor(HexColor("#4F317E"))
    pdf.setFont("BIZ-Bold", 10.2)
    pdf.drawString(margin + 124, shop_top - 20, "「作る系」のお店が向いてるかも！？")
    pdf.setFillColor(HexColor("#604F79"))
    pdf.setFont("BIZ-Regular", 8.2)
    pdf.drawString(margin + 124, shop_top - 36, "ひらめいたアイデアを、自分らしい形にしてみるスタイル。")

    talk_top = shop_top - shop_h - 14
    talk_h = 70
    rounded_box(pdf, margin, talk_top - talk_h, inner, talk_h, HexColor("#EAFBF4"), HexColor("#8DDFD4"), radius=14, line=1)
    pdf.setFillColor(HexColor("#17617A"))
    pdf.setFont("BIZ-Bold", 10.2)
    pdf.drawString(margin + 13, talk_top - 21, "親子で話してみよう")
    prompts = [
        "最近『これ、おもしろい！』と思ったのはどんなこと？",
        "このモンスターに、新しい力をひとつ足すなら？",
        "今日できる最初の一歩を、いつやってみる？",
    ]
    for i, prompt in enumerate(prompts):
        py = talk_top - 38 - i * 14
        pdf.setFillColor(HexColor("#EC9B29"))
        pdf.circle(margin + 18, py + 2, 3, fill=1, stroke=0)
        pdf.setFillColor(HexColor("#3B6172"))
        pdf.setFont("BIZ-Bold", 7.8)
        pdf.drawString(margin + 28, py, prompt)

    insight_top = talk_top - talk_h - 13
    insight_h = 78
    insight_w = (inner - gap) / 2
    rounded_box(pdf, margin, insight_top - insight_h, insight_w, insight_h, HexColor("#EAF5FF"), HexColor("#8EC9FF"), radius=13, line=1)
    rounded_box(pdf, margin + insight_w + gap, insight_top - insight_h, insight_w, insight_h, HexColor("#FFF0E9"), HexColor("#FFB5A9"), radius=13, line=1)
    pdf.setFillColor(NAVY)
    pdf.setFont("BIZ-Bold", 9.3)
    pdf.drawString(margin + 11, insight_top - 18, "この才能が育った未来")
    pdf.drawString(margin + insight_w + gap + 11, insight_top - 18, "つまずいた時のヒント")
    paragraph(pdf, "自由な発想を、人が使える商品や仕組みに変える力へ。新しい遊びやサービスを生み出す人として活躍できそうです。", margin + 11, insight_top - 29, insight_w - 22, size=7.5, leading=10.6, color=INK, bold=True)
    paragraph(pdf, "アイデアが次々浮かんで途中で止まりやすいことも。まずは一番お気に入りをひとつ選び、小さく完成させる体験を作ってみて。", margin + insight_w + gap + 11, insight_top - 29, insight_w - 22, size=7.5, leading=10.6, color=INK, bold=True)

    footer_y = 34
    pdf.setStrokeColor(HexColor("#D9E4F7"))
    pdf.setLineWidth(0.8)
    pdf.line(margin, footer_y + 24, W - margin, footer_y + 24)
    pdf.setFillColor(MUTED)
    pdf.setFont("BIZ-Regular", 6.8)
    pdf.drawString(margin, footer_y + 10, "この診断は、親子で『好き』と強みを見つけるきっかけです。　診断日：2026年9月15日｜おとな回答")
    pdf.setFillColor(HexColor("#28599E"))
    pdf.setFont("BIZ-Bold", 7.3)
    pdf.drawRightString(W - margin, footer_y - 2, "こども起業家研究所 ～博士ちゃんラボ～")

    pdf.showPage()
    pdf.save()
    return output


if __name__ == "__main__":
    print(build_pdf())
