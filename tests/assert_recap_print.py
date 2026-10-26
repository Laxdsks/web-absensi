"""Printed recap keeps readable type, every student, entered scores and all columns."""
import re
import sys
import fitz

for index, filename in enumerate(sys.argv[1:]):
    doc = fitz.open(filename)
    text = '\n'.join(page.get_text() for page in doc)
    expected = 35 if index == 0 else 70
    names = re.findall(r'MAHASISWA UJI CETAK (\d+)', text)
    assert len(names) == expected and set(map(int, names)) == set(range(1, expected + 1)), (filename, len(names))
    assert 'KONVERSI SKOR NILAI' in text
    for page in doc:
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    assert span['size'] >= 6.9, (filename, 'Microscopic recap text', span)
                    x0, y0, x1, y1 = span['bbox']
                    assert x0 >= 25 and y0 >= 25 and x1 <= page.rect.width - 25 and y1 <= page.rect.height - 25, (filename, 'Text outside paper margins', span)
    if index == 0:
        assert len(doc) == 1
        words = text.split()
        assert '75' in words and '88' in words, 'Entered exam scores must be printed'
