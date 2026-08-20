'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΤΑΜΕΙΟ: Η ΠΡΩΤΗ ΟΘΟΝΗ ΜΕΤΑ ΤΗΝ ΕΠΙΒΕΒΑΙΩΣΗ ΤΟΥ EMAIL
// ─────────────────────────────────────────────────────────────────────────
// Ο επισκέπτης διάλεξε πακέτο και κύκλο στον τιμοκατάλογο. Μέχρι τώρα η
// επιλογή του κατέληγε στον πίνακα: μια οθόνη με είκοσι καρτέλες, όπου η
// συνδρομή που μόλις ζήτησε ήταν ένα κουμπί κρυμμένο τρία κλικ μακριά, στις
// Ρυθμίσεις. Το ταμείο ανοίγει εδώ, αμέσως, με το πακέτο και τον κύκλο που
// ταξίδεψαν μαζί του από την πρώτη κάρτα που πάτησε.
//
// ── ΤΡΕΙΣ ΚΑΤΑΛΗΞΕΙΣ, ΚΑΙ ΚΑΜΙΑ ΔΕΝ ΕΙΝΑΙ ΑΔΙΕΞΟΔΟ ─────────────────────
// Ο σύνδεσμος του εμπόρου: η κανονική διαδρομή, και φεύγουμε αμέσως.
// Ο πίνακας: όταν δεν υπάρχει τίποτα να αγοραστεί — δοκιμαστής, ή πακέτο που
//   δεν αναγνωρίζεται. Δεν λέγεται τίποτα, γιατί δεν συνέβη τίποτα.
// Αυτή η κάρτα: όταν η χρέωση δεν είναι ρυθμισμένη ή το ταμείο δεν άνοιξε. Η
//   δοκιμή τρέχει έτσι κι αλλιώς, και αυτό λέγεται με λέξεις — μια σιωπηλή
//   ανακατεύθυνση θα άφηνε τον χρήστη να νομίζει ότι πλήρωσε.
//
// ΓΙΑΤΙ ΔΕΝ ΖΕΙ ΣΤΟΝ ΔΙΑΚΟΜΙΣΤΗ. Η συνεδρία γεννιέται στην ανταλλαγή του
// διακριτικού (app/auth/callback), και το ταμείο είναι σύνδεσμος μιας χρήσης
// με ημερομηνία λήξης: δεν επιτρέπεται να μπει σε καμία μνήμη ενδιάμεσου.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import { T } from '@/components/tokens';
import { createClient } from '@/lib/supabase/client';
import { PLANS } from '@/lib/billing/plans';
import { planFromParam, cycleFromParam } from '@/lib/billing/entitlements';
import { fe } from '@/lib/core/format';

type Stage = 'opening' | 'closed' | 'anonymous';

export default function CheckoutLanding() {
  const [stage, setStage] = useState<Stage>('opening');
  const [note, setNote] = useState('');
  const [what, setWhat] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const plan = planFromParam(q.get('plan'));
      const cycle = cycleFromParam(q.get('cycle'));
      if (!plan) { window.location.replace('/dashboard'); return; }
      if (alive) {
        setWhat(`${PLANS[plan].name}, ${cycle === 'annual'
          ? `με ετήσια χρέωση ${fe(PLANS[plan].priceAnnual)}`
          : `με μηνιαία χρέωση ${fe(PLANS[plan].priceMonthly)}`}`);
      }

      // Η ΣΥΝΕΔΡΙΑ ΠΡΩΤΑ. Χωρίς αυτήν το ταμείο θα απαντούσε 401 και η οθόνη
      // θα έλεγε «δεν άνοιξε» για κάτι που απλώς δεν ρωτήθηκε ποτέ σωστά.
      const { data, error } = await createClient().auth.getUser();
      if (!alive) return;
      // Σφάλμα ανάγνωσης δεν είναι «συνδεδεμένος». Αν δεν μπορούμε να
      // αποδείξουμε τη συνεδρία, το ταμείο θα απαντούσε 401 και η οθόνη θα
      // κατηγορούσε τη χρέωση για κάτι που δεν έφταιξε.
      if (error || !data.user) { setStage('anonymous'); return; }

      try {
        const res = await fetch(`/api/billing/checkout?plan=${plan}&cycle=${cycle}`);
        const body = await res.json() as { url?: string | null; tester?: boolean; note?: string };
        if (!alive) return;
        if (body.url) { window.location.replace(body.url); return; }
        // Ο δοκιμαστής δεν έχει τι να αγοράσει: το προϊόν του δίνεται ολόκληρο.
        if (body.tester) { window.location.replace('/dashboard'); return; }
        setNote(body.note || '');
        setStage('closed');
      } catch {
        if (alive) setStage('closed');
      }
    })();
    return () => { alive = false; };
  }, []);

  const wrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: T.font.sans, color: 'var(--text-primary)' };
  const card: React.CSSProperties = { width: '100%', maxWidth: 440, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '30px 28px', boxShadow: 'var(--elev-1)' };
  const action: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 20, borderRadius: T.radius.pill, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, textDecoration: 'none' };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          <BrandMark size={34} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Property OS</div>
            <h1 style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, margin: 0 }}>Ολοκλήρωση συνδρομής</h1>
          </div>
        </div>

        {/* Η ΕΠΙΛΟΓΗ ΦΑΙΝΕΤΑΙ ΣΕ ΚΑΘΕ ΚΑΤΑΛΗΞΗ. Ο χρήστης την έκανε τρεις
            οθόνες πριν, και ανάμεσα μεσολάβησε ένα email: το να τη δει
            γραμμένη είναι η μόνη απόδειξη ότι ταξίδεψε σωστά. */}
        {what && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, paddingTop: 18 }}>
            Το πακέτο σου: <strong style={{ color: 'var(--text-primary)' }}>{what}</strong>.
          </div>
        )}

        {stage === 'opening' && (
          <div role="status" style={{ padding: '26px 0 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Ανοίγει το ταμείο…</div>
        )}

        {stage === 'closed' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '14px 0 0' }}>
              Η πληρωμή δεν άνοιξε αυτή τη στιγμή. {note || 'Η δοκιμή σου τρέχει κανονικά, και τη συνδρομή την ολοκληρώνεις όποτε θέλεις από τις Ρυθμίσεις.'}
            </p>
            <Link href="/dashboard" style={action}>Συνέχεια στην εφαρμογή</Link>
          </>
        )}

        {stage === 'anonymous' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '14px 0 0' }}>
              Ο σύνδεσμος άνοιξε χωρίς ενεργή συνεδρία. Συνδέσου με το email σου και συνέχισε τη συνδρομή από τις Ρυθμίσεις.
            </p>
            <Link href="/login" style={action}>Σύνδεση</Link>
          </>
        )}
      </div>
    </div>
  );
}
