// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΑΤΑΣΤΑΣΗ ΤΗΣ ΣΥΝΔΕΣΗΣ ΜΕ ΤΗΝ ΤΡΑΠΕΖΑ
// ─────────────────────────────────────────────────────────────────────────
// ΜΙΑ ΑΠΑΝΤΗΣΗ ΓΙΑ ΤΡΙΑ ΕΡΩΤΗΜΑΤΑ, ώστε η οθόνη να μη ρωτά τρεις φορές και να
// μην κρίνει μόνη της: προσφέρεται η λειτουργία, ποιες συνδέσεις υπάρχουν, και
// πόσες από αυτές χρεώνονται αυτόν τον μήνα.
//
// ΤΟ «ΓΙΑΤΙ ΟΧΙ» ΤΑΞΙΔΕΥΕΙ ΜΟΝΟ ΠΡΟΣ ΤΑ ΜΕΣΑ. Οταν λείπει ρύθμιση, ο λόγος
// γράφεται στα αρχεία καταγραφής του διακομιστή, ονομαστικά. Στον χρήστη πάει
// σκέτο `available: false`: το ποια μεταβλητή περιβάλλοντος λείπει δεν είναι
// δική του πληροφορία, και ονόματα μεταβλητών δεν εκτίθενται σε κανέναν.
// ═══════════════════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { available } from '@/lib/billing/addons';
import { aisConfigError } from '@/lib/banking/provider';
import * as connections from '@/lib/data/bankConnections';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  // ΔΥΟ ΑΝΕΞΑΡΤΗΤΟΙ ΟΡΟΙ, ΚΑΙ ΟΙ ΔΥΟ ΑΠΑΡΑΙΤΗΤΟΙ. Τιμή για το πρόσθετο, και
  // πάροχος που δουλεύει. Χωρίς τιμή θα χρεώναμε άγνωστο ποσό· χωρίς πάροχο θα
  // υποσχόμασταν σύνδεση που δεν γίνεται.
  const reason = aisConfigError(process.env);
  const offered = available('bank_link') && reason === '';
  if (reason) console.info('[banking] η σύνδεση τράπεζας δεν προσφέρεται:', reason);

  const { connections: cs, error } = await connections.ofUser(supabase, user.id);
  if (error) {
    return NextResponse.json({ error: 'Οι τραπεζικές συνδέσεις δεν διαβάστηκαν.' }, { status: 502 });
  }

  return NextResponse.json({
    available: offered,
    connections: cs,
    // Οσες θέλουν ενέργεια, με τη σειρά που πρέπει να τη λάβουν.
    attention: connections.needingAttention(cs).map(c => c.id),
    billable: connections.billableCount(cs),
  });
}
