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
// ΧΩΡΙΣ LOGIN, ΕΠΙΤΗΔΕΣ: αυτός που επιβεβαιώνει είναι ο ΠΑΡΑΛΗΠΤΗΣ και ο
// παραλήπτης συνήθως δεν έχει λογαριασμό. Το διακριτικό είναι uuid, λήγει σε 48
// ώρες και καίγεται με την πρώτη επιτυχία: ο ίδιος σύνδεσμος δεν ξαναδουλεύει
// αν διαρρεύσει από τα εισερχόμενα.
// ═══════════════════════════════════════════════════════════════════════════
import BrandMark from '@/components/BrandMark';
import { T } from '@/components/tokens';
import { Btn } from '@/components/Theme';
import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLoad } from '@/app/hooks/useLoad';

export default function ConfirmReminderEmail() {
  const token = String(useParams()?.token || '');
  const supabase = createClient();
  // ═══ Η ΠΤΩΣΗ ΔΙΚΤΥΟΥ ΕΛΕΓΕ «Ο ΣΥΝΔΕΣΜΟΣ ΔΕΝ ΕΙΝΑΙ ΕΓΚΥΡΟΣ» ═══════════════
  // `setState(!error && data === true ? 'ok' : 'invalid')`: το σφάλμα της
  // κλήσης και η απόρριψη του κουπονιού κατέληγαν στην ίδια οθόνη. Ο χρήστης
  // που πάτησε τον σύνδεσμο από το email του, με στιγμιαία πτώση, διάβαζε ότι
  // ο σύνδεσμος «έληξε ή χρησιμοποιήθηκε ήδη» — και δεν ξαναπατούσε, γιατί του
  // είπαμε ότι δεν έχει νόημα. Η διεύθυνσή του έμενε ανεπιβεβαίωτη και οι
  // υπενθυμίσεις δεν έφταναν ποτέ.
  //
  // Οι αδελφές σελίδες /checkin και /portal έχουν ήδη ξεχωριστή κατάσταση
  // «offline»· εδώ έλειπε.
  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'offline'>('loading');

  // ΤΟ «ΦΟΡΤΩΝΕΙ» ΔΕΝ ΓΡΑΦΕΤΑΙ ΜΕΣΑ ΣΤΗ ΦΟΡΤΩΣΗ. Η αρχική κατάσταση είναι ήδη
  // «loading», οπότε η σύγχρονη γραφή στην πρώτη γραμμή δεν πρόσθετε τίποτα
  // στην προσάρτηση — πρόσθετε μόνο μια γραφή κατάστασης πριν από το πρώτο
  // await, που είναι ακριβώς ό,τι απαγορεύει ο κανόνας (guard-use-load,
  // set-state-in-effect). Στη ΔΕΥΤΕΡΗ προσπάθεια τη χρειάζεται και εκεί
  // ανήκει: στον χειριστή του κουμπιού, όπου είναι απάντηση σε πάτημα.
  const confirm = useCallback(async () => {
    const { data, error } = await supabase.rpc('confirm_reminder_email', { p_token: token });
    setState(error ? 'offline' : data === true ? 'ok' : 'invalid');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  // Το ιδίωμα του έργου για φόρτωση στην προσάρτηση: μία φορά, με τον σωστό χρόνο.
  useLoad(confirm);
  /** Δεύτερη προσπάθεια από κουμπί: εκεί το «φορτώνει» είναι απάντηση σε πάτημα. */
  const retry = () => { setState('loading'); void confirm(); };

  const wrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, system-ui, Arial, sans-serif', color: 'var(--text-primary)' };
  const card: React.CSSProperties = { width: '100%', maxWidth: 440, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '30px 28px', boxShadow: 'var(--elev-1)' };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          <BrandMark size={34} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>PROPERWISE</div>
            {/* Ο ΤΙΤΛΟΣ ΤΗΣ ΣΕΛΙΔΑΣ ΕΙΝΑΙ ΑΥΤΗ Η ΓΡΑΜΜΗ, ΟΧΙ ΤΟ ΟΝΟΜΑ ΤΗΣ
                ΕΦΑΡΜΟΓΗΣ. Το «PROPERWISE» από πάνω είναι σήμα, όχι επικεφαλίδα.
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

        {/* Ο σύνδεσμος δεν κρίθηκε. Το λέμε έτσι ακριβώς, με κουμπί: η μόνη
            σωστή ενέργεια είναι να ξαναρωτήσεις. */}
        {state === 'offline' && (
          <div style={{ paddingTop: 22 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Δεν λάβαμε απάντηση, οπότε ο σύνδεσμος δεν ελέγχθηκε. Μπορεί να είναι μια χαρά έγκυρος.
            </p>
            <div style={{ marginTop: 16 }}><Btn onClick={retry}>Δοκιμή ξανά</Btn></div>
          </div>
        )}
      </div>
    </div>
  );
}
