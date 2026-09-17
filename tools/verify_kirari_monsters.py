"""Mechanically verify all 96 web assets against the approved source PDF."""

from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

import pdfplumber
from PIL import Image
from pypdf import PdfReader


TYPE_NAMES = [
    "ヒラメキラ", "ツクリオン", "ミッケル", "トビコン",
    "コツミン", "コトハネ", "ヨリソ", "ムスビット",
    "イロドラ", "ミチシル", "ヨロコビィ", "センディア",
]
GENDERS = [("female", "女の子版", 0), ("male", "男の子版", 6)]
STAGES = [("egg", "卵"), ("hatch", "孵化後"), ("junior", "ジュニア"), ("adult", "大人")]


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sorted_stage_names(pdf_path: Path, page_index: int) -> list[str]:
    with pdfplumber.open(pdf_path) as document:
        placements = sorted(document.pages[page_index].images[:4], key=lambda item: item["x0"])
    return [str(item["name"]) for item in placements]


def verify(pdf_path: Path, asset_dir: Path) -> None:
    manifest = json.loads((asset_dir / "manifest.json").read_text(encoding="utf-8"))
    reader = PdfReader(pdf_path)
    assert len(reader.pages) == 12, f"expected 12 PDF pages, got {len(reader.pages)}"
    assert manifest["sourceSha256"] == file_hash(pdf_path), "source PDF hash differs from manifest"
    assert manifest["grid"] == {"columns": 4, "rows": 3}
    assert len(manifest["types"]) == 12

    source_sheets: dict[tuple[str, str], Image.Image] = {}
    for gender, gender_label, page_index in GENDERS:
        structure = manifest["sourceStructure"][gender]
        assert structure["label"] == gender_label
        assert structure["page"] == page_index + 1
        names_by_position = sorted_stage_names(pdf_path, page_index)
        page_images = {item.name.removesuffix(".png"): item for item in reader.pages[page_index].images}
        for position, ((stage, stage_label), image_name) in enumerate(zip(STAGES, names_by_position, strict=True), start=1):
            stage_source = structure["stages"][stage]
            assert stage_source == {
                "label": stage_label,
                "position": position,
                "pageImageName": image_name,
            }
            source_sheets[(gender, stage)] = Image.open(io.BytesIO(page_images[image_name].data)).convert("RGB")

    seen_files: set[str] = set()
    pair_checks = 0
    for type_number, expected_name in enumerate(TYPE_NAMES, start=1):
        item = manifest["types"][type_number - 1]
        assert item["number"] == type_number
        assert item["name"] == expected_name
        column = (type_number - 1) % 4
        row = (type_number - 1) // 4
        assert item["gridCell"] == {"column": column + 1, "row": row + 1}

        egg_pair: list[str] = []
        for gender, gender_label, _ in GENDERS:
            variant = item["variants"][gender]
            assert variant["label"] == gender_label
            for stage, stage_label in STAGES:
                expected_file = f"{gender}-{type_number:02d}-{stage}.png"
                stage_item = variant["stages"][stage]
                assert stage_item["label"] == stage_label
                assert stage_item["file"] == expected_file
                path = asset_dir / expected_file
                assert path.is_file(), f"missing {expected_file}"
                assert stage_item["sha256"] == file_hash(path), f"hash mismatch: {expected_file}"
                assert expected_file not in seen_files, f"duplicate asset: {expected_file}"
                seen_files.add(expected_file)

                source_sheet = source_sheets[(gender, stage)]
                cell_width = source_sheet.width // 4
                cell_height = source_sheet.height // 3
                source_crop = source_sheet.crop((
                    column * cell_width,
                    row * cell_height,
                    (column + 1) * cell_width,
                    (row + 1) * cell_height,
                ))
                with Image.open(path) as asset:
                    assert asset.mode == "RGBA" and asset.size == source_crop.size == (362, 362)
                    assert asset.convert("RGB").tobytes() == source_crop.tobytes(), f"PDF cell mismatch: {expected_file}"
                    assert asset.getchannel("A").getbbox() is not None
                if stage == "egg":
                    egg_pair.append(expected_file)
        assert egg_pair == [f"female-{type_number:02d}-egg.png", f"male-{type_number:02d}-egg.png"]
        pair_checks += 1

    actual_files = {path.name for path in asset_dir.glob("*.png")}
    assert actual_files == seen_files, "unexpected or missing PNG assets"
    print(f"OK: {len(seen_files)} PDF-matched assets; {pair_checks} female/male egg pairs")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: verify_kirari_monsters.py SOURCE.pdf ASSET_DIR")
    verify(Path(sys.argv[1]), Path(sys.argv[2]))
