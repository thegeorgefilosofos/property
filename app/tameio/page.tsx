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
// Ο σύνδεσμος του εμπόρου: η κανονική διαδρομή και φεύγουμε αμέσως.
// Ο πίνακας: όταν δεν υπάρχει τίποτα να αγοραστεί — δοκιμαστής, ή πακέτο που
//   δεν αναγνωρίζεται. Δεν λέγεται τίποτα, γιατί δεν συνέβη τίποτα.
// Αυτή η κάρτα: όταν η χρέωση δεν είναι ρυθμισμένη ή το ταμείο δεν άνοιξε. Η
//   δοκιμή τρέχει έτσι κι αλλιώς και αυτό λέγεται με λέξεις — μια σιωπηλή
//   ανακατεύθυνση θα άφηνε τον χρήστη να νομίζει ότι πλήρωσε.
//
// ΓΙΑΤΙ ΔΕΝ ΖΕΙ ΣΤΟΝ ΔΙΑΚΟΜΙΣΤΗ. Η συνεδρία γεννιέται στην ανταλλαγή του
// διακριτικού (app/auth/callback) και το ταμείο είναι σύνδεσμος μιας χρήσης
// με ημερομηνία λήξης: δεν επιτρέπεται να μπει σε καμία μνήμη ενδιάμεσου.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import { T } from '@/components/tokens';
import { authClient } from '@/lib/supabase/lazy';
import { PLANS, PLAN_ORDER, TRIAL_DAYS, type PlanId, type BillingCycle } from '@/lib/billing/plans';
import { planFromParam, cycleFromParam } from '@/lib/billing/entitlements';
import { fe } from '@/lib/core/format';

type Stage = 'opening' | 'choose' | 'closed' | 'anonymous';

export default function CheckoutLanding() {
  const [stage, setStage] = useState<Stage>('opening');
  const [note, setNote] = useState('');
  const [what, setWhat] = useState('');

  // Ο κύκλος του επιλογέα. Ξεκινά μηνιαίος: είναι η μικρότερη δέσμευση και
  // όποιος θέλει ετήσια το λέει μόνος του.
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  /**
   * Ζητά τον σύνδεσμο του ταμείου και φεύγει.
   *
   * ΤΟ ΙΔΙΟ ΜΟΝΟΠΑΤΙ ΚΑΙ ΓΙΑ ΤΙΣ ΔΥΟ ΑΦΕΤΗΡΙΕΣ — αυτόν που ήρθε με πακέτο στη
   * διεύθυνση και αυτόν που το διάλεξε εδώ. Δύο αντίγραφα θα απέκλιναν στην
   * πρώτη αλλαγή και η μία από τις δύο διαδρομές θα έσπαγε σιωπηλά.
   */
  const open = useCallback(async (plan: PlanId, cyc: BillingCycle) => {
    setStage('opening');
    setWhat(`${PLANS[plan].name}, ${cyc === 'annual'
      ? `με ετήσια χρέωση ${fe(PLANS[plan].priceAnnual)}`
      : `με μηνιαία χρέωση ${fe(PLANS[plan].priceMonthly)}`}`);
    try {
      const res = await fetch(`/api/billing/checkout?plan=${plan}&cycle=${cyc}`);
      const body = await res.json() as { url?: string | null; tester?: boolean; note?: string };
      if (body.url) { window.location.replace(body.url); return; }
      // Ο δοκιμαστής δεν έχει τι να αγοράσει: το προϊόν του δίνεται ολόκληρο.
      if (body.tester) { window.location.replace('/dashboard'); return; }
      setNote(body.note || '');
      setStage('closed');
    } catch {
      setStage('closed');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const plan = planFromParam(q.get('plan'));

      // Η ΣΥΝΕΔΡΙΑ ΠΡΩΤΑ. Χωρίς αυτήν το ταμείο θα απαντούσε 401 και η οθόνη
      // θα έλεγε «δεν άνοιξε» για κάτι που απλώς δεν ρωτήθηκε ποτέ σωστά.
      const { data, error } = await (await authClient()).auth.getUser();
      if (!alive) return;
      // Σφάλμα ανάγνωσης δεν είναι «συνδεδεμένος». Αν δεν μπορούμε να
      // αποδείξουμε τη συνεδρία, το ταμείο θα απαντούσε 401 και η οθόνη θα
      // κατηγορούσε τη χρέωση για κάτι που δεν έφταιξε.
      if (error || !data.user) { setStage('anonymous'); return; }

      // ── ΧΩΡΙΣ ΠΑΚΕΤΟ ΔΕΝ ΠΑΕΙ ΣΤΟΝ ΠΙΝΑΚΑ, ΡΩΤΑΕΙ ─────────────────────
      // ΕΔΩ ΗΤΑΝ Η ΔΙΑΡΡΟΗ ΤΟΥ ΧΩΝΙΟΥ, ΚΑΙ ΗΤΑΝ ΣΤΗ ΣΥΝΗΘΕΣΤΕΡΗ ΔΙΑΔΡΟΜΗ.
      // Το κουμπί «Ξεκίνα τη δοκιμή» της αρχικής και της κεφαλίδας πάει στο
      // /signup ΧΩΡΙΣ πακέτο — πακέτο κουβαλά μόνο όποιος πάτησε κάρτα μέσα
      // στον τιμοκατάλογο. Ολοι οι υπόλοιποι έφταναν εδώ με άδεια διεύθυνση,
      // ανακατευθύνονταν σιωπηλά στον πίνακα και δεν τους ρωτούσε ΠΟΤΕ
      // κανείς τι πακέτο θέλουν: η δοκιμή έτρεχε τριάντα ημέρες και μετά ο
      // λογαριασμός έμενε σε αναμονή, χωρίς να έχει δει ούτε μία φορά τιμή.
      if (!plan) { setStage('choose'); return; }

      await open(plan, cycleFromParam(q.get('cycle')));
    })();
    return () => { alive = false; };
  }, [open]);

  const wrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: T.font.sans, color: 'var(--text-primary)' };
  const card: React.CSSProperties = { width: '100%', maxWidth: 440, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '30px 28px', boxShadow: 'var(--elev-1)' };
  const action: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 20, borderRadius: T.radius.pill, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, textDecoration: 'none' };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          <BrandMark size={34} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>PROPERWISE</div>
            <h1 style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, margin: 0 }}>
              {stage === 'choose' ? 'Διάλεξε πακέτο' : 'Ολοκλήρωση συνδρομής'}
            </h1>
          </div>
        </div>

        {/* Η ΕΠΙΛΟΓΗ ΦΑΙΝΕΤΑΙ ΣΕ ΚΑΘΕ ΚΑΤΑΛΗΞΗ. Ο χρήστης την έκανε τρεις
            οθόνες πριν και ανάμεσα μεσολάβησε ένα email: το να τη δει
            γραμμένη είναι η μόνη απόδειξη ότι ταξίδεψε σωστά. */}
        {what && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, paddingTop: 18 }}>
            Το πακέτο σου: <strong style={{ color: 'var(--text-primary)' }}>{what}</strong>.
          </div>
        )}

        {/* ── Ο ΕΠΙΛΟΓΕΑΣ ──────────────────────────────────────────────────
            ΤΕΣΣΕΡΙΣ ΣΕΙΡΕΣ, ΟΧΙ ΤΕΣΣΕΡΙΣ ΚΑΡΤΕΣ. Ο τιμοκατάλογος της αρχικής
            πουλάει: έχει χαρακτηριστικά, σήματα και σύγκριση. Εδώ ο χρήστης
            ΕΧΕΙ ΗΔΗ αποφασίσει να ξεκινήσει — του λείπει μόνο το ποιο. Μια
            σειρά ανά πακέτο, όνομα αριστερά, ποσό δεξιά, ίδιος άξονας με την
            κάρτα της εγγραφής.
            ΤΟ ΟΡΙΟ ΑΚΙΝΗΤΩΝ ΕΙΝΑΙ ΤΟ ΜΟΝΟ ΧΑΡΑΚΤΗΡΙΣΤΙΚΟ ΠΟΥ ΜΕΝΕΙ, γιατί
            είναι το μόνο που αποφασίζει πραγματικά ποιο πακέτο χρειάζεται. */}
        {stage === 'choose' && (
          <div style={{ paddingTop: 18 }}>
            <div style={{ display: 'flex', gap: 4, padding: 4, marginBottom: 14, background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
              {([['monthly', 'Μηνιαία'], ['annual', 'Ετήσια']] as const).map(([v, lab]) => (
                <button key={v} type="button" onClick={() => setCycle(v)} aria-pressed={cycle === v}
                  style={{ flex: 1, minHeight: 40, borderRadius: T.radius.inner, border: 'none', cursor: 'pointer',
                    background: cycle === v ? 'var(--accent)' : 'transparent',
                    color: cycle === v ? 'var(--accent-text)' : 'var(--text-secondary)',
                    fontFamily: T.font.sans, fontSize: 13, fontWeight: 600 }}>
                  {lab}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {PLAN_ORDER.filter(id => id !== 'free').map(id => {
                const p = PLANS[id];
                const price = cycle === 'annual' ? p.priceAnnual : p.priceMonthly;
                const limit = Number.isFinite(p.maxProperties)
                  ? (p.maxProperties === 1 ? '1 ακίνητο' : `Έως ${p.maxProperties} ακίνητα`)
                  : 'Απεριόριστα ακίνητα';
                return (
                  <button key={id} type="button" onClick={() => open(id, cycle)}
                    className="po-choice"
                    style={{ display: 'grid', gridTemplateColumns: '1fr auto', columnGap: 14, rowGap: 2,
                      alignItems: 'baseline', width: '100%', minHeight: 58, padding: '11px 14px', textAlign: 'left',
                      borderRadius: T.radius.inner, border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface)', cursor: 'pointer', fontFamily: T.font.sans }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>{p.name}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right',
                      fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fe(price)}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>{limit}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {cycle === 'annual' ? 'τον χρόνο' : 'τον μήνα'}
                    </span>
                  </button>
                );
              })}
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
              Οι πρώτες {TRIAL_DAYS} ημέρες είναι δωρεάν και το πακέτο το αλλάζεις όποτε θέλεις από τις Ρυθμίσεις.
            </p>
          </div>
        )}

        {stage === 'opening' && (
          <div role="status" style={{ padding: '26px 0 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Ανοίγει το ταμείο…</div>
        )}

        {stage === 'closed' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '14px 0 0' }}>
              Η πληρωμή δεν άνοιξε αυτή τη στιγμή. {note || 'Η δοκιμή σου τρέχει κανονικά και τη συνδρομή την ολοκληρώνεις όποτε θέλεις από τις Ρυθμίσεις.'}
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
