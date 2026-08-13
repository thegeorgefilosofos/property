'use client';

// ═══════════════════════════════════════════════════════════════════════════
// BankLink — η πόρτα προς την τράπεζα, σε δύο σημεία, με ένα κείμενο
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ. Η σύνδεση με την τράπεζα δεν είχε πουθενά κουμπί. Ο
// χρήστης που την έψαχνε συμπέραινε ότι δεν γίνεται — και δεν είχε τρόπο να
// μάθει ότι είναι νόμιμη, ούτε τι ακριβώς αποκτά πρόσβαση.
//
// ΔΥΟ ΣΗΜΕΙΑ, ΚΑΙ ΤΑ ΔΥΟ ΕΧΟΥΝ ΛΟΓΟ:
//
//   ΣΤΗ ΣΑΡΩΣΗ ΕΓΓΡΑΦΟΥ, τρίτο πλακίδιο δίπλα στη φωτογραφία και το αρχείο.
//   Είναι η ίδια ερώτηση — «πώς μπαίνει αυτή η δαπάνη μέσα;» — και η τράπεζα
//   είναι η τρίτη απάντηση. Όποιος στέκεται εκεί ψάχνει ακριβώς αυτό.
//
//   ΣΤΗΝ ΚΟΡΥΦΗ ΤΩΝ ΔΑΠΑΝΩΝ, μία γραμμή. Εκεί ο χρήστης βλέπει τι έχει
//   καταχωρήσει και τι λείπει· είναι η στιγμή που σκέφτεται «πρέπει να τα
//   περνάω ένα ένα;».
//
// ΤΟ ΚΕΙΜΕΝΟ ΔΕΝ ΕΙΝΑΙ ΕΔΩ. Ζει στο lib/bank/link.ts, με δικές του δοκιμές που
// απαγορεύουν το «δωρεάν», τα ονόματα παρόχων που δεν έχουμε υπογράψει και τις
// διάρκειες αδειών σε μέρες. Δύο οθόνες, μία υπόσχεση.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { Modal, Btn, T, TT } from '@/components/Theme';
import {
  BANK_LINK_TITLE, BANK_LINK_TAGLINE, BANK_LINK_POINTS,
  bankLinkState, bankLinkCta, bankLinkStatusLine, bankLinkPriceLine,
} from '@/lib/bank/link';

const BankGlyph = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 10h18M5 10v9M9 10v9M15 10v9M19 10v9M2 19h20M12 3 3 8h18z" />
  </svg>
);

/**
 * Το παράθυρο με τα τέσσερα «τι πρέπει να ξέρω».
 *
 * ΓΙΑΤΙ ΠΑΡΑΘΥΡΟ ΚΑΙ ΟΧΙ ΚΕΙΜΕΝΟ ΣΤΗ ΣΕΛΙΔΑ. Τέσσερις παράγραφοι νομικής
 * εξήγησης μόνιμα ανοιχτές στην κορυφή των Δαπανών θα ήταν θόρυβος για τους
 * εννιά στους δέκα που δεν τη θέλουν σήμερα. Κρυφό δεν σημαίνει απόν: το
 * πλακίδιο φαίνεται πάντα, η εξήγηση ανοίγει όταν τη ζητήσεις.
 */
function BankLinkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = bankLinkState();
  const [asked, setAsked] = useState(false);

  return (
    <Modal open={open} onClose={onClose} width={620}
      title={BANK_LINK_TITLE}
      subtitle={BANK_LINK_TAGLINE}
      icon={<BankGlyph size={18} />}
      footerInfo={bankLinkStatusLine(state)}
      footer={<>
        <Btn onClick={onClose}>Κλείσιμο</Btn>
        {/* Ο,ΤΙ ΔΕΝ ΓΙΝΕΤΑΙ ΑΚΟΜΗ, ΔΕΝ ΠΡΟΣΠΟΙΕΙΤΑΙ ΟΤΙ ΓΙΝΕΤΑΙ. Όσο δεν
            υπάρχει πάροχος με τιμή, το κουμπί ζητά ειδοποίηση αντί να ανοίγει
            ροή που θα σκάσει στο δεύτερο βήμα. */}
        <Btn variant="primary" onClick={() => setAsked(true)}>
          {asked ? 'Θα σου πούμε' : bankLinkCta(state)}
        </Btn>
      </>}>

      {BANK_LINK_POINTS.map(p => (
        <div key={p.title}>
          <div style={{ ...TT.h2, fontSize: 14 }}>{p.title}</div>
          <div style={{ ...TT.bodySm, marginTop: 6 }}>{p.body}</div>
        </div>
      ))}

      <div style={{ ...TT.caption, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
        {bankLinkPriceLine()}
      </div>
    </Modal>
  );
}

/**
 * Το πλακίδιο της σάρωσης: τρίτη επιλογή, ίδια γεωμετρία με τα δύο διπλανά.
 *
 * Το ύψος και η ακτίνα ΔΕΝ γράφονται εδώ ελεύθερα — έρχονται από τον καλούντα,
 * ώστε τα τρία πλακίδια να είναι πάντα ίσα. Ένα τρίτο πλακίδιο δύο
 * εικονοστοιχεία ψηλότερο διαβάζεται ως λάθος, όχι ως έμφαση.
 */
export function BankLinkTile({ minHeight = 172 }: { minHeight?: number }) {
  const [open, setOpen] = useState(false);
  const state = bankLinkState();

  return (<>
    <div role="button" tabIndex={0} onClick={() => setOpen(true)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
      style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.card, minHeight, cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', padding: '0 12px', textAlign: 'center' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-dim)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}>
      <span style={{ marginBottom: 12, display: 'inline-flex' }}><BankGlyph /></span>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>{BANK_LINK_TITLE}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        {state === 'open' ? 'Οι κινήσεις σου, έτοιμες' : 'Ετοιμάζεται · δες τι είναι'}
      </div>
    </div>
    <BankLinkModal open={open} onClose={() => setOpen(false)} />
  </>);
}

/**
 * Η γραμμή στην κορυφή των Δαπανών.
 *
 * Μία σειρά, όχι κάρτα: η κάρτα θα διεκδικούσε τη θέση του περιεχομένου που ο
 * χρήστης ήρθε να δει. Το «τι είναι» μένει κλειστό μέχρι να το ζητήσει.
 */
export function BankLinkRow() {
  const [open, setOpen] = useState(false);
  const state = bankLinkState();

  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.md, flexWrap: 'wrap', marginBottom: T.sp.lg, padding: '11px 14px', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
      <span style={{ color: 'var(--text-tertiary)', display: 'inline-flex', flexShrink: 0 }}><BankGlyph size={18} /></span>
      <span style={{ ...TT.bodySm, color: 'var(--text-primary)', fontWeight: 700 }}>{BANK_LINK_TITLE}</span>
      <span style={{ ...TT.caption, flex: 1, minWidth: 140 }}>
        {state === 'open'
          ? 'Κάθε χρέωση και είσπραξη έτοιμη για καταχώρηση, με ένα πάτημα.'
          : 'Κάθε χρέωση και είσπραξη έτοιμη για καταχώρηση. Ετοιμάζεται.'}
      </span>
      <button onClick={() => setOpen(true)}
        style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '6px 14px', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>
        Τι είναι
      </button>
    </div>
    <BankLinkModal open={open} onClose={() => setOpen(false)} />
  </>);
}
