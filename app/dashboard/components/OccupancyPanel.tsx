'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΠΛΗΡΟΤΗΤΑ & ΒΡΑΧΥΧΡΟΝΙΑ — ΔΥΟ ΕΡΩΤΗΣΕΙΣ, ΔΥΟ ΑΠΑΝΤΗΣΕΙΣ
// ─────────────────────────────────────────────────────────────────────────
// Ο ιδιοκτήτης ρωτά δύο πράγματα: πόσο γεμάτο ήταν, και πόσα του μένουν. Η
// κάρτα είχε οκτώ ισοβαρή πλακίδια σε πλέγμα 5+3, με δύο κενά κελιά στο τέλος,
// και το μοναδικό ποσό που τον ενδιαφέρει διαβαζόταν τελευταίο.
//
// ── ΤΕΣΣΕΡΑ ΣΦΑΛΜΑΤΑ ΟΡΘΟΤΗΤΑΣ, ΜΕΤΡΗΜΕΝΑ ─────────────────────────────────
//
// 1. Η ΣΤΗΛΗ ΤΩΝ ΑΦΑΙΡΕΣΕΩΝ ΔΕΝ ΕΒΓΑΖΕ ΤΟ ΣΥΝΟΛΟ. Το πλακίδιο του τέλους
//    έδειχνε το ΟΦΕΙΛΟΜΕΝΟ (`tax.levy`), ενώ από τα καθαρά αφαιρείται μόνο το
//    ΑΚΑΛΥΠΤΟ (`tax.levyShortfall`). Ο χρήστης πρόσθετε 5.600 − 256 − 600 − 798
//    = 3.946 και διάβαζε «Μένει καθαρά 4.010». Η εξήγηση υπήρχε μόνο σε
//    `title=`, δηλαδή πουθενά για όποιον είναι σε κινητό.
//
// 2. ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΑ ΑΚΑΘΑΡΙΣΤΑ ΣΤΗΝ ΙΔΙΑ ΚΑΡΤΑ. Το πλακίδιο έπαιρνε το
//    `totals()` (ολόκληρο το ποσό, φιλτραρισμένο με check_in) ενώ ο φόρος και
//    τα καθαρά χτίζονταν στο `tax.grossRevenue` (αναλογία νυχτών ανά έτος). Για
//    μία διαμονή 28/12/2025 → 5/1/2026 των 800 €: η κάρτα του 2026 έγραφε
//    «Δηλωτέα ακαθάριστα 0,00 €» και «Μένει καθαρά 336,14 €» — χρήματα από το
//    πουθενά. Και του 2025 έγραφε 784,00 € ενώ φορολογούσε 392,00 €.
//
// 3. ΟΙ ΠΡΟΜΗΘΕΙΕΣ ΔΕΝ ΑΚΟΛΟΥΘΟΥΣΑΝ ΤΟΝ ΙΔΙΟ ΚΑΝΟΝΑ ΜΕ ΤΟ ΕΣΟΔΟ ΤΟΥΣ. Το ίδιο
//    έξοδο κατανεμόταν 100/0 στα δύο έτη ενώ το έσοδό του κατανεμόταν 50/50.
//
// 4. ΟΙ ΝΥΧΤΕΣ ΜΕΤΡΙΟΝΤΑΝ ΜΕ ΔΥΟ ΚΑΝΟΝΕΣ. Η λωρίδα ζητούσε check_out· η
//    φορολογική σύνοψη έπεφτε πίσω στο `s.nights`. Διαμονή χωρίς καταχωρημένη
//    αναχώρηση έγραφε «0 νύχτες» δίπλα σε «τέλος για 5 νύχτες».
//
// ΤΟ ΣΦΑΛΜΑ ΔΕΝ ΔΙΟΡΘΩΝΕΤΑΙ ΜΕ ΑΛΛΑΓΗ ΝΟΥΜΕΡΟΥ, ΑΛΛΑ ΜΕ ΑΛΛΑΓΗ ΣΧΗΜΑΤΟΣ. Οι
// αφαιρέσεις είναι πλέον ΔΕΔΟΜΕΝΑ (`shortTermNetLines`) και το σύνολο
// ΠΑΡΑΓΕΤΑΙ από το άθροισμά τους (`shortTermNet`), δίπλα στους αριθμούς και όχι
// μέσα στην οθόνη. Καμία γραμμή δεν μπορεί να φαίνεται χωρίς να μετράει, και
// καμία να μετράει χωρίς να φαίνεται· ένας έλεγχος το κρατά έτσι.
//
// ── ΤΙ ΕΦΥΓΕ ──────────────────────────────────────────────────────────────
// · «Διαφορά vs μακροχρόνια». Συνέκρινε το ΠΡΑΓΜΑΤΙΚΟ, συχνά τετράμηνο έτος
//   βραχυχρόνιας μετά από φόρο, τέλη και προμήθειες, με δώδεκα μήνες
//   υποθετικού ενοικίου χωρίς καμία δαπάνη και καμία κενή περίοδο — και το
//   ενοίκιο ήταν συχνά ο ΣΤΟΧΟΣ (`target_rent`), δηλαδή επιθυμία, όχι γεγονός.
//   Πάνω σε αυτό το νούμερο ο ιδιοκτήτης αποφασίζει αν θα φύγει από το Airbnb.
// · Τα πλακίδια «Πληρότητα» και «Νύχτες / έτος»: το πρώτο επαναλάμβανε το σήμα
//   της κεφαλίδας, το δεύτερο το «Σύνολο» της λωρίδας.
// · Οι επτά μήνες με «0». Η ίδια κάρτα υποστηρίζει ότι παρονομαστής είναι οι
//   ΔΙΑΘΕΣΙΜΕΣ ημέρες, και μετά ζωγράφιζε δώδεκα κουτάκια σαν να ήταν όλος ο
//   χρόνος διαθέσιμος. Εκτός παραθύρου δεν υπάρχει μηδέν, υπάρχει άγνωστο.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as stayStore from '@/lib/data/stays';
import { T, fe, fp, Skeleton, Btn, pressable } from '@/components/Theme';
import { readStatus, type StatusRow } from '@/lib/property/status';
import { occupancyFromMonths, totals, type ReportStay } from '@/lib/clients/reports';
import { shortTermYearSummary, shortTermNetLines, shortTermNet } from '@/lib/tax/shortTermTax';
import { MONTHS_SHORT } from '@/lib/core/months';

interface StayRow extends ReportStay { declared_at?: string | null }
interface PropInfo extends StatusRow { prop_type?: string | null; sqm?: number | null }

export default function OccupancyPanel({ propertyId, userId, onOpenClients }: {
  propertyId: string; userId: string; onOpenClients?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [prop, setProp] = useState<PropInfo | null>(null);
  const [stays, setStays] = useState<StayRow[]>([]);
  // ΤΟ ΤΕΛΟΣ ΠΑΡΕΠΙΔΗΜΟΥΝΤΩΝ ΕΞΑΡΤΑΤΑΙ ΑΠΟ ΤΟ ΠΛΗΘΟΣ ΤΩΝ ΑΚΙΝΗΤΩΝ. Χωρίς αυτό,
  // το `shortTermYearSummary` έπαιρνε την προεπιλογή «φυσικό πρόσωπο, ένα
  // ακίνητο» και έβγαζε πάντα μηδέν — δηλαδή ο ιδιοκτήτης με τρία ακίνητα
  // έβλεπε σιωπηλά 0 αντί για 0,5% επί των ακαθαρίστων.
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    try {
      const [p, s, n] = await Promise.all([
        properties.one(supabase, propertyId, 'status_detail,rental_mode,prop_type,sqm'),
        stayStore.ofProperty<StayRow>(supabase, propertyId, stayStore.ACCOUNTING_COLUMNS, userId),
        properties.count(supabase, userId),
      ]);
      setProp((p || null) as PropInfo | null);
      setStays(s);
      setPropertyCount(n);
    } finally { setLoading(false); }
  }, [supabase, propertyId, userId]);
  useEffect(() => { load(); }, [load]);

  // Η ΚΑΤΑΣΤΑΣΗ ΑΠΟΦΑΣΙΖΕΙ, ΟΧΙ ΔΙΑΚΟΠΤΗΣ. Ίδια πηγή με τις καρτέλες.
  const isShort = readStatus(prop) === 'rent_short';

  const isHouse = ['house', 'villa'].includes(String(prop?.prop_type || '').toLowerCase());
  const tax = useMemo(() => shortTermYearSummary(stays, year, {
    sqm: prop?.sqm ?? null, isHouse, propertyCount: propertyCount ?? 1, individual: true,
  }), [stays, year, prop?.sqm, isHouse, propertyCount]);

  // ΕΝΑΣ ΜΕΤΡΗΤΗΣ ΝΥΧΤΩΝ ΓΙΑ ΟΛΗ ΤΗΝ ΚΑΡΤΑ. Η πληρότητα τρέφεται από τον ΙΔΙΟ
  // πίνακα μηνών που παράγει το τέλος και τον φόρο, ώστε να μην μπορεί να
  // υπάρξει «0 νύχτες» δίπλα σε «τέλος για πέντε».
  const occ = useMemo(() => occupancyFromMonths(tax.nightsByMonth, year), [tax.nightsByMonth, year]);

  // Πλήθη διαμονών: εδώ το `totals` είναι σωστό, γιατί μετρά ΓΕΓΟΝΟΤΑ (πόσες
  // διαμονές, πόσες αδήλωτες) και μια διαμονή δηλώνεται μία φορά, στο έτος της.
  const counts = useMemo(
    () => totals(stays.filter(s => (s.check_in || '').slice(0, 4) === String(year))),
    [stays, year]);

  const lines = useMemo(() => shortTermNetLines(tax), [tax]);
  const net = shortTermNet(lines);

  if (!loading && !isShort) return null;

  const label: React.CSSProperties = {
    fontFamily: T.font.sans, fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)',
  };
  const note: React.CSSProperties = {
    fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.65,
  };
  const num: React.CSSProperties = { fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' };

  // Οι μήνες που ΖΩΓΡΑΦΙΖΟΝΤΑΙ είναι το παράθυρο λειτουργίας, όχι ο χρόνος.
  const from = occ.openFromMonth, to = occ.openToMonth;
  const months = from == null || to == null ? [] : Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const peakNights = months.reduce((m, i) => Math.max(m, occ.nightsByMonth[i]), 0);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', minHeight: 44 }}
        {...pressable(() => setOpen(o => !o), open ? 'Σύμπτυξη πληρότητας' : 'Ανάπτυξη πληρότητας', open)}>
        <div style={{ minWidth: 0 }}>
          <div style={label}>Πληρότητα & Βραχυχρόνια</div>
          <div style={{ ...note, marginTop: 1 }}>Από τις καταγεγραμμένες κρατήσεις σου, όχι από πληκτρολόγηση</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Η ΠΛΗΡΟΤΗΤΑ ΛΕΓΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΕΔΩ. Ηταν και σήμα και πλακίδιο, δύο
              εκατοστά μακριά το ένα από το άλλο. */}
          {!loading && occ.availableDays > 0 && (
            <span style={{ ...num, fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{fp(occ.pct)}</span>
          )}
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton w={40} h={26} r={12} />
              <Skeleton w={260} h={13} r={6} />
            </div>
          ) : stays.length === 0 ? (
            // Οι κενές οθόνες διδάσκουν. Το πάνελ δεν ζητά να πληκτρολογήσεις
            // δεδομένα που το app μπορεί να φέρει μόνο του — λέει πώς να τα φέρεις.
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, fontFamily: T.font.sans }}>
              Δεν υπάρχουν καταγεγραμμένες κρατήσεις για αυτό το ακίνητο, οπότε δεν υπάρχει πληρότητα να μετρηθεί.
              Με σύνδεση του ημερολογίου Airbnb ή Booking (εισαγωγή iCal) στους «Επισκέπτες», οι κρατήσεις έρχονται
              μόνες τους, με ημερομηνίες και ποσά.
              {onOpenClients && <div style={{ marginTop: 12 }}><Btn variant="secondary" onClick={onOpenClients}>Άνοιγμα «Επισκέπτες»</Btn></div>}
            </div>
          ) : (
            <>
              {/* ═══ Η ΠΡΩΤΗ ΕΡΩΤΗΣΗ: ΠΟΣΟ ΓΕΜΑΤΟ ΗΤΑΝ ═══════════════════════ */}
              {occ.availableDays === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, fontFamily: T.font.sans }}>
                  Οι κρατήσεις του {year} δεν έχουν ημερομηνίες που να ορίζουν περίοδο λειτουργίας, οπότε η πληρότητα
                  δεν μετριέται. Με άφιξη και αναχώρηση σε κάθε διαμονή, εμφανίζεται εδώ.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ ...num, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{fp(occ.rawPct)}</div>
                    {/* Ο ΠΑΡΟΝΟΜΑΣΤΗΣ ΗΤΑΝ ΚΡΥΜΜΕΝΟΣ ΣΕ TOOLTIP. Ενα ποσοστό
                        χωρίς το κλάσμα του δεν ελέγχεται από κανέναν, και σε
                        κινητό το tooltip δεν ανοίγει ποτέ. */}
                    <div style={note}>
                      {occ.bookedNights} {occ.bookedNights === 1 ? 'νύχτα' : 'νύχτες'} σε {occ.availableDays} διαθέσιμες ημέρες
                      {from != null && to != null && `, ${MONTHS_SHORT[from]} έως ${MONTHS_SHORT[to]}`}. Οχι σε 365: το ακίνητο δεν ήταν στην αγορά όλο τον χρόνο.
                    </div>
                  </div>

                  {/* ΤΟ ΣΧΗΜΑ ΤΗΣ ΧΡΟΝΙΑΣ, ΟΧΙ ΔΩΔΕΚΑ ΚΟΥΤΑΚΙΑ ΜΕ ΑΡΙΘΜΟΥΣ. Τα
                      παλιά κουτάκια είχαν περίγραμμα και σταθερό ύψος: ήταν
                      οπτικά πεδία εισόδου, ακριβώς αυτά που η κάρτα κατάργησε. */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginTop: 16, height: 56 }}>
                    {months.map(i => {
                      const n = occ.nightsByMonth[i];
                      const h = peakNights > 0 ? Math.max(3, Math.round((n / peakNights) * 40)) : 3;
                      return (
                        <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <span style={{ ...num, fontSize: 10, color: n > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{n}</span>
                          <div style={{ width: '100%', maxWidth: 34, height: h, borderRadius: 3, background: n > 0 ? 'var(--accent)' : 'var(--border-default)', opacity: n > 0 ? 1 : 0.5 }} />
                          <span style={{ fontFamily: T.font.sans, fontSize: 9, color: 'var(--text-tertiary)' }}>{MONTHS_SHORT[i]}</span>
                        </div>
                      );
                    })}
                  </div>

                  {occ.peak && occ.peak.days < occ.availableDays && (
                    <div style={{ ...note, marginTop: 10 }}>
                      Υψηλή περίοδος {MONTHS_SHORT[occ.peak.fromMonth]} έως {MONTHS_SHORT[occ.peak.toMonth]}: {fp(occ.peak.pct)}, {occ.peak.bookedNights} νύχτες σε {occ.peak.days} ημέρες.
                    </div>
                  )}

                  {/* ΤΟ ΟΡΙΟ ΣΤΟ 100 ΕΚΡΥΒΕ ΠΡΟΒΛΗΜΑ ΔΕΔΟΜΕΝΩΝ ΑΝΤΙ ΝΑ ΤΟ ΠΕΙ. */}
                  {occ.overbooked && (
                    <div style={{ ...note, marginTop: 10, color: 'var(--text-secondary)' }}>
                      Οι καταγεγραμμένες νύχτες ξεπερνούν τις διαθέσιμες ημέρες: κάπου υπάρχουν επικαλυπτόμενες ή
                      διπλοκαταχωρημένες κρατήσεις. Ο έλεγχος γίνεται στους «Επισκέπτες».
                    </div>
                  )}
                </>
              )}

              {/* ═══ Η ΔΕΥΤΕΡΗ ΕΡΩΤΗΣΗ: ΠΟΣΑ ΜΕΝΟΥΝ ══════════════════════════
                  Κάθετη κατάσταση, όχι πλακίδια. Κάθε γραμμή είναι βήμα, και το
                  υπόλοιπο είναι το άθροισμα όσων φαίνονται από πάνω του. */}
              {tax.grossRevenue > 0 && (
                <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={label}>Τι μένει από τη βραχυχρόνια, {year}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
                    {lines.map(l => (
                      <div key={l.key} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, padding: '8px 0' }}>
                        <span style={{ fontFamily: T.font.sans, fontSize: 12.5, color: 'var(--text-secondary)', paddingLeft: l.out ? 14 : 0, minWidth: 0 }}>{l.label}</span>
                        <span style={{ ...num, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {l.out ? '−' : ''}{fe(l.amount)}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, paddingTop: 12, marginTop: 6, borderTop: '1px solid var(--border-default)' }}>
                      <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Μένει καθαρά</span>
                      <span style={{ ...num, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {net < 0 ? '−' : ''}{fe(Math.abs(net))}
                      </span>
                    </div>
                  </div>

                  {/* ΤΟ ΤΕΛΟΣ ΠΟΥ ΠΛΗΡΩΣΑΝ ΟΙ ΕΠΙΣΚΕΠΤΕΣ ΕΙΝΑΙ ΣΥΜΦΡΑΖΟΜΕΝΟ, ΟΧΙ
                      ΑΦΑΙΡΕΣΗ. Οσο καθόταν στη στήλη των αφαιρέσεων, η στήλη δεν
                      έβγαινε· εδώ λέει ό,τι έλεγε, χωρίς να χαλά την πρόσθεση. */}
                  {tax.levy > 0 && (
                    <div style={{ ...note, marginTop: 12 }}>
                      Το τέλος ανθεκτικότητας της χρήσης είναι {fe(tax.levy)} και το εισπράττεις για λογαριασμό του Δημοσίου.
                      {tax.levyShortfall > 0
                        ? ` Από τους επισκέπτες καταγράφηκαν ${fe(tax.collectedLevy)}, οπότε τα υπόλοιπα ${fe(tax.levyShortfall)} τα πληρώνεις εσύ.`
                        : ' Καλύφθηκε ολόκληρο από τους επισκέπτες, άρα δεν είναι δικό σου κόστος.'}
                    </div>
                  )}
                  <div style={{ ...note, marginTop: 6 }}>
                    Ο φόρος υπολογίζεται στα ακαθάριστα με την κλίμακα ενοικίων και την τεκμαρτή έκπτωση 5%. Η προμήθεια
                    της πλατφόρμας φεύγει από την τσέπη αλλά δεν μειώνει το δηλωτέο έσοδο. Ενδεικτικά ποσά, όχι εκκαθάριση.
                  </div>
                </div>
              )}

              {/* ═══ ΕΚΚΡΕΜΟΤΗΤΕΣ ════════════════════════════════════════════
                  Χωρίς σημασιολογικό κόκκινο: η ιεραρχία βγαίνει από τη θέση και
                  το βάρος, όπως παντού αλλού στο προϊόν. */}
              {(counts.unresolved > 0 || counts.undeclared > 0) && (
                <div style={{ marginTop: 18, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {counts.undeclared > 0 && (
                    <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{counts.undeclared} {counts.undeclared === 1 ? 'αδήλωτη διαμονή' : 'αδήλωτες διαμονές'}.</strong>{' '}
                      Η Δήλωση Βραχυχρόνιας Διαμονής υποβάλλεται στο myAADE μία ανά κράτηση, και σημειώνεται στους «Επισκέπτες».
                    </div>
                  )}
                  {counts.unresolved > 0 && (
                    <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{counts.unresolved} από {counts.count} {counts.count === 1 ? 'διαμονή' : 'διαμονές'} χωρίς ανάλυση ποσού.</strong>{' '}
                      Καταγράφηκαν πριν το app ξεχωρίσει τα ακαθάριστα από την καθαρή είσπραξη, οπότε τα παραπάνω ποσά
                      είναι εκτίμηση ως τότε.
                    </div>
                  )}
                </div>
              )}

              {/* ΤΟ ΝΟΜΙΚΟ ΥΠΟΜΝΗΜΑ ΗΤΑΝ ΕΞΙ ΣΕΙΡΕΣ ΜΕ ΠΕΝΤΕ ΕΝΤΟΝΑ, ΚΑΙ ΤΑ ΜΙΣΑ
                  ΤΑ ΕΛΕΓΕ ΗΔΗ Η ΚΑΤΑΣΤΑΣΗ ΑΠΟ ΠΑΝΩ (ότι η προμήθεια είναι δαπάνη,
                  ότι το τέλος ανήκει στο Δημόσιο). Μένει μόνο η υποχρέωση που δεν
                  φαίνεται πουθενά αλλού στην οθόνη: το μητρώο και ο ΑΜΑ. */}
              <div style={{ ...note, marginTop: 16 }}>
                Η νόμιμη βραχυχρόνια μίσθωση απαιτεί εγγραφή στο Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής της ΑΑΔΕ και
                αναγραφή του ΑΜΑ σε κάθε ανάρτηση· ο έλεγχος βρίσκεται στην κορυφή των «Επισκέπτες» και της «Τιμολόγησης».
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
