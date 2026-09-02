'use client';

// ═══════════════════════════════════════════════════════════════════════════
// /unsubscribe/<token> — δημόσια, ένα-κλικ απεγγραφή από τα ενημερωτικά emails
// (GDPR). Δείχνει τι λαμβάνει ο χρήστης και του επιτρέπει να απεγγραφεί από τα
// προϊοντικά νέα, τα δεδομένα αγοράς, ή όλα. Χωρίς login.
// ═══════════════════════════════════════════════════════════════════════════
import BrandMark from '@/components/BrandMark';
import { T } from '@/components/tokens';
import { Btn } from '@/components/Theme';
import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLoad } from '@/app/hooks/useLoad';

export default function Unsubscribe() {
  const token = String(useParams()?.token || '');
  const supabase = createClient();
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [product, setProduct] = useState(true);
  const [market, setMarket] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  // Η αποτυχία λέγεται με λόγια, στην ίδια θέση που θα λεγόταν η επιτυχία.
  const [failed, setFailed] = useState('');

  // ═══ Η ΦΟΡΤΩΣΗ ΕΛΕΓΕ «ΑΚΥΡΟΣ ΣΥΝΔΕΣΜΟΣ» ΓΙΑ ΠΕΣΜΕΝΟ ΔΙΚΤΥΟ ══════════════════
  // `if (error || !row) { setState('notfound') }`: μία κατάσταση για δύο εντελώς
  // διαφορετικά πράγματα. Ο παραλήπτης που πατά «Απεγγραφή» μέσα από email, από
  // κινητό με κακό σήμα, διάβαζε «Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει»
  // για σύνδεσμο ΜΙΑ ΧΑΡΑ ΕΓΚΥΡΟ — και έφευγε πιστεύοντας ότι δεν υπάρχει
  // τρόπος να σταματήσει τα email. Η απεγγραφή είναι δικαίωμά του· η σελίδα του
  // έλεγε ότι το δικαίωμα δεν ισχύει, επειδή δεν πήρε απάντηση.
  //
  // Το `unsubscribe()` είκοσι γραμμές πιο κάτω, στο ΙΔΙΟ αρχείο, τα ξεχώριζε
  // ήδη σωστά: σφάλμα → «δοκίμασε ξανά», `!data` → «ο σύνδεσμος έληξε». Ο ίδιος
  // κανόνας ισχύει τώρα και στη φόρτωση.
  // ΤΟ «ΦΟΡΤΩΝΕΙ» ΔΕΝ ΓΡΑΦΕΤΑΙ ΜΕΣΑ ΣΤΗ ΦΟΡΤΩΣΗ. Η αρχική κατάσταση είναι ήδη
  // «loading», οπότε η σύγχρονη γραφή στην πρώτη γραμμή δεν πρόσθετε τίποτα
  // στην προσάρτηση — πρόσθετε μόνο μια γραφή κατάστασης πριν από το πρώτο
  // await, που είναι ακριβώς ό,τι απαγορεύει ο κανόνας (guard-use-load,
  // set-state-in-effect). Στη ΔΕΥΤΕΡΗ προσπάθεια τη χρειάζεται και εκεί
  // ανήκει: στον χειριστή του κουμπιού, όπου είναι απάντηση σε πάτημα.
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('marketing_prefs_by_token', { p_token: token });
    const row = Array.isArray(data) ? data[0] : data;
    if (error) { setState('error'); return; }
    if (!row) { setState('notfound'); return; }
    setProduct(row.product_news); setMarket(row.market_news); setState('ok');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  // Το ιδίωμα του έργου για φόρτωση στην προσάρτηση: μία φορά, με τον σωστό χρόνο.
  useLoad(load);
  /** Δεύτερη προσπάθεια από κουμπί: εκεί το «φορτώνει» είναι απάντηση σε πάτημα. */
  const retry = () => { setState('loading'); void load(); };

  // ═══ Η ΑΠΕΓΓΡΑΦΗ ΠΟΥ ΑΠΕΤΥΧΕ ΣΙΩΠΗΛΑ ══════════════════════════════════════
  // ΤΙ ΕΒΛΕΠΕ Ο ΠΑΡΑΛΗΠΤΗΣ. Πατούσε «Απεγγραφή από όλα», το κουμπί σταματούσε
  // να γυρίζει και ΤΙΠΟΤΑ δεν άλλαζε: ούτε μήνυμα, ούτε εξαφάνιση του κουμπιού.
  // Το `error` της κλήσης πεταγόταν και το `if (data)` σιωπούσε. Ο άνθρωπος
  // συμπεραίνει ένα από τα δύο: ή ότι έγινε (και εξοργίζεται με το επόμενο
  // email), ή ότι η σελίδα χάλασε (και το ξαναπατά χωρίς αποτέλεσμα).
  //
  // ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΜΟΝΟ ΕΥΓΕΝΕΙΑ. Η απεγγραφή είναι δικαίωμα του παραλήπτη· μια
  // αποτυχία που δεν λέγεται σημαίνει ότι συνεχίζουμε να στέλνουμε σε κάποιον
  // που ζήτησε να σταματήσουμε, πιστεύοντας και οι δύο ότι σταματήσαμε.
  //
  // ΤΟ `data === false` ΕΙΝΑΙ ΤΟ ΤΡΙΤΟ ΕΝΔΕΧΟΜΕΝΟ. Η συνάρτηση της βάσης
  // επιστρέφει ψευδές όταν το κουπόνι δεν ταιριάζει, χωρίς σφάλμα: εκεί δεν
  // φταίει το δίκτυο, έληξε ο σύνδεσμος.
  const unsubscribe = async (kind: 'product' | 'market' | 'all') => {
    setBusy(true); setFailed('');
    const { data, error } = await supabase.rpc('unsubscribe_email', { p_token: token, p_kind: kind });
    setBusy(false);
    if (error) {
      setFailed('Η απεγγραφή δεν ολοκληρώθηκε. Δοκίμασε ξανά σε λίγο, ή στείλε μας μήνυμα και θα τη διαγράψουμε εμείς.');
      return;
    }
    if (!data) {
      setFailed('Ο σύνδεσμος δεν είναι πλέον έγκυρος. Χρησιμοποίησε τον σύνδεσμο του τελευταίου email, ή τις Ρυθμίσεις μέσα στην εφαρμογή.');
      return;
    }
    if (kind === 'product' || kind === 'all') setProduct(false);
    if (kind === 'market' || kind === 'all') setMarket(false);
    setDone(kind === 'all' ? 'Απεγγράφηκες από όλα τα ενημερωτικά emails.'
      : kind === 'product' ? 'Απεγγράφηκες από τα προϊοντικά νέα.' : 'Απεγγράφηκες από τα δεδομένα αγοράς.');
  };

  const wrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, system-ui, Arial, sans-serif', color: 'var(--text-primary)' };
  const card: React.CSSProperties = { width: '100%', maxWidth: 440, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '30px 28px', boxShadow: 'var(--elev-1)' };
  const btn = (danger?: boolean): React.CSSProperties => ({ width: '100%', height: 42, borderRadius: 10, border: '1px solid ' + (danger ? 'var(--border-default)' : 'var(--accent)'), background: danger ? 'var(--bg-surface)' : 'var(--accent)', color: danger ? 'var(--text-primary)' : 'var(--accent-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 });

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          <BrandMark size={34} />
          {/* Ο τίτλος της σελίδας είναι η δεύτερη γραμμή· το «PROPERWISE» είναι
              σήμα. Χωρίς `h1` η σελίδα ανακοινωνόταν ανώνυμη. */}
          <div><div style={{ fontSize: 15, fontWeight: 700 }}>PROPERWISE</div><h1 style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, margin: 0 }}>Προτιμήσεις ενημερωτικών emails</h1></div>
        </div>

        {state === 'loading' && <div style={{ padding: '34px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Φόρτωση…</div>}
        {state === 'notfound' && <p style={{ paddingTop: 22, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει. Μπορείς να διαχειριστείς τις προτιμήσεις σου από τις Ρυθμίσεις μέσα στην εφαρμογή.</p>}
        {/* Ο σύνδεσμος δεν κρίθηκε: δεν πήραμε απάντηση. Το λέμε με αυτά τα
            λόγια και δίνουμε το κουμπί, γιατί η μόνη σωστή ενέργεια είναι να
            ξαναρωτήσεις — όχι να φύγεις νομίζοντας ότι έχασες το δικαίωμά σου. */}
        {state === 'error' && (
          <div style={{ paddingTop: 22 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Δεν καταφέραμε να διαβάσουμε τις προτιμήσεις σου. Ο σύνδεσμος δεν ελέγχθηκε, οπότε μπορεί κάλλιστα να είναι έγκυρος.
            </p>
            <div style={{ marginTop: 16 }}><Btn onClick={retry}>Δοκιμή ξανά</Btn></div>
          </div>
        )}

        {state === 'ok' && (
          <div style={{ paddingTop: 20 }}>
            {failed
              ? <div role="alert" style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 16 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--negative)', lineHeight: 1.6 }}>{failed}</span></div>
              : done
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: 10, padding: '11px 14px', marginBottom: 16 }}><span style={{ color: 'var(--positive)', fontWeight: 700 }}>✓</span><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--positive)' }}>{done}</span></div>
              : <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>Διάλεξε από τι θέλεις να απεγγραφείς. Τα λειτουργικά emails (υπενθυμίσεις, καταστάσεις) δεν επηρεάζονται.</p>}
            <div style={{ display: 'grid', gap: 10 }}>
              {product && <button style={btn(true)} disabled={busy} onClick={() => unsubscribe('product')}>Απεγγραφή από προϊοντικά νέα</button>}
              {market && <button style={btn(true)} disabled={busy} onClick={() => unsubscribe('market')}>Απεγγραφή από δεδομένα αγοράς</button>}
              {(product || market) && <button style={btn(false)} disabled={busy} onClick={() => unsubscribe('all')}>Απεγγραφή από όλα</button>}
              {!product && !market && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Έχεις απεγγραφεί από όλα τα ενημερωτικά emails.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
