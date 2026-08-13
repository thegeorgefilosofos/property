'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΠΛΗΡΟΤΗΤΑ & ΒΡΑΧΥΧΡΟΝΙΑ — από τα πραγματικά δεδομένα, όχι από πληκτρολόγηση.
//
// ΤΙ ΕΦΥΓΕ ΑΠΟ ΕΔΩ, ΚΑΙ ΓΙΑΤΙ
//
// 1. Ο ΤΡΙΤΟΣ ΑΝΕΞΑΡΤΗΤΟΣ ΔΙΑΚΟΠΤΗΣ «Βραχυχρόνια μίσθωση». Το `readStatus`
//    (lib/property/status.ts) ήδη ήξερε ότι το ακίνητο είναι `rent_short` — ο
//    διακόπτης ήταν τέταρτη πηγή αλήθειας που μπορούσε να διαφωνήσει με τις
//    άλλες τρεις. Τώρα το πάνελ ΡΩΤΑΕΙ το readStatus.
//
// 2. Ο ΑΜΑ ΩΣ ΕΛΕΥΘΕΡΟ ΚΕΙΜΕΝΟ σε `bills_settings`, μέσα σε κλειστό accordion,
//    πίσω από εκείνον τον διακόπτη. Ήταν το πιο ακριβό λάθος του προϊόντος:
//    12.145 καταχωρήσεις στάλθηκαν για απενεργοποίηση το 2025 λόγω ΑΜΑ που
//    έλειπε ή ήταν άκυρος. Ο ΑΜΑ είναι πλέον πεδίο ΤΟΥ ΑΚΙΝΗΤΟΥ και ζητείται
//    αυτόματα, στην κορυφή των «Επισκέπτες» και «Τιμολόγηση» (AmaStrip).
//
// 3. ΔΩΔΕΚΑ ΠΕΔΙΑ ΧΕΙΡΟΚΙΝΗΤΗΣ ΚΑΤΑΧΩΡΗΣΗΣ «νύχτες ανά μήνα», τη στιγμή που το
//    `client_stays` έχει ΚΑΘΕ κράτηση με ημερομηνίες — από iCal ή από email.
//    Ο χρήστης πληκτρολογούσε δεδομένα που το app ήδη είχε, και τα δύο σύνολα
//    μπορούσαν να διαφωνήσουν.
//
// 4. ΤΡΕΙΣ ΕΠΙΝΟΗΜΕΝΕΣ ΠΡΟΕΠΙΛΟΓΕΣ: προμήθεια «15%», καθαρισμός «40 €», μέσες
//    νύχτες ανά κράτηση «3». Καμία πηγή, καμία σχέση με το συγκεκριμένο ακίνητο,
//    και τροφοδοτούσαν «Καθαρά έσοδα» που ο χρήστης διάβαζε ως μέτρηση. Η
//    προμήθεια πλέον έρχεται από τις ΚΑΤΑΓΕΓΡΑΜΜΕΝΕΣ διαμονές ή δεν εμφανίζεται.
//
// 5. Η ΠΛΗΡΟΤΗΤΑ ΔΙΑ 365. Το εποχιακό εξοχικό έβγαινε στο «16%». Παρονομαστής
//    είναι πλέον οι διαθέσιμες ημέρες (lib/clients/reports.ts, yearOccupancy).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as stayStore from '@/lib/data/stays';
import { T, fe, Skeleton, Btn, pressable } from '@/components/Theme';
import { readStatus, type StatusRow } from '@/lib/property/status';
import { yearOccupancy, totals, type ReportStay } from '@/lib/clients/reports';
import { shortTermYearSummary } from '@/lib/tax/shortTermTax';
import { rentalIncomeTax, rentalBracketsForYear } from '@/lib/billing/greekTax';
import { MONTHS_SHORT } from '@/lib/core/months';


interface StayRow extends ReportStay { declared_at?: string | null }
interface PropInfo extends StatusRow { prop_type?: string | null; sqm?: number | null }

export default function OccupancyPanel({ propertyId, userId, longTermMonthly, onOpenClients }: {
  propertyId: string; userId: string; longTermMonthly: number; onOpenClients?: () => void;
}) {
  const supabase = createClient();
  const [prop, setProp] = useState<PropInfo | null>(null);
  const [stays, setStays] = useState<StayRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        properties.one(supabase, propertyId, 'status_detail,rental_mode,prop_type,sqm'),
        stayStore.ofProperty<StayRow>(supabase, propertyId, stayStore.ACCOUNTING_COLUMNS, userId),
      ]);
      setProp((p || null) as PropInfo | null);
      setStays(s);
    } finally { setLoading(false); }
  }, [propertyId, userId]);
  useEffect(() => { load(); }, [load]);

  // Η ΚΑΤΑΣΤΑΣΗ ΑΠΟΦΑΣΙΖΕΙ, ΟΧΙ ΔΙΑΚΟΠΤΗΣ. Ίδια πηγή με τις καρτέλες.
  const isShort = readStatus(prop) === 'rent_short';
  if (!loading && !isShort) return null;

  const occ = yearOccupancy(stays, year);
  const tot = totals(stays.filter(s => (s.check_in || '').slice(0, 4) === String(year)));
  const isHouse = ['house', 'villa'].includes(String(prop?.prop_type || '').toLowerCase());
  const tax = shortTermYearSummary(stays, year, { sqm: prop?.sqm ?? null, isHouse });
  const ltRevenue = longTermMonthly * 12;

  // ΤΟ «ΚΑΘΑΡΑ» ΔΕΝ ΕΒΓΑΖΕ ΤΙΣ ΠΡΟΜΗΘΕΙΕΣ. Δύο πλακίδια πιο πάνω η ίδια οθόνη
  // έδειχνε «Προμήθειες πλατφορμών − X», και μετά έλεγε «Μένει καθαρά» ένα ποσό
  // που τις είχε ακόμη μέσα: ο ιδιοκτήτης διάβαζε ως υπόλοιπο τσέπης κάτι
  // μεγαλύτερο από αυτό που θα δει στον λογαριασμό του, ακριβώς κατά την
  // προμήθεια. Η προμήθεια δεν μειώνει το ΔΗΛΩΤΕΟ έσοδο (γι' αυτό μένει έξω από
  // το `tax.net` και από το Ε2) — φεύγει όμως πραγματικά, και δεν εκπίπτει
  // παραπάνω: στο εισόδημα από ακίνητα η μόνη έκπτωση είναι η τεκμαρτή 5%.
  const stNet = tax.net - tot.platformFees;

  // ΣΥΓΚΡΙΝΟΝΤΑΝ ΑΝΟΜΟΙΑ ΜΕΓΕΘΗ. Η «Διαφορά vs μακροχρόνια» αφαιρούσε το
  // ΑΚΑΘΑΡΙΣΤΟ ετήσιο ενοίκιο (προ φόρου) από το ΚΑΘΑΡΟ της βραχυχρόνιας (μετά
  // φόρου) και έβαφε το αποτέλεσμα πράσινο ή κόκκινο σαν ετυμηγορία. Ο φόρος της
  // μακροχρόνιας δεν αφαιρούνταν ποτέ, οπότε η μακροχρόνια έβγαινε συστηματικά
  // πιο κερδοφόρα απ' ό,τι είναι — σε ένα ενοίκιο 800 €/μήνα η φαινομενική
  // διαφορά ήταν ~1.400 € υπέρ της μακροχρόνιας που δεν υπήρχε. Πάνω σε αυτό το
  // νούμερο ο ιδιοκτήτης αποφασίζει αν θα βγάλει το ακίνητο από το Airbnb.
  // Τώρα και τα δύο σκέλη περνούν από την ΙΔΙΑ κλίμακα (rentalIncomeTax) με την
  // ίδια τεκμαρτή έκπτωση 5% (άρθρο 39 παρ.4 ΚΦΕ) και συγκρίνονται μετά φόρου.
  // …και με την κλίμακα ΤΟΥ ΙΔΙΟΥ ΕΤΟΥΣ: το βραχυχρόνιο σκέλος περνά από το
  // `shortTermYearSummary(stays, year)`, οπότε αν εδώ έμενε η προεπιλογή, η
  // σύγκριση των δύο θα ήταν πάλι ανόμοια — απλώς λιγότερο ορατά.
  const ltTax = rentalIncomeTax(ltRevenue * 0.95, rentalBracketsForYear(year));
  const ltNet = ltRevenue - ltTax;
  const diff = stNet - ltNet;

  const kpi = (label: string, value: string, tone = 'var(--text-primary)', title?: string) => (
    <div title={title} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tone, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} {...pressable(() => setOpen(o => !o))}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}><span title="Ποσοστό κρατημένων νυχτών προς τις διαθέσιμες (occupancy)">Πληρότητα</span> & Βραχυχρόνια</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Από τις καταγεγραμμένες κρατήσεις σου, όχι από πληκτρολόγηση</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!loading && occ.availableDays > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono }}>{occ.pct}%</span>}
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
            // Οι κενές οθόνες διδάσκουν. Το πάνελ δεν ζητά πλέον να πληκτρολογήσεις
            // δεδομένα που το app μπορεί να φέρει μόνο του — λέει πώς να τα φέρεις.
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Δεν υπάρχουν καταγεγραμμένες κρατήσεις για αυτό το ακίνητο, οπότε δεν υπάρχει πληρότητα να μετρηθεί.
              Σύνδεσε το ημερολόγιο Airbnb ή Booking (εισαγωγή iCal) στους «Επισκέπτες» και οι κρατήσεις θα έρχονται μόνες τους,
              με ημερομηνίες και ποσά.
              {onOpenClients && <div style={{ marginTop: 12 }}><Btn variant="secondary" onClick={onOpenClients}>Άνοιγμα «Επισκέπτες»</Btn></div>}
            </div>
          ) : (
            <>
              {/* Νύχτες ανά μήνα — ΑΠΟ ΤΙΣ ΚΡΑΤΗΣΕΙΣ, χωρίς κανένα πεδίο εισόδου. */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Νύχτες με κράτηση ανά μήνα ({year})</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                  Σύνολο <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{occ.bookedNights}</strong> / {occ.availableDays} διαθέσιμες ημέρες
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 6, marginBottom: 18 }}>
                {MONTHS_SHORT.map((m, i) => {
                  const n = occ.nightsByMonth[i];
                  const inWindow = occ.openFromMonth != null && i >= occ.openFromMonth && i <= (occ.openToMonth ?? 11);
                  return (
                    <div key={m} style={{ textAlign: 'center', minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: n > 0 ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 4 }}>{m}</div>
                      <div style={{
                        background: 'var(--bg-surface)', border: `1px solid ${n > 0 ? 'var(--accent-border)' : 'var(--border-default)'}`,
                        borderRadius: 6, padding: '9px 2px', fontSize: 13, fontWeight: 600,
                        color: n > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        fontFamily: T.font.mono, opacity: inWindow || n > 0 ? 1 : 0.45,
                      }}>{n}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 148px), 1fr))', gap: 10, marginBottom: 14 }}>
                {kpi('Πληρότητα', `${occ.pct}%`, 'var(--accent)',
                  occ.openFromMonth != null ? `${occ.bookedNights} νύχτες σε ${occ.availableDays} διαθέσιμες ημέρες (${MONTHS_SHORT[occ.openFromMonth]}–${MONTHS_SHORT[occ.openToMonth!]}). Όχι σε 365: το ακίνητο δεν ήταν στην αγορά όλο τον χρόνο.` : undefined)}
                {occ.peak && kpi('Υψηλή περίοδος', `${occ.peak.pct}%`, 'var(--text-primary)',
                  `${MONTHS_SHORT[occ.peak.fromMonth]}–${MONTHS_SHORT[occ.peak.toMonth]}: ${occ.peak.bookedNights} νύχτες σε ${occ.peak.days} ημέρες. Η περίοδος βγαίνει από τα δικά σου δεδομένα.`)}
                {kpi('Νύχτες / έτος', String(occ.bookedNights))}
                {kpi('Δηλωτέα ακαθάριστα', fe(tot.revenue), 'var(--text-primary)', 'Τι πλήρωσαν οι επισκέπτες μείον το τέλος ανθεκτικότητας. Η προμήθεια ΔΕΝ αφαιρείται· είναι δαπάνη.')}
                {/* ΤΟ ΤΕΛΟΣ ΠΟΥ ΟΦΕΙΛΕΤΑΙ ΕΜΦΑΝΙΖΕΤΑΙ ΠΑΝΤΑ, ΚΙ ΑΣ ΜΗΝ ΕΙΣΠΡΑΧΘΗΚΕ.
                    Το πλακίδιο έδειχνε μόνο το ΕΙΣΠΡΑΓΜΕΝΟ (`tot.climateLevy`) και
                    εξαφανιζόταν στο μηδέν. Ο οικοδεσπότης που δεν χρέωσε το ΤΑΚΚ
                    στους επισκέπτες —η πιο συνηθισμένη περίπτωση στα ιστορικά
                    δεδομένα— δεν το έβλεπε πουθενά, ενώ το οφείλει στην ΑΑΔΕ και
                    το πληρώνει ο ίδιος. Τώρα φαίνεται το οφειλόμενο, με το
                    ακάλυπτο μέρος ονομασμένο. */}
                {tax.levy > 0 && kpi('Τέλος ανθεκτικότητας', `− ${fe(tax.levy)}`,
                  tax.levyShortfall > 0 ? 'var(--warning)' : 'var(--text-secondary)',
                  tax.levyShortfall > 0
                    ? `Οφείλεται ${fe(tax.levy)} στην ΑΑΔΕ για ${occ.bookedNights} νύχτες. Καταγράφηκε είσπραξη ${fe(tot.climateLevy)} από επισκέπτες, άρα ${fe(tax.levyShortfall)} το πληρώνεις εσύ και αφαιρείται από τα καθαρά. Συμπλήρωσε το τέλος ανά κράτηση στους «Επισκέπτες» αν το χρέωσες.`
                    : `Οφείλεται ${fe(tax.levy)} και εισπράχθηκε ολόκληρο από τους επισκέπτες για λογαριασμό του κράτους. Δεν είναι έσοδό σου, ούτε δικό σου κόστος.`)}
                {tot.platformFees > 0 && kpi('Προμήθειες πλατφορμών', `− ${fe(tot.platformFees)}`, 'var(--text-secondary)', 'Δαπάνη που εκπίπτει.')}
                {kpi('Εκτιμώμενος φόρος', `− ${fe(tax.incomeTax)}`, 'var(--text-secondary)', 'Κλίμακα εισοδήματος από ακίνητα, επί του 95% των ακαθαρίστων (τεκμαρτή έκπτωση 5%). Ενδεικτικό· επιβεβαίωσε με τον λογιστή.')}
                {kpi('Μένει καθαρά', fe(stNet), 'var(--text-primary)',
                  `${fe(tax.grossRevenue)} ακαθάριστα − ${fe(tax.incomeTax)} φόρος${tax.municipalTax > 0 ? ` − ${fe(tax.municipalTax)} τέλος παρεπιδημούντων` : ''}${tax.levyShortfall > 0 ? ` − ${fe(tax.levyShortfall)} ακάλυπτο τέλος ανθεκτικότητας` : ''}${tot.platformFees > 0 ? ` − ${fe(tot.platformFees)} προμήθειες πλατφορμών` : ''}. Η προμήθεια δεν μειώνει το δηλωτέο έσοδο, φεύγει όμως από την τσέπη σου.${tot.platformFees > 0 ? '' : ' Δεν υπάρχει καταγεγραμμένη προμήθεια σε αυτές τις κρατήσεις· αν υπήρξε, το πραγματικό υπόλοιπο είναι μικρότερο.'}`)}
                {longTermMonthly > 0 && kpi('Διαφορά vs μακροχρόνια (μετά φόρου)', `${diff >= 0 ? '+' : '−'} ${fe(Math.abs(diff))}`, 'var(--text-primary)',
                  `Και τα δύο μετά φόρου, ώστε να συγκρίνονται: βραχυχρόνια ${fe(stNet)} έναντι ${fe(ltNet)} από μακροχρόνια (${fe(ltRevenue)} ενοίκιο − ${fe(ltTax)} φόρος). Ίδια κλίμακα και στα δύο, με τεκμαρτή έκπτωση 5%. Ο φόρος υπολογίζεται μόνο για αυτό το ακίνητο· με περισσότερα ακίνητα η κλίμακα ανεβαίνει και στις δύο πλευρές. Ενδεικτικό· επιβεβαίωσε με τον λογιστή.`)}
              </div>

              {tot.unresolved > 0 && (
                <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {tot.unresolved} από τις {tot.count} διαμονές του {year} έχουν <strong>απροσδιόριστο ποσό</strong>: καταγράφηκαν πριν το app ξεχωρίσει τα ακαθάριστα από το payout. Τα παραπάνω ποσά είναι εκτίμηση όσο δεν συμπληρωθεί «τι πλήρωσε ο επισκέπτης» στους «Επισκέπτες».
                </div>
              )}
              {tot.undeclared > 0 && (
                <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--negative)' }}>{tot.undeclared} αδήλωτες διαμονές.</strong> Η Δήλωση Βραχυχρόνιας Διαμονής υποβάλλεται στο myAADE <strong>μία ανά κράτηση</strong>. Σημείωσέ τες στους «Επισκέπτες» καθώς τις υποβάλλεις.
                </div>
              )}

              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-strong)', marginTop: 6, flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>
                  Για νόμιμη βραχυχρόνια μίσθωση απαιτείται εγγραφή στο <strong>Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής</strong> της <span title="Ανεξάρτητη Αρχή Δημοσίων Εσόδων">ΑΑΔΕ</span> και αναγραφή του <strong title="Αριθμός μητρώου ακινήτου (βραχυχρόνια μίσθωση)">ΑΜΑ</strong> σε κάθε ανάρτηση (Airbnb/Booking)· ο έλεγχος βρίσκεται στην κορυφή των «Επισκέπτες» και της «Τιμολόγησης». Τα έσοδα δηλώνονται στο <span title="Έντυπο δήλωσης εισοδήματος από ακίνητα (ενοίκια)">Ε2</span> <strong>ακαθάριστα</strong>: η προμήθεια της πλατφόρμας είναι δαπάνη, όχι μείωση εσόδου. Το <strong>Τέλος Ανθεκτικότητας στην Κλιματική Κρίση</strong> δεν είναι έσοδό σου: το εισπράττεις από τον επισκέπτη και το αποδίδεις. Δεν είναι ενιαίο: εξαρτάται από τον τύπο του ακινήτου και την περίοδο. Τα ακριβή ποσά ορίζονται από την ΑΑΔΕ, επιβεβαίωσέ τα εκεί ή με τον λογιστή σου.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
