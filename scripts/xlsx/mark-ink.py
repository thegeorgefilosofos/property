# -*- coding: utf-8 -*-
"""Το σήμα άφησε ΔΙΚΟ ΤΟΥ μελάνι στο χαρτί.

ΓΙΑΤΙ ΣΥΓΚΡΙΣΗ ΚΑΙ ΟΧΙ ΜΕΤΡΗΣΗ. Η πρώτη γραφή μετρούσε πόσα σκούρα
εικονοστοιχεία έχει η πάνω αριστερή γωνία της τυπωμένης σελίδας. Δοκιμασμένη με
το σήμα ΣΒΗΣΤΟ, πέρασε: στη γωνία κάθεται και ο τίτλος, που είναι κι αυτός
μαύρος. Ο έλεγχος μετρούσε ότι ο τίτλος υπάρχει.

Τώρα το ίδιο βιβλίο τυπώνεται δύο φορές: όπως είναι και με το σχέδιο βγαλμένο
από το zip. Ο,τι μελάνι περισσεύει στην πρώτη σελίδα είναι του σήματος και
τίποτε άλλο. Ενα σήμα λευκό, εκτός σελίδας, ή κρυμμένο πίσω από τα γράμματα δεν
αφήνει περίσσευμα και ο έλεγχος κόβει.
"""
import sys, os, glob, re, shutil, subprocess, zipfile

# Οσο μελάνι αφήνει σίγουρα ένα σήμα 40 σημείων στα 150 dpi, ακόμη και
# σμικρυμένο σε ένα πλάτος σελίδας. Μετρημένο: το πιο σμικρυμένο βιβλίο
# (δεκαεννέα στήλες) άφησε 452 εικονοστοιχεία, το πιο ευρύχωρο 4.475.
FLOOR = 200


def strip_mark(src, dst):
    """Αντίγραφο του βιβλίου χωρίς το σχέδιο, χωρίς τίποτε άλλο αλλαγμένο."""
    z = zipfile.ZipFile(src)
    parts = {n: z.read(n) for n in z.namelist()}
    drawings = [n for n in parts if n.startswith('xl/drawings/') or n.startswith('xl/media/')]
    for n in drawings:
        del parts[n]
    for n in list(parts):
        if re.match(r'xl/worksheets/sheet\d+\.xml$', n):
            parts[n] = re.sub(rb'<drawing [^>]*/>', b'', parts[n])
        if re.match(r'xl/worksheets/_rels/sheet\d+\.xml\.rels$', n):
            parts[n] = re.sub(rb'<Relationship [^>]*drawings/[^>]*/>', b'', parts[n])
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as out:
        for n, b in parts.items():
            out.writestr(n, b)


def page_ink(pdf, work):
    from PIL import Image
    stem = os.path.join(work, 'page')
    subprocess.run(['pdftoppm', '-png', '-r', '150', '-f', '1', '-l', '1', pdf, stem],
                   check=True, capture_output=True)
    pngs = sorted(glob.glob(stem + '-*.png'))
    if not pngs:
        return None
    im = Image.open(pngs[0]).convert('L')
    w, h = im.size
    box = im.crop((0, 0, int(w * 0.30), int(h * 0.20)))
    ink = sum(1 for p in box.getdata() if p < 160)
    for p in pngs:
        os.remove(p)
    return ink


def main(xlsx_dir):
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        print('  · Pillow δεν είναι εγκατεστημένη, το μελάνι δεν μετριέται')
        return 0

    work = os.path.join(xlsx_dir, 'ink')
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    books = sorted(glob.glob(os.path.join(xlsx_dir, '*.xlsx')))
    for b in books:
        strip_mark(b, os.path.join(work, os.path.basename(b)))

    r = subprocess.run(['soffice', '--headless', '--norestore', '--convert-to', 'pdf',
                        '--outdir', work] + [os.path.join(work, os.path.basename(b)) for b in books],
                       capture_output=True, timeout=600)
    fails = 0
    for b in books:
        name = os.path.basename(b)
        with_pdf = os.path.join(xlsx_dir, 'pdf', name[:-5] + '.pdf')
        without_pdf = os.path.join(work, name[:-5] + '.pdf')
        if not os.path.exists(with_pdf) or not os.path.exists(without_pdf):
            print('  ✗ %s: δεν τυπώθηκε και με τους δύο τρόπους' % name)
            fails += 1
            continue
        a, b_ink = page_ink(with_pdf, work), page_ink(without_pdf, work)
        extra = (a or 0) - (b_ink or 0)
        if extra < FLOOR:
            print('  ✗ %s: το σήμα δεν προσθέτει μελάνι (%d εικονοστοιχεία, όριο %d)' % (name, extra, FLOOR))
            fails += 1
        else:
            print('  ✓ %s: το σήμα προσθέτει %d εικονοστοιχεία μελάνης πάνω αριστερά' % (name, extra))
    shutil.rmtree(work, ignore_errors=True)
    return 1 if fails else 0


sys.exit(main(sys.argv[1]))
