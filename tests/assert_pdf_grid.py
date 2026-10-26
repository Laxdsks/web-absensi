"""Verify one normal-weight vector grid, with no painted CSS grid underneath."""
import collections
import json
import sys
import fitz

reports = []
for filename in sys.argv[1:]:
    document = fitz.open(filename)
    checked = 0
    for page in document:
        # PDF paint commands can extend beyond a page or its print margins.
        # Associate strokes with their real clipping stack before sampling.
        drawings, clips = [], {}
        for command in page.get_drawings(extended=True):
            level = command.get('level', 0)
            clips = {n: box for n, box in clips.items() if n < level}
            if command['type'] == 'clip':
                clips[level] = command['scissor']
                continue
            if command['type'] == 'group':
                continue
            clip = fitz.Rect(page.rect)
            for box in clips.values():
                clip &= box
            command['_clip'] = clip
            drawings.append(command)
        grids = [d for d in drawings if d['type'] == 's' and ((len(d['items']) >= 4 and d['rect'].width > 60 and .7 <= d['width'] <= .8) or (len(d['items']) >= 2 and d['rect'].width > 60 and d['rect'].height > 4 and .95 <= d['width'] <= 1.05))]
        if not grids:
            continue
        assert all(abs(d['width'] - .75) < .02 or abs(d['width'] - 1) < .02 for d in grids), (filename, 'Unexpected thick grid stroke')
        regions = [d['rect'] for d in grids]
        fills = [d['rect'] for d in drawings if d['fill'] is not None and max(d['fill']) < .1
                 and ((.3 < d['rect'].width < 1.3 and d['rect'].height > 4) or (.3 < d['rect'].height < 1.3 and d['rect'].width > 4))
                 and any(r.contains(d['rect']) for r in regions)]
        assert not fills, (filename, page.number, 'CSS border ink remains beneath vector grid', fills[:3])
        edges = []
        for d in grids:
            for item in d['items']:
                if item[0] != 'l':
                    continue
                a, b = item[1:3]
                clip = d['_clip']
                vertical = abs(a.x - b.x) < .05
                horizontal = abs(a.y - b.y) < .05
                if not (vertical or horizontal):
                    continue
                if vertical:
                    if not clip.x0 + .75 <= a.x <= clip.x1 - .75:
                        continue
                    lo, hi = max(min(a.y, b.y), clip.y0), min(max(a.y, b.y), clip.y1)
                    a, b = fitz.Point(a.x, lo), fitz.Point(a.x, hi)
                elif horizontal:
                    # Ignore fractional slivers of the next page's repeated header
                    # that PDF records outside the physical page's painted area.
                    if not clip.y0 + .75 <= a.y <= clip.y1 - .75:
                        continue
                    lo, hi = max(min(a.x, b.x), clip.x0), min(max(a.x, b.x), clip.x1)
                    a, b = fitz.Point(lo, a.y), fitz.Point(hi, a.y)
                if hi - lo <= 4:
                    continue
                edges.append((a, b, vertical))
        assert len(edges) > 20, (filename, 'No table stroke samples')
        seen = collections.defaultdict(list)
        for a, b, vertical in edges:
            key = (vertical, round((a.x if vertical else a.y) * 8))
            start, end = sorted((a.y, b.y) if vertical else (a.x, b.x))
            for other_start, other_end in seen[key]:
                assert min(end, other_end) - max(start, other_start) < .8, (filename, page.number, 'Duplicated grid edge', key)
            seen[key].append((start, end))
        fitz.TOOLS.set_aa_level(0)
        for scale in [.75, 1, 600 / page.rect.width, 1.25]:
            image = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            failures = []
            for a, b, vertical in edges:
                hits = 0
                for n in range(1, 9):
                    x = round((a.x + (b.x - a.x) * n / 9) * scale)
                    y = round((a.y + (b.y - a.y) * n / 9) * scale)
                    pixels = [(cx, y) for cx in range(x - 2, x + 3)] if vertical else [(x, cy) for cy in range(y - 2, y + 3)]
                    hits += any(0 <= cx < image.width and 0 <= cy < image.height and max(image.pixel(cx, cy)) < 100 for cx, cy in pixels)
                if hits < 7:
                    failures.append({'a': list(a), 'b': list(b), 'hits': hits})
            assert not failures, (filename, page.number, scale, failures[:5])
        checked += len(edges)
    assert checked > 100, (filename, 'No printable table strokes')
    reports.append({'file': filename, 'pages': len(document), 'bordersChecked': checked})
print(json.dumps(reports))
