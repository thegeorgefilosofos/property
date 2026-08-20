'use client';

// ═══════════════════════════════════════════════════════════════════════════
// /epivevaiosi-email/<token> — δημόσια επιβεβαίωση της διεύθυνσης υπενθυμίσεων.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: η διεύθυνση στην οποία στέλνονται οι υπενθυμίσεις είναι
// ελεύθερο κείμενο που γράφει ο ιδιοκτήτης. Μπορεί να είναι οποιουδήποτε. Χωρίς
// αυτό το βήμα, το προϊόν στέλνει μηνύματα από το δικό του domain, με το δικό
// του λογότυπο, σε ανθρώπους που δεν το ζήτησαν ποτέ — δηλαδή είναι
// αναμεταδότης, όσο ευγενικό κι αν είναι το περιεχόμενο.
//
// ΧΩΡΙΣ LOGIN, ΕΠΙΤΗΔΕΣ: αυτός που επιβεβαιώνει είναι ο ΠΑΡΑΛΗΠΤΗΣ, και ο
// παραλήπτης συνήθως δεν έχει λογαριασμό. Το διακριτικό είναι uuid, λήγει σε 48
// ώρες, και καίγεται με την πρώτη επιτυχία: ο ίδιος σύνδεσμος δεν ξαναδουλεύει
// αν διαρρεύσει από τα εισερχόμενα.
// ═══════════════════════════════════════════════════════════════════════════
import BrandMark from '@/components/BrandMark';
import { T } from '@/components/tokens';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ConfirmReminderEmail() {
  const token = String(useParams()?.token || '');
  const supabase = createClient();
  const [state, setState] = useState<'loading' | 'ok' | 'invalid'>('loading');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('confirm_reminder_email', { p_token: token });
      setState(!error && data === true ? 'ok' : 'invalid');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const wrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, system-ui, Arial, sans-serif', color: 'var(--text-primary)' };
  const card: React.CSSProperties = { width: '100%', maxWidth: 440, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '30px 28px', boxShadow: 'var(--elev-1)' };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          <BrandMark size={34} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Property OS</div>
            {/* Ο ΤΙΤΛΟΣ ΤΗΣ ΣΕΛΙΔΑΣ ΕΙΝΑΙ ΑΥΤΗ Η ΓΡΑΜΜΗ, ΟΧΙ ΤΟ ΟΝΟΜΑ ΤΗΣ
                ΕΦΑΡΜΟΓΗΣ. Το «Property OS» από πάνω είναι σήμα, όχι επικεφαλίδα.
                Η σελίδα δεν είχε καμία: ο αναγνώστης οθόνης την ανακοίνωνε
                χωρίς όνομα, σε δημόσιο σύνδεσμο που ανοίγει άνθρωπος ο οποίος
                μπορεί να μη μας έχει ξανασυναντήσει. Ιδια γνωρίσματα, συν
                `margin:0` που ακυρώνει το προεπιλεγμένο περιθώριο του `h1`. */}
            <h1 style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, margin: 0 }}>Επιβεβαίωση διεύθυνσης υπενθυμίσεων</h1>
          </div>
        </div>

        {state === 'loading' && (
          <div style={{ padding: '34px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Γίνεται επιβεβαίωση…</div>
        )}

        {state === 'ok' && (
          <div style={{ paddingTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: 10, padding: '11px 14px', marginBottom: 18 }}>
              <span style={{ color: 'var(--positive)', fontWeight: 700 }}>✓</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--positive)' }}>Η διεύθυνση επιβεβαιώθηκε.</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Από εδώ και πέρα οι υπενθυμίσεις για λογαριασμούς, ενοίκια και γεγονότα του ημερολογίου θα φτάνουν σε αυτή τη διεύθυνση. Μπορείς να την αλλάξεις ή να τη σβήσεις οποτεδήποτε, από τις Ρυθμίσεις της εφαρμογής.
            </p>
          </div>
        )}

        {state === 'invalid' && (
          <p style={{ paddingTop: 22, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Ο σύνδεσμος δεν είναι έγκυρος, έχει λήξει ή χρησιμοποιήθηκε ήδη. Ζήτησε νέα επιβεβαίωση από τις Ρυθμίσεις της εφαρμογής, στις Ειδοποιήσεις.
          </p>
        )}
      </div>
    </div>
  );
}
