// ═══════════════════════════════════════════════════════════════════════════
// Η ΓΕΦΥΡΑ ΠΡΟΣ ΤΟ ΕΥΡΩΠΑΪΚΟ ΜΗΤΡΩΟ ΕΝΕΡΓΕΙΑΚΩΝ ΕΤΙΚΕΤΩΝ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΔΕΝ ΚΑΛΕΙ Ο ΠΕΡΙΗΓΗΤΗΣ ΑΠΕΥΘΕΙΑΣ ΤΟ EPREL. Τρεις λόγοι, και ο καθένας
// αρκεί: η πολιτική ασφαλείας της σελίδας δεν επιτρέπει κλήσεις σε ξένο τομέα
// (και δεν την ανοίγουμε για μία λειτουργία), το μητρώο δεν στέλνει κεφαλίδες
// CORS, και έτσι η διεύθυνση του χρήστη δεν φτάνει ποτέ στην Επιτροπή.
//
// ΤΙ ΓΥΡΙΖΕΙ. Μόνο τα πεδία που κρατά η απογραφή, περασμένα από τον αναγνώστη
// που είναι δοκιμασμένος σε πραγματική απάντηση. Η ωμή απάντηση του μητρώου δεν
// φτάνει στον πελάτη: ό,τι δεν έχει θέση σε πεδίο δεν έχει λόγο να ταξιδεύει.
//
// ΓΙΑΤΙ ΘΕΛΕΙ ΣΥΝΔΕΣΗ. Είναι εξερχόμενη κλήση από τη διεύθυνσή μας. Χωρίς
// σύνδεση, ο καθένας θα μπορούσε να τη χρησιμοποιεί ως ανώνυμο διαμεσολαβητή.
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseEprelRef, readEprel, eprelApiUrl, eprelPageUrl } from '@/lib/property/eprel';

/** Το μητρώο απαντά σε κλάσματα του δευτερολέπτου· πάνω από αυτό κάτι τρέχει. */
const TIMEOUT_MS = 8000;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  const ref = parseEprelRef(req.nextUrl.searchParams.get('ref') ?? '');
  if (!ref) {
    return NextResponse.json({
      error: 'Χρειάζεται ο σύνδεσμος του QR της ενεργειακής ετικέτας ή η ομάδα προϊόντος με τον αριθμό μητρώου.',
    }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(eprelApiUrl(ref), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Το μητρώο δεν απάντησε. Δοκίμασε ξανά σε λίγο.' }, { status: 502 });
  }

  if (res.status === 404) {
    return NextResponse.json({ error: 'Η καταχώρηση δεν βρέθηκε στο μητρώο.' }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'Το μητρώο απάντησε με σφάλμα.' }, { status: 502 });
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return NextResponse.json({ error: 'Η απάντηση του μητρώου δεν διαβάζεται.' }, { status: 502 });
  }

  const reading = readEprel(json);
  if (!reading.ok) return NextResponse.json({ error: reading.reason }, { status: 422 });

  // Ο σύνδεσμος γυρίζει μαζί: ο χρήστης πρέπει να μπορεί να δει ο ίδιος την
  // πηγή των νούμερων που μόλις μπήκαν στην καρτέλα του.
  return NextResponse.json({ fill: reading.fill, source: eprelPageUrl(reading.ref) });
}
