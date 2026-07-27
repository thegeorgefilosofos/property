// ═══════════════════════════════════════════════════════════════════════════
// «Ποιοι είμαστε» — η σελίδα εμπιστοσύνης
// ─────────────────────────────────────────────────────────────────────────
// Ζητάμε από τον Έλληνα ιδιοκτήτη το ΑΦΜ του, τα μισθωτήριά του και τα έσοδά
// του. Δεν υπάρχει λόγος να μας τα δώσει αν δεν ξέρει ποιοι είμαστε, πού πάνε
// τα δεδομένα του και τι δεν κάνουμε μ' αυτά. Αυτή η σελίδα απαντά ακριβώς αυτό.
//
// ΚΑΝΟΝΑΣ ΣΥΝΤΑΞΗΣ: κάθε πρόταση εδώ πρέπει να είναι επαληθεύσιμη από τον κώδικα
// ή από τα έγγραφα συμμόρφωσης (docs/compliance). Ό,τι δεν ισχύει ΑΚΟΜΗ γράφεται
// ως «δεν έχει ενεργοποιηθεί», ποτέ σε μέλλοντα που διαβάζεται σαν παρόν. Μια
// σελίδα εμπιστοσύνης που υπερβάλλει είναι χειρότερη από το να μην υπάρχει.
// ═══════════════════════════════════════════════════════════════════════════

import Link from 'next/link';
import type { Metadata } from 'next';
import { T } from '@/components/Theme';
import { IDENTITY, identityIsPublished, orPending } from '@/lib/legal/identity';

export const metadata: Metadata = {
  title: 'Ποιοι είμαστε · Property OS',
  description: 'Ποιοι είμαστε, πού φυλάσσονται τα δεδομένα σου, ποιος μπορεί να τα δει και τι δεν κάνουμε ποτέ μ’ αυτά.',
};

// ── Τα στοιχεία ταυτότητας, σε σειρά ανάγνωσης ─────────────────────────────
const IDENTITY_ROWS: { label: string; value: string }[] = [
  { label: 'Επωνυμία', value: orPending(IDENTITY.legalName) },
  { label: 'Διακριτικός τίτλος', value: IDENTITY.tradeName },
  { label: 'Έδρα', value: orPending(IDENTITY.address) },
  { label: 'ΑΦΜ', value: orPending(IDENTITY.afm) },
  { label: 'ΔΟΥ', value: orPending(IDENTITY.doy) },
  { label: 'ΓΕΜΗ', value: orPending(IDENTITY.gemi) },
  { label: 'Τηλέφωνο', value: orPending(IDENTITY.phone) },
  { label: 'Email υποστήριξης', value: IDENTITY.supportEmail },
];

// ── Πού πάνε τα δεδομένα: ο κατάλογος υπεργολάβων, σε απλά ελληνικά ────────
// Πηγή: docs/compliance/subprocessors.md — κρατείται συγχρονισμένο.
const SUBPROCESSORS: { name: string; what: string; where: string; planned?: boolean }[] = [
  { name: 'Supabase', what: 'Η βάση δεδομένων, η σύνδεση και τα αρχεία σου — η κύρια πλατφόρμα', where: 'ΕΕ · Φρανκφούρτη' },
  { name: 'Vercel', what: 'Φιλοξενία και παράδοση της εφαρμογής', where: 'ΗΠΑ · παγκόσμιο δίκτυο' },
  { name: 'Resend', what: 'Αποστολή όλων των email: λειτουργικά, υπενθυμίσεις, μηνιαίες καταστάσεις με ονόματα και ποσά, ενημερωτικά', where: 'ΗΠΑ' },
  { name: 'Anthropic', what: 'Ο βοηθός και η ανάγνωση εγγράφων: οι ερωτήσεις σου, τα συμφραζόμενα του ακινήτου και όποιο έγγραφο ή φωτογραφία ανεβάζεις για αυτόματη καταχώρηση', where: 'ΗΠΑ' },
  { name: 'GitHub', what: 'Κώδικας και κρυπτογραφημένα αντίγραφα ασφαλείας', where: 'ΗΠΑ' },
  { name: 'Google', what: 'Σύνδεση με λογαριασμό Google (αν την επιλέξεις), ενσωματωμένος χάρτης στο ντοσιέ επαφής, γραμματοσειρές στις εκτυπώσιμες αναφορές — όπου γίνεται γνωστή η διεύθυνση IP σου', where: 'ΗΠΑ' },
  { name: 'OpenStreetMap', what: 'Πρόταση διευθύνσεων καθώς πληκτρολογείς επαφή (Nominatim)', where: 'ΕΕ' },
  { name: 'Sentry', what: 'Καταγραφή σφαλμάτων της εφαρμογής — ενεργοποιείται μόνο αν οριστεί κλειδί· σήμερα δεν είναι ενεργό', where: 'ΗΠΑ / ΕΕ', planned: true },
  { name: 'Stripe', what: 'Χρέωση συνδρομής — ΔΕΝ έχει ενεργοποιηθεί ακόμη', where: 'ΗΠΑ / ΕΕ', planned: true },
  { name: 'Viber, WhatsApp, Apple', what: 'Ειδοποιήσεις σε κινητό — ΔΕΝ έχουν ενεργοποιηθεί ακόμη', where: 'Διάφορες', planned: true },
];

const SECTION: React.CSSProperties = { marginTop: 44, scrollMarginTop: 76 };
const H2: React.CSSProperties = { fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 10px', color: 'var(--text-primary)' };
const P: React.CSSProperties = { fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 12px' };

function Row({ label, value }: { label: string; value: string }) {
  const pending = value.startsWith('Θα δημοσιευθεί');
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: pending ? 400 : 600, fontStyle: pending ? 'italic' : 'normal', color: pending ? 'var(--text-tertiary)' : 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function Point({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }} aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
      <div>
        <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{children}</div>
      </div>
    </div>
  );
}

function Never({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }} aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
      <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}

export default function TrustPage() {
  const published = identityIsPublished();

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: T.font.sans }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 clamp(20px,5vw,40px)', height: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>P</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Property OS</span>
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: 'clamp(32px,6vw,64px) clamp(20px,5vw,40px)' }}>
        <h1 style={{ fontSize: 'clamp(28px,4.4vw,40px)', fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 12px' }}>Ποιοι είμαστε</h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
          Σου ζητάμε το ΑΦΜ σου, τα μισθωτήριά σου και τα έσοδά σου. Δεν υπάρχει λόγος να μας τα εμπιστευτείς
          αν δεν ξέρεις ποιοι είμαστε, πού πάνε και τι δεν κάνουμε μ’ αυτά. Εδώ τα λέμε όσο πιο ανοιχτά μπορούμε,
          χωρίς μικρά γράμματα — μαζί με τις εξαιρέσεις που δεν μας βολεύουν.
        </p>

        {/* ── 1. Ταυτότητα ───────────────────────────────────────────────── */}
        <section style={SECTION}>
          <h2 style={H2}>Τα στοιχεία μας</h2>
          {!published && (
            <p style={{ ...P, padding: '12px 14px', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: 10, margin: '0 0 14px' }}>
              Η υπηρεσία βρίσκεται σε δοκιμαστική λειτουργία (Beta) και δεν γίνεται καμία χρέωση. Τα όρια των πλάνων
              ισχύουν όμως ήδη (1 ακίνητο στο Δωρεάν, μετά τις 30 ημέρες δοκιμής). Τα πλήρη νομικά στοιχεία
              δημοσιεύονται εδώ πριν ενεργοποιηθεί οποιαδήποτε χρέωση. Δεν γράφουμε στοιχεία που δεν έχουν οριστικοποιηθεί.
            </p>
          )}
          <div>{IDENTITY_ROWS.map(r => <Row key={r.label} label={r.label} value={r.value} />)}</div>
        </section>

        {/* ── 2. Πού ζουν τα δεδομένα ────────────────────────────────────── */}
        <section style={SECTION}>
          <h2 style={H2}>Πού φυλάσσονται τα δεδομένα σου</h2>
          <p style={P}>
            Το σύστημα καταγραφής — η βάση δεδομένων, οι κωδικοί σύνδεσης και τα αρχεία που ανεβάζεις —
            βρίσκεται σε διακομιστές <strong style={{ color: 'var(--text-primary)' }}>εντός Ευρωπαϊκής
            Ένωσης, στη Φρανκφούρτη</strong>. Η μεταφορά προς και από την εφαρμογή γίνεται κρυπτογραφημένα (TLS).
            Η κρυπτογράφηση στον δίσκο παρέχεται από την υποδομή του παρόχου (Supabase) — δεν την ελέγχουμε
            εμείς και δεν σου την παρουσιάζουμε ως δική μας εγγύηση.
          </p>
          <p style={P}>
            Μία εξαίρεση στο TLS, γιατί την επιλέγεις εσύ: αν συνδέσεις ημερολόγιο κρατήσεων (iCal) που ο
            πάροχός του δίνει σε <code style={{ fontSize: 13 }}>http://</code>, ο συγχρονισμός αυτός γίνεται
            όπως τον δίνει εκείνος, χωρίς κρυπτογράφηση.
          </p>
          <p style={P}>
            Δεν μένουν όμως όλα μέσα στην ΕΕ, και προτιμούμε να το διαβάσεις εδώ παρά να το ανακαλύψεις:
          </p>
          <ul style={{ margin: '0 0 12px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Το κρυπτογραφημένο αντίγραφο ασφαλείας</strong> φυλάσσεται
              σε υποδομή των ΗΠΑ (GitHub). Είναι κρυπτογραφημένο με AES-256 και χωρίς το κλειδί δεν διαβάζεται.
              Να ξέρεις όμως και το εξής: το κλειδί φυλάσσεται ως secret στον ίδιο πάροχο. Δεν είναι δηλαδή
              διαχωρισμένη φύλαξη κλειδιού και δεδομένων — το λέμε γιατί έχει σημασία, όχι επειδή μας βολεύει.
            </li>
            <li style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Τα ερωτήματά σου προς τον βοηθό</strong>, μαζί με μια
              περίληψη των δεδομένων του ακινήτου, του ενοικιαστή, του πελατολογίου (ονόματα, τηλέφωνα, ΑΦΜ) και
              των επαφών σου, καθώς και όποιο έγγραφο ή φωτογραφία ανεβάζεις για ανάγνωση (Anthropic, ΗΠΑ).
            </li>
            <li style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Τα email που στέλνει η υπηρεσία</strong> — υπενθυμίσεις,
              ειδοποιήσεις, μηνιαίες καταστάσεις. Περιέχουν ονόματα ενοικιαστών και ποσά, και περνούν από τον
              πάροχο αποστολής (Resend, ΗΠΑ).
            </li>
            <li style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Η ίδια η εφαρμογή</strong> σερβίρεται από παγκόσμιο
              δίκτυο (Vercel, ΗΠΑ), οπότε κάθε αίτημά σου περνά από εκεί καθ' οδόν προς τη βάση.
            </li>
          </ul>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
            <Point title="Βλέπεις τα δικά σου — και μόνο όσα εσύ μοιράζεσαι">
              Κάθε γραμμή στη βάση ελέγχεται από κανόνες πρόσβασης στο επίπεδο της ίδιας της βάσης (Row Level
              Security), όχι μόνο από την εφαρμογή. Ακόμη κι αν κάποιος έστελνε χειροκίνητα αίτημα, η βάση θα
              επέστρεφε μόνο ό,τι του ανήκει. Πρόσβαση σε δικά σου δεδομένα έχουν μόνο όσοι επιλέγεις εσύ: τα
              μέλη της ομάδας σου, αν δουλεύεις με ομάδα, και όποιος έχει σύνδεσμο πύλης που έφτιαξες εσύ.
            </Point>
            <Point title="Τα έγγραφά σου σε ιδιωτικό χώρο — με μία εξαίρεση που τη λέμε">
              Τα μισθωτήρια, τα έγγραφα και οι αποδείξεις που ανεβάζεις βρίσκονται σε ιδιωτικό, απομονωμένο χώρο
              ανά χρήστη. Εξαίρεση: το άβαταρ, το λογότυπο και οι φωτογραφίες απογραφής αποθηκεύονται σε δημόσιο
              χώρο — μόνο εσύ μπορείς να τα ανεβάσεις ή να τα σβήσεις, αλλά όποιος έχει τον σύνδεσμο μπορεί να
              τα δει χωρίς σύνδεση. Μην ανεβάζεις εκεί κάτι που δεν θα έδειχνες.
            </Point>
            <Point title="Καθημερινό αντίγραφο ασφαλείας">
              Η διαδικασία τρέχει κάθε μέρα και κρυπτογραφεί το αντίγραφο με AES-256 πριν αποθηκευτεί.
              Είναι σχεδιασμένη ώστε να <strong style={{ color: 'var(--text-primary)' }}>αποτυγχάνει αντί να
              ανεβάσει μη κρυπτογραφημένο αρχείο</strong>: κρυπτογραφημένο αντίγραφο ή κανένα. Ένας δεύτερος
              αυτόματος έλεγχος επιβεβαιώνει καθημερινά ότι το αντίγραφο όντως έγινε και όντως είναι
              κρυπτογραφημένο — γιατί ένα αντίγραφο που σταμάτησε σιωπηλά είναι σαν να μην υπήρχε.
            </Point>
            <Point title="Δεύτερος παράγοντας ταυτοποίησης">
              Μπορείς να ενεργοποιήσεις σύνδεση δύο βημάτων (TOTP) από τον Λογαριασμό σου, με οποιαδήποτε
              εφαρμογή αυθεντικοποίησης.
            </Point>
            <Point title="Ιστορικό ενεργειών ασφαλείας">
              Οι ενέργειες που αφορούν την ασφάλεια του λογαριασμού — αλλαγή κωδικού, ενεργοποίηση ή
              απενεργοποίηση δύο βημάτων, αποσύνδεση από όλες τις συσκευές, και οι μεταβολές μελών σε
              ομάδα — καταγράφονται και μπορείς να τις δεις ο ίδιος στον Λογαριασμό.
            </Point>
          </div>
        </section>

        {/* ── 3. Τι δεν κάνουμε ──────────────────────────────────────────── */}
        <section style={SECTION}>
          <h2 style={H2}>Τι δεν κάνουμε ποτέ</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 6 }}>
            <Never><strong style={{ color: 'var(--text-primary)' }}>Δεν πουλάμε τα δεδομένα σου.</strong> Ούτε τα νοικιάζουμε, ούτε τα δίνουμε σε διαφημιστικά δίκτυα. Το προϊόν θα πληρώνεται από τις συνδρομές, όχι από εσένα ως εμπόρευμα — προς το παρόν δεν πληρώνεται καθόλου, γιατί η χρέωση δεν έχει ενεργοποιηθεί.</Never>
            <Never><strong style={{ color: 'var(--text-primary)' }}>Δεν αποθηκεύουμε στοιχεία κάρτας.</strong> Η χρέωση δεν έχει ενεργοποιηθεί ακόμη. Όταν ενεργοποιηθεί, τα στοιχεία της κάρτας τα χειρίζεται αποκλειστικά ο πάροχος πληρωμών και δεν περνούν ποτέ από τους δικούς μας διακομιστές.</Never>
            <Never><strong style={{ color: 'var(--text-primary)' }}>Δεν διαβάζουμε τα αρχεία σου για πλάκα.</strong> Δεν υπάρχει εσωτερικό εργαλείο περιήγησης στα δεδομένα πελατών. Πρόσβαση γίνεται μόνο κατόπιν δικού σου αιτήματος υποστήριξης ή όπου το επιβάλλει ο νόμος.</Never>
            <Never><strong style={{ color: 'var(--text-primary)' }}>Δεν στέλνουμε στον βοηθό ολόκληρη τη βάση σου.</strong> Στέλνουμε όμως αρκετά, και προτιμούμε να το ξέρεις: περίληψη των ακινήτων σου, του ενοικιαστή, του πελατολογίου και των επαφών σου (ονόματα, τηλέφωνα, ΑΦΜ), καθώς και όποιο έγγραφο ή φωτογραφία ανεβάζεις για ανάγνωση. Αυτά είναι και δεδομένα τρίτων· αν δεν το θέλεις, μη χρησιμοποιείς τον βοηθό και τη σάρωση εγγράφων.</Never>
            <Never><strong style={{ color: 'var(--text-primary)' }}>Δεν σε κλειδώνουμε μέσα.</strong> Κατεβάζεις με ένα κουμπί όλες τις καταχωρήσεις σου σε ένα αρχείο JSON — τα ανεβασμένα αρχεία τα κατεβάζεις χωριστά από το Αρχείο — και διαγράφεις τον λογαριασμό σου χωρίς να χρειαστεί να μας γράψεις.</Never>
          </div>
        </section>

        {/* ── 4. Δικαιώματα ─────────────────────────────────────────────── */}
        <section style={SECTION}>
          <h2 style={H2}>Τα δικαιώματά σου, στην πράξη</h2>
          <p style={P}>
            Ο GDPR σου δίνει δικαιώματα. Εμείς τα κάνουμε κουμπιά, όχι γραφειοκρατία — τα βρίσκεις όλα
            στον <strong style={{ color: 'var(--text-primary)' }}>Λογαριασμό → Δεδομένα &amp; Απόρρητο</strong>.
          </p>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}><strong style={{ color: 'var(--text-primary)' }}>Πρόσβαση &amp; φορητότητα:</strong> κατεβάζεις όλες τις καταχωρήσεις σου σε ένα αρχείο JSON που διαβάζεται από οποιοδήποτε εργαλείο. Τα έγγραφα που έχεις ανεβάσει τα κατεβάζεις από το Αρχείο.</li>
            <li style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}><strong style={{ color: 'var(--text-primary)' }}>Διόρθωση:</strong> κάθε πεδίο το διορθώνεις μόνος σου, χωρίς αίτημα. Μόνη εξαίρεση το ονοματεπώνυμο, που αλλάζει μία φορά τον μήνα για λόγους ασφάλειας.</li>
            <li style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}><strong style={{ color: 'var(--text-primary)' }}>Διαγραφή:</strong> οριστική διαγραφή λογαριασμού και δεδομένων, από την εφαρμογή.</li>
            <li style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}><strong style={{ color: 'var(--text-primary)' }}>Εναντίωση:</strong> απενεργοποιείς τη συνεισφορά στα ανώνυμα δεδομένα κοινότητας με έναν διακόπτη.</li>
          </ul>
          <p style={{ ...P, marginTop: 12 }}>
            Έχεις επίσης δικαίωμα καταγγελίας στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (dpa.gr).
          </p>
        </section>

        {/* ── 5. Συνεργάτες ─────────────────────────────────────────────── */}
        <section style={SECTION}>
          <h2 style={H2}>Ποιοι άλλοι εμπλέκονται</h2>
          <p style={P}>
            Καμία υπηρεσία δεν τρέχει μόνη της. Αυτοί είναι όσοι επεξεργάζονται δεδομένα για λογαριασμό μας,
            τι κάνει ο καθένας και πού βρίσκεται. Δεσμευόμαστε να κρατάμε τον κατάλογο ενημερωμένο και να σου
            το γνωστοποιούμε με email πριν προστεθεί νέος. Όσοι είναι εκτός ΕΕ απαιτούν Τυποποιημένες Συμβατικές
            Ρήτρες· η υπογραφή τους ολοκληρώνεται πριν την εμπορική κυκλοφορία και το δηλώνουμε εδώ όταν γίνει.
          </p>
          <div style={{ marginTop: 14, border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
            {SUBPROCESSORS.map((s, i) => (
              <div key={s.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 0.7fr) minmax(0, 1.6fr) minmax(110px, 0.9fr)', gap: 12, padding: '12px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                <span style={{ fontSize: 13, fontWeight: 650, color: s.planned ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{s.name}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.what}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)', textAlign: 'right' }}>{s.where}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 6. Επικοινωνία ────────────────────────────────────────────── */}
        <section style={SECTION}>
          <h2 style={H2}>Πώς μας βρίσκεις</h2>
          <p style={P}>
            Τα μηνύματά σου τα διαβάζει και τα απαντά άνθρωπος. Αν κάτι δεν δουλεύει ή αν κάτι εδώ σου φαίνεται ασαφές, γράψε μας.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <Row label="Υποστήριξη" value={IDENTITY.supportEmail} />
            <Row label="Προσωπικά δεδομένα" value={IDENTITY.privacyEmail} />
            <Row label="Αναφορά ευπάθειας ασφαλείας" value={IDENTITY.securityEmail} />
          </div>
          <p style={{ ...P, marginTop: 14, fontSize: 13.5, color: 'var(--text-tertiary)' }}>
            Βρήκες κενό ασφαλείας; Γράψε μας πριν το δημοσιοποιήσεις και θα το διορθώσουμε γρήγορα, με αναφορά
            σε εσένα αν το θέλεις. Δεσμευόμαστε να μη στραφούμε νομικά εναντίον ερευνητή που ενεργεί καλόπιστα
            και δεν αποκτά πρόσβαση σε δεδομένα τρίτων· οι πλήρεις όροι είναι δημοσιευμένοι στο{' '}
            <a href="/.well-known/security.txt" style={{ color: 'var(--accent)', textDecoration: 'none' }}>/.well-known/security.txt</a>.
          </p>
        </section>

        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Πολιτική Απορρήτου</Link>
          <Link href="/terms" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Όροι Χρήσης</Link>
          <Link href="/" style={{ color: 'var(--text-tertiary)', textDecoration: 'none', fontSize: 13 }}>← Αρχική</Link>
        </div>
      </main>
    </div>
  );
}
