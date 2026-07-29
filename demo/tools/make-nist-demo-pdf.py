#!/usr/bin/env python3
"""Builds demo/enforcement-doc-nist-dev.pdf — a condensed, developer-relevant
slice of NIST SP 800-53r5 suitable for demos and customer sharing.

Keeps only the controls that bear on how software is written, tested, and
secured — the SA developer controls (SA-8 security engineering through SA-22),
SC-13 cryptographic protection, and the SI input-validation/error-handling/
memory-protection block — so the demo PDF is ~46 real NIST pages instead of
~492.

Usage:
    python3 demo/tools/make-nist-demo-pdf.py [path-to-NIST.SP.800-53r5.pdf]

Default source: ~/Downloads/NIST.SP.800-53r5.pdf
"""
import re
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter

# Deeply nested PDF object graphs (title-page links) overflow the default limit
sys.setrecursionlimit(100_000)

# (label, start pattern, end pattern, max pages fallback). A range runs from
# the body page where `start` matches (TOC/appendix hits are skipped by taking
# the first match past page 20 that is not in the control-index appendix) to
# the page before `end` matches.
SECTIONS = [
    ('SA developer controls (SA-8..SA-22)',
     r'SA-8\s+SECURITY AND PRIVACY ENGINEERING PRINCIPLES',
     r'3\.\d+\s*SYSTEM AND COMMUNICATIONS PROTECTION', 40),
    ('SC-13 cryptographic protection',
     r'SC-13\s+CRYPTOGRAPHIC PROTECTION',
     r'SC-15\s+COLLABORATIVE COMPUTING', 3),
    ('SI integrity controls (SI-10..SI-16)',
     r'SI-10\s+INFORMATION INPUT VALIDATION',
     r'3\.\d+\s*SUPPLY CHAIN RISK MANAGEMENT', 12),
]

BODY_START = 20   # skip cover/TOC matches
APPENDIX_START = 460  # skip control-index appendix matches


def page_texts(reader):
    texts = []
    for page in reader.pages:
        texts.append((page.extract_text() or '').replace('\n', ' '))
    return texts


def find_page(texts, pattern, start_at=BODY_START):
    rx = re.compile(pattern, re.IGNORECASE)
    for i in range(start_at, min(len(texts), APPENDIX_START)):
        if rx.search(texts[i]):
            return i
    return None


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'Downloads' / 'NIST.SP.800-53r5.pdf'
    out = Path(__file__).resolve().parents[1] / 'enforcement-doc-nist-dev.pdf'

    reader = PdfReader(str(source))
    print(f'Reading {source} ({len(reader.pages)} pages)...')
    texts = page_texts(reader)
    writer = PdfWriter()

    # Title page for provenance
    writer.add_page(reader.pages[0])
    kept = 1

    for label, start_pat, end_pat, max_pages in SECTIONS:
        start = find_page(texts, start_pat)
        if start is None:
            print(f'WARNING: could not locate section start: {label}')
            continue
        end = find_page(texts, end_pat, start_at=start + 1)
        if end is None or end - start > max_pages:
            end = start + max_pages
        for i in range(start, end):
            writer.add_page(reader.pages[i])
        kept += end - start
        print(f'{label}: pages {start + 1}-{end} ({end - start} pages)')

    writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    for page in writer.pages:
        page.compress_content_streams()
    with open(out, 'wb') as f:
        writer.write(f)
    print(f'\nWrote {out} ({kept} pages)')


if __name__ == '__main__':
    main()
