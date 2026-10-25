"""Check the actual PDF at preview resolutions, including non-antialiased hairlines."""
import json
import sys
import fitz

reports = []
for filename in sys.argv[1:]:
    document = fitz.open(filename)
    checked = 0
    for page in document:
        drawings = page.get_drawings()
        regions = [d['rect'] for d in drawings if d['type'] == 's' and .95 <= d['width'] <= 1.05 and len(d['items']) > 5]
        if not regions:
            continue
        edges = []
        for drawing in drawings:
            if drawing['fill'] is None or max(drawing['fill']) > .1:
                continue
            r = drawing['rect']
            vertical = .4 < r.width < 1.3 and r.height > 4
            horizontal = .4 < r.height < 1.3 and r.width > 4
            if not (vertical or horizontal) or not any(region.contains(r) or region.intersects(r) for region in regions):
                continue
            if not page.rect.contains(r):
                continue
            edges.append((r, vertical))
        assert len(edges) > 20, (filename, page.number, 'No table border samples')
        fitz.TOOLS.set_aa_level(0)
        for scale in [.75, 1, 600 / page.rect.width, 1.25]:
            image = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            failures = []
            for r, vertical in edges:
                hits = 0
                for n in range(1, 9):
                    x = round(((r.x0 + r.x1) / 2 if vertical else r.x0 + r.width * n / 9) * scale)
                    y = round((r.y0 + r.height * n / 9 if vertical else (r.y0 + r.y1) / 2) * scale)
                    pixels = [(cx, y) for cx in range(x - 2, x + 3)] if vertical else [(x, cy) for cy in range(y - 2, y + 3)]
                    hits += any(0 <= cx < image.width and 0 <= cy < image.height and max(image.pixel(cx, cy)) < 100 for cx, cy in pixels)
                if hits < 7:
                    failures.append({'edge': list(r), 'vertical': vertical, 'hits': hits})
            assert not failures, (filename, page.number, scale, len(failures), failures[:5])
        checked += len(edges)
    assert checked > 100, (filename, 'No printable table strokes')
    reports.append({'file': filename, 'pages': len(document), 'bordersChecked': checked})
print(json.dumps(reports))
