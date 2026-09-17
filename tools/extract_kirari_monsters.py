"""Extract the 96 Kirari monster assets from the approved source PDF.

The PDF stores four 4x3 colour sprite sheets per gender.  Page 1 (girls)
and page 7 (boys) place those sheets from left to right in the canonical
stage order: egg, hatch, junior, adult.  Types are stored row-major as
01-12.  We use those structural labels rather than appearance inference.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from collections import deque
from pathlib import Path

import pdfplumber
from PIL import Image
from pypdf import PdfReader


TYPE_NAMES = [
    "ヒラメキラ", "ツクリオン", "ミッケル", "トビコン",
    "コツミン", "コトハネ", "ヨリソ", "ムスビット",
    "イロドラ", "ミチシル", "ヨロコビィ", "センディア",
]
STAGES = [
    ("egg", "卵"),
    ("hatch", "孵化後"),
    ("junior", "ジュニア"),
    ("adult", "大人"),
]
GENDERS = [
    ("female", "女の子版", 0),
    ("male", "男の子版", 6),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def transparent_background(source: Image.Image) -> Image.Image:
    """Remove only the near-white background connected to the crop edges."""

    image = source.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def is_background(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        return min(red, green, blue) >= 240 and max(red, green, blue) - min(red, green, blue) <= 22

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if visited[index] or not is_background(x, y):
            continue
        visited[index] = 1
        red, green, blue, _ = pixels[x, y]
        darkest = min(red, green, blue)
        alpha = 0 if darkest >= 249 else min(235, (249 - darkest) * 27)
        pixels[x, y] = (red, green, blue, alpha)
        if x:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    return image


def remove_edge_fragments(source: Image.Image) -> Image.Image:
    """Remove small pieces of a neighbouring grid cell without altering art.

    A few characters extend by a handful of pixels into the adjacent cell in
    the source sprite sheets.  Those pieces are isolated from the character in
    the current cell and touch the crop border.  The largest component is
    always retained, as are all non-border components (such as sparkles).
    """

    image = source.copy()
    alpha = image.getchannel("A")
    width, height = image.size
    visible = alpha.load()
    visited = bytearray(width * height)
    components: list[tuple[list[tuple[int, int]], bool]] = []

    for start_y in range(height):
        for start_x in range(width):
            start_index = start_y * width + start_x
            if visited[start_index] or visible[start_x, start_y] <= 24:
                continue
            queue = deque([(start_x, start_y)])
            visited[start_index] = 1
            points: list[tuple[int, int]] = []
            touches_edge = False
            while queue:
                x, y = queue.popleft()
                points.append((x, y))
                touches_edge = touches_edge or x == 0 or y == 0 or x == width - 1 or y == height - 1
                for next_x, next_y in (
                    (x - 1, y - 1), (x, y - 1), (x + 1, y - 1),
                    (x - 1, y),                     (x + 1, y),
                    (x - 1, y + 1), (x, y + 1), (x + 1, y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    index = next_y * width + next_x
                    if visited[index] or visible[next_x, next_y] <= 24:
                        continue
                    visited[index] = 1
                    queue.append((next_x, next_y))
            components.append((points, touches_edge))

    if not components:
        return image

    largest_size = max(len(points) for points, _ in components)
    pixels = image.load()
    for points, touches_edge in components:
        if not touches_edge or len(points) == largest_size or len(points) >= 5000:
            continue
        for x, y in points:
            red, green, blue, _ = pixels[x, y]
            pixels[x, y] = (red, green, blue, 0)
    return image


def stage_sheet_names(pdf_path: Path, page_index: int) -> list[str]:
    with pdfplumber.open(pdf_path) as document:
        placements = document.pages[page_index].images
        first_type = sorted(placements[:4], key=lambda placement: placement["x0"])
        names = [str(placement["name"]) for placement in first_type]
    if len(names) != 4 or len(set(names)) != 4:
        raise ValueError(f"Could not identify four stage sheets on page {page_index + 1}")
    return names


def extract(pdf_path: Path, output_dir: Path) -> None:
    reader = PdfReader(pdf_path)
    if len(reader.pages) != 12:
        raise ValueError(f"Expected 12 PDF pages, found {len(reader.pages)}")

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, object] = {
        "source": pdf_path.name,
        "sourceSha256": sha256(pdf_path),
        "grid": {"columns": 4, "rows": 3},
        "sourceStructure": {},
        "types": [],
    }

    for gender_key, gender_label, page_index in GENDERS:
        image_map = {image.name.removesuffix(".png"): image for image in reader.pages[page_index].images}
        sheet_names = stage_sheet_names(pdf_path, page_index)
        manifest["sourceStructure"][gender_key] = {
            "label": gender_label,
            "page": page_index + 1,
            "stages": {
                stage_key: {
                    "label": stage_label,
                    "position": position,
                    "pageImageName": sheet_name,
                }
                for position, ((stage_key, stage_label), sheet_name)
                in enumerate(zip(STAGES, sheet_names, strict=True), start=1)
            },
        }
        for (stage_key, _), sheet_name in zip(STAGES, sheet_names, strict=True):
            source_image = Image.open(io.BytesIO(image_map[sheet_name].data)).convert("RGB")
            if source_image.size != (1448, 1086):
                raise ValueError(f"Unexpected sheet size {source_image.size} for {gender_key}/{stage_key}")
            cell_width = source_image.width // 4
            cell_height = source_image.height // 3
            for type_index in range(12):
                column = type_index % 4
                row = type_index // 4
                crop = source_image.crop((
                    column * cell_width,
                    row * cell_height,
                    (column + 1) * cell_width,
                    (row + 1) * cell_height,
                ))
                asset = remove_edge_fragments(transparent_background(crop))
                filename = f"{gender_key}-{type_index + 1:02d}-{stage_key}.png"
                asset.save(output_dir / filename, format="PNG", optimize=True)

    for type_index, type_name in enumerate(TYPE_NAMES, start=1):
        variants = {}
        for gender_key, gender_label, _ in GENDERS:
            stages = {}
            for stage_key, stage_label in STAGES:
                filename = f"{gender_key}-{type_index:02d}-{stage_key}.png"
                path = output_dir / filename
                with Image.open(path) as image:
                    if image.size != (362, 362) or image.mode != "RGBA":
                        raise ValueError(f"Invalid asset {filename}: {image.mode} {image.size}")
                    if image.getchannel("A").getbbox() is None:
                        raise ValueError(f"Asset has no visible pixels: {filename}")
                stages[stage_key] = {"label": stage_label, "file": filename, "sha256": sha256(path)}
            variants[gender_key] = {"label": gender_label, "stages": stages}
        manifest["types"].append({
            "number": type_index,
            "name": type_name,
            "gridCell": {"column": (type_index - 1) % 4 + 1, "row": (type_index - 1) // 4 + 1},
            "variants": variants,
        })

    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Extracted 96 assets to {output_dir}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_kirari_monsters.py SOURCE.pdf OUTPUT_DIR")
    extract(Path(sys.argv[1]), Path(sys.argv[2]))
