#!/usr/bin/env python3
"""Extract each student's photo from the roster PDF, named <studentNo>.jpg.

The PDF is a two-column table (Photo | ID Number). Images extract in document order,
but rows without a photo would break a naive zip, so we match each image to the ID word
sharing its row (nearest vertical center). Rows with no nearby image simply get no file.

    pip install pymupdf
    python3 extract-photos.py "/path/Active Students.pdf" ./photos "/path/Active Students.csv"

The 3rd arg (roster CSV) restricts matches to real student IDs and reports coverage.
"""
import csv
import re
import sys
from pathlib import Path

import fitz  # pymupdf

ID_RE = re.compile(r"^[A-Za-z]\d{3,}[A-Za-z0-9]*$")
ROW_TOLERANCE = 40  # pts: max |dy| between an image center and its ID word


def load_ids(csv_path: str | None) -> set[str] | None:
    if not csv_path:
        return None
    with open(csv_path, newline="", encoding="utf-8") as f:
        return {r["ID Number"].strip() for r in csv.DictReader(f) if r["ID Number"].strip()}


def main() -> None:
    pdf_path, out_dir = sys.argv[1], sys.argv[2]
    valid_ids = load_ids(sys.argv[3] if len(sys.argv) > 3 else None)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    written: dict[str, int] = {}

    for page in doc:
        # Candidate ID words on this page, with their vertical centers.
        id_words = [
            (w[4].strip(), (w[1] + w[3]) / 2)
            for w in page.get_text("words")
            if ID_RE.match(w[4].strip()) and (valid_ids is None or w[4].strip() in valid_ids)
        ]
        if not id_words:
            continue

        for xref, *_ in page.get_images(full=True):
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            ycenter = (rects[0].y0 + rects[0].y1) / 2
            student_no, dy = min(((sid, abs(ycenter - y)) for sid, y in id_words), key=lambda t: t[1])
            if dy > ROW_TOLERANCE or student_no in written:
                continue
            img = doc.extract_image(xref)
            (out / f"{student_no}.{img['ext']}").write_bytes(img["image"])
            written[student_no] = xref

    print(f"Wrote {len(written)} photos to {out}")
    if valid_ids is not None:
        no_photo = sorted(valid_ids - written.keys())
        print(f"{len(no_photo)} of {len(valid_ids)} students have no photo: {', '.join(no_photo) or '(none)'}")


if __name__ == "__main__":
    main()
