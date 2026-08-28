// ═══════════════════════════════════════════════════════════════════════════
// Η ΕΠΙΣΤΡΟΦΗ ΑΠΟ ΤΟ EMAIL ΕΠΙΒΕΒΑΙΩΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΣΠΑΓΕ ΧΩΡΙΣ ΑΥΤΗ ΤΗ ΔΙΑΔΡΟΜΗ. Ο σύνδεσμος του email γυρίζει με ένα
// διακριτικό στη διεύθυνση και ΧΩΡΙΣ cookie συνεδρίας — η συνεδρία δεν έχει
// γεννηθεί ακόμη, αυτός είναι όλος ο λόγος που ο σύνδεσμος υπάρχει. Ο
// διαμεσολαβητής όμως κρίνει κάθε μη δημόσια σελίδα από το cookie: έβλεπε
// «ασύνδετος» και έστελνε τον νέο χρήστη στη ΣΥΝΔΕΣΗ, κρατώντας το διακριτικό
// στη διεύθυνση. Ο λογαριασμός ενεργοποιούνταν τελικά, αλλά ο άνθρωπος
// κατέληγε να κοιτά φόρμα εισόδου αντί για την εφαρμογή του.
//
// Εδώ η ανταλλαγή γίνεται στον ΔΙΑΚΟΜΙΣΤΗ: το cookie γράφεται πριν από την
// ανακατεύθυνση, οπότε ο επόμενος σταθμός βρίσκει κανονική συνεδρία.
//
// ── ΔΥΟ ΜΟΡΦΕΣ ΣΥΝΔΕΣΜΟΥ, ΓΙΑΤΙ ΤΙΣ ΓΡΑΦΕΙ ΤΟ ΠΡΟΤΥΠΟ ΤΟΥ EMAIL ─────────
// «?code=» όταν η εγγραφή ξεκίνησε με PKCE (η προεπιλογή μας), «?token_hash=»
// όταν το πρότυπο του email γράφει το διακριτικό μόνο του. Η επιλογή δεν
// γίνεται εδώ και δεν ελέγχεται από εδώ, οπότε υποστηρίζονται και οι δύο.
//
// ── ΚΑΙ Ο ΠΡΟΟΡΙΣΜΟΣ ΕΙΝΑΙ ΠΑΝΤΑ ΔΙΚΟΣ ΜΑΣ ──────────────────────────────
// Το «next» έρχεται από τη διεύθυνση, δηλαδή το γράφει ο καθένας. Οτιδήποτε
// δεν είναι σχετική διαδρομή αγνοείται: αλλιώς ένας σύνδεσμος επιβεβαίωσης θα
// προσγείωνε τον χρήστη σε ξένο τόπο, με τη δική μας υπογραφή από πάνω.
// ═══════════════════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/redirect';
import { track, PRODUCT_EVENTS } from '@/lib/analytics/events';

/** Οι μορφές διακριτικού που στέλνει το ταχυδρομείο του παρόχου. */
const OTP_TYPES = ['signup', 'email', 'invite', 'magiclink', 'recovery', 'email_change'] as const;

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get('next'));
  const code = (url.searchParams.get('code') || '').trim();
  const tokenHash = (url.searchParams.get('token_hash') || '').trim();
  const type = (url.searchParams.get('type') || '').trim();

  const supabase = await createClient();

  let problem = '';
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    problem = error?.message || '';
  } else if (tokenHash && (OTP_TYPES as readonly string[]).includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    problem = error?.message || '';
  } else {
    problem = 'ο σύνδεσμος δεν κουβαλά διακριτικό';
  }

  // ── Ο ΠΑΡΟΝΟΜΑΣΤΗΣ ΤΟΥ ΧΩΝΙΟΥ ─────────────────────────────────────────────
  // Η στιγμή της εγγραφής δεν έχει συνεδρία, γιατί το email θέλει επιβεβαίωση.
  // Εδώ, μόλις ανταλλαγεί το διακριτικό, υπάρχει ταυτότητα για πρώτη φορά.
  //
  // Το ίδιο σημείο περνά και κάθε επόμενη σύνδεση, οπότε το «μία φορά» ΔΕΝ το
  // θυμάται ο κώδικας: το εγγυάται μοναδικό ευρετήριο στη βάση και η δεύτερη
  // προσπάθεια απλώς δεν γράφει. Χωρίς αυτό, ο παρονομαστής θα μετρούσε
  // συνδέσεις αντί για ανθρώπους και κάθε ποσοστό ενεργοποίησης θα έδειχνε
  // μικρότερο απ' ό,τι είναι.
  if (!problem) {
    await track(supabase, PRODUCT_EVENTS.signed_up);
  }

  if (problem) {
    // ΤΟ «ΓΙΑΤΙ» ΜΕΝΕΙ ΜΕΣΑ, Η ΑΠΑΝΤΗΣΗ ΛΕΕΙ ΜΟΝΟ ΟΤΙ ΔΕΝ ΕΓΙΝΕ. Ενας
    // σύνδεσμος που έληξε και ένας σύνδεσμος που δεν υπήρξε ποτέ δεν
    // επιτρέπεται να ξεχωρίζουν από έξω.
    console.info('[auth] η επιβεβαίωση δεν ολοκληρώθηκε:', problem);
    return NextResponse.redirect(new URL('/login?confirm=failed', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
