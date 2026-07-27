'use client';

// ═══════════════════════════════════════════════════════════════════════════
// SettingsRoadmap, «Τι έρχεται». Αντικαθιστά το παλιό block «Ενσωματώσεις»:
// αντί να απαριθμεί τι ήδη δουλεύει, χτίζει προσδοκία για ό,τι έρχεται. Ναυαρχίδα
// είναι το Property OS Mobile (iOS & Android). Καθαρό, premium, ζωντανό, χωρίς
// ψεύτικα «σύνδεσε». Μπαίνει μέσα σε υπάρχουσα Card, οπότε ξεκινά με διαχωριστικό.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Btn, Chip } from '@/components/Theme';

type ChipTone = 'accent' | 'neutral';

interface RoadItem { name: string; line: string; detail: string; chip: string; tone: ChipTone }

const ITEMS: RoadItem[] = [
  {
    name: 'Πληρωμές εντός εφαρμογής',
    line: 'Είσπραξη με κάρτα ή IRIS μέσα από το app, με αδειοδοτημένο πάροχο.',
    detail: 'Ο ενοικιαστής εξοφλεί με ένα κλικ και η πληρωμή καταγράφεται μόνη της στο ταμείο σου.',
    chip: 'Σε ανάπτυξη', tone: 'accent',
  },
  {
    name: 'Channel manager δύο κατευθύνσεων',
    line: 'Αμφίδρομος συγχρονισμός τιμών και διαθεσιμότητας με Airbnb και Booking.',
    detail: 'Μία αλλαγή ενημερώνει ταυτόχρονα όλα τα κανάλια, χωρίς διπλές κρατήσεις.',
    chip: 'Σύντομα', tone: 'neutral',
  },
  {
    name: 'Τραπεζικές ροές (open banking)',
    line: 'Αυτόματη άντληση κινήσεων λογαριασμού, χωρίς χειρωνακτική καταχώρηση.',
    detail: 'Συνδέεις τον λογαριασμό σου με ασφάλεια και οι κινήσεις αντιστοιχίζονται μόνες τους στα ακίνητα.',
    chip: 'Σχεδιάζεται', tone: 'neutral',
  },
  {
    name: 'Ζωντανά δεδομένα αγοράς',
    line: 'Τρέχουσες τιμές και αποδόσεις ανά περιοχή από επίσημες πηγές.',
    detail: 'Βλέπεις πού κινείται η αγορά στη γειτονιά σου και τιμολογείς με δεδομένα, όχι με εικασίες.',
    chip: 'Σχεδιάζεται', tone: 'neutral',
  },
];

export default function SettingsRoadmap({ userId }: { userId: string }) {
  const supabase = createClient();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>({});

  // Στο mount: αν ο χρήστης έχει ήδη δηλώσει ενδιαφέρον, δείξε κατευθείαν το
  // επιβεβαιωμένο state. Σφάλματα σιωπηλά (χωρίς alert).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('billing_profiles').select('wants_mobile').eq('user_id', userId).maybeSingle();
        const wants = (data as { wants_mobile?: boolean } | null)?.wants_mobile;
        if (alive && wants) setConfirmed(true);
      } catch {
        /* σιωπηλά */
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const notify = async () => {
    if (busy || confirmed) return;
    setBusy(true);
    try {
      // Καταγράφεται στη λίστα αναμονής με το email του, για πραγματικό ενημερωτικό
      // email στην κυκλοφορία της εφαρμογής (η RPC κρατά και το wants_mobile).
      const { error } = await supabase.rpc('join_mobile_waitlist');
      if (!error) setConfirmed(true);
    } catch {
      /* σιωπηλά */
    } finally {
      setBusy(false);
    }
  };

  // Έξοδος από τη λίστα (αν μετάνιωσε)· μπορεί να ξαναμπεί όποτε θέλει.
  const leave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('leave_mobile_waitlist');
      if (!error) setConfirmed(false);
    } catch {
      /* σιωπηλά */
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) => setOpen(p => ({ ...p, [i]: !p[i] }));

  return (
    <div>
      {/* Επικεφαλίδα ενότητας */}
      <div className="acc-section" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: T.font.sans, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Τι έρχεται
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginTop: 5 }}>
          Μια έμπειρη ομάδα εξελίσσει το Property OS κάθε μέρα, χωρίς να μένει ποτέ στάσιμη.
        </div>
      </div>

      {/* HERO, Property OS Mobile */}
      <div
        className="acc-section"
        style={{
          position: 'relative', overflow: 'hidden',
          background: 'var(--surface-hero)', border: '1px solid var(--border-raised)',
          borderRadius: T.radius.card, boxShadow: 'var(--highlight-inset), var(--elev-2)',
          padding: 18, marginBottom: 16, animationDelay: '60ms',
        }}
      >
        {/* Διακριτικό «ζωντανό» phone glyph στο βάθος (metaverse depth) */}
        <span
          aria-hidden
          style={{ position: 'absolute', top: -22, right: -14, color: 'var(--accent)', opacity: 0.1, pointerEvents: 'none' }}
        >
          <svg width={150} height={150} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ maxWidth: '100%' }}>
            <rect x="6" y="2" width="12" height="20" rx="3" />
            <line x1="10" y1="18.5" x2="14" y2="18.5" />
          </svg>
        </span>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          {/* App-icon tile με το «P» mark */}
          <div
            aria-hidden
            style={{
              width: 46, height: 46, borderRadius: 12, flexShrink: 0,
              background: 'var(--accent)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--highlight-inset), var(--elev-1)',
            }}
          >
            <span style={{ fontFamily: T.font.sans, fontWeight: 800, fontSize: 24, lineHeight: 1, letterSpacing: '-0.02em' }}>P</span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, letterSpacing: '-0.01em' }}>
                Property OS Mobile
              </span>
              <Chip tone="accent">
                <span className="acc-live-dot accent" aria-hidden style={{ width: 6, height: 6, background: 'var(--accent)', display: 'inline-block' }} />
                Σε ανάπτυξη
              </Chip>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, margin: '8px 0 0' }}>
              Όλη η διαχείριση των ακινήτων σου στο κινητό, με λίγα κλικ ή τη φωνή σου. Απλά και γρήγορα,
              όπου κι αν βρίσκεσαι.
            </p>

            {/* Μέχρι να βγει η αυτόνομη εφαρμογή, το Property OS εγκαθίσταται ήδη
                στην αρχική οθόνη. Το λέμε εδώ, δίπλα στην αναμονή, αντί να
                αφήνουμε τον χρήστη να περιμένει κάτι που έχει ήδη σε άλλη μορφή. */}
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Μέχρι τότε, βάλ’ το ήδη στην αρχική σου οθόνη.</strong>{' '}
              Ανοίγει σαν κανονική εφαρμογή, με δικό της εικονίδιο και χωρίς μπάρα διεύθυνσης.
              Σε <strong style={{ color: 'var(--text-primary)' }}>Android</strong> από το μενού «⋮» → «Εγκατάσταση εφαρμογής».
              Σε <strong style={{ color: 'var(--text-primary)' }}>iPhone</strong> από το κουμπί «Κοινή χρήση» → «Πρόσθεση στην αρχική οθόνη».
            </div>

            {/* Platform chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Chip tone="neutral">iOS</Chip>
              <Chip tone="neutral">Android</Chip>
            </div>

            {/* CTA: ένα κουμπί-διακόπτης. Μπαίνεις στη λίστα και, αν ξαναπατήσεις
                το «Θα σε ειδοποιήσουμε», βγαίνεις και επιστρέφει στο «Ειδοποίησέ με». */}
            <div style={{ marginTop: 14 }}>
              {confirmed ? (
                <button
                  type="button"
                  onClick={leave}
                  disabled={busy}
                  aria-pressed
                  title="Πάτησε ξανά για να βγεις από τη λίστα"
                  onMouseEnter={e => { if (!busy) e.currentTarget.style.borderColor = 'var(--positive)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--positive-border)'; }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '9px 18px', borderRadius: T.radius.btn,
                    fontSize: 12, fontWeight: 700, fontFamily: T.font.sans,
                    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                    background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', color: 'var(--positive)',
                    transition: 'border-color 0.15s cubic-bezier(0.2,0,0,1)',
                  }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  Θα σε ειδοποιήσουμε
                </button>
              ) : (
                <Btn variant="primary" onClick={notify} disabled={busy}>
                  {busy ? 'Ειδοποίηση…' : 'Ειδοποίησέ με μόλις βγει'}
                </Btn>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Δευτερεύοντα, όλα μαζί σε μία σειρά: ομοιόμορφα, συμπαγή, ισοϋψή.
          Τέσσερα σε πλάτος στην επιφάνεια εργασίας, αναδιπλώνονται καθαρά. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 168px), 1fr))', gap: 10, alignItems: 'start' }}>
        {ITEMS.map((it, i) => {
          const isOpen = !!open[i];
          return (
            <button
              key={it.name}
              type="button"
              className="acc-section acc-choice"
              aria-expanded={isOpen}
              onClick={() => toggle(i)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'var(--highlight-inset), var(--elev-1)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'none'; }}
              style={{
                display: 'flex', flexDirection: 'column',
                width: '100%', minHeight: 190, textAlign: 'left', cursor: 'pointer',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: T.radius.inner, padding: 13, fontFamily: T.font.sans,
                animationDelay: `${120 + i * 55}ms`,
              }}
            >
              {/* Chip πρώτο, ενιαία θέση σε όλα τα κελιά (ιεραρχία/τυποποίηση) */}
              <div style={{ marginBottom: 8 }}>
                <Chip tone={it.tone}>{it.chip}</Chip>
              </div>

              <span style={{
                fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>{it.name}</span>

              <div style={{
                fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.45, marginTop: 6,
                ...(isOpen ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
              }}>{it.line}</div>

              {isOpen && (
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-subtle)' }}>
                  {it.detail}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 'auto', paddingTop: 10, color: 'var(--text-tertiary)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.02em' }}>
                  {isOpen ? 'Λιγότερα' : 'Περισσότερα'}
                </span>
                <svg aria-hidden="true" focusable="false" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.18s cubic-bezier(0.2,0,0,1)', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
