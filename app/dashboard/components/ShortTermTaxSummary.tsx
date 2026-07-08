'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Φορολογία βραχυχρόνιας μίσθωσης (ενσωματωμένη ενότητα, χωρίς νέο tab).
// Σύνοψη ανά έτος από τα πραγματικά δεδομένα διαμονών: μεικτά έσοδα ανά κανάλι,
// εκτιμώμενος φόρος εισοδήματος (κλίμακα ενοικίων), Τέλος Ανθεκτικότητας (ΤΑΚΚ),
// καθαρά, και τι χρειάζεται το Ε2. Ενδεικτικά, με πηγές και «επιβεβαίωσε με λογιστή».
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, KPIGrid, InfoBanner, SecHdr, ExportButton, fe } from '@/components/Theme';
import { downloadCsv } from './exportCsv';
import { STAY_CHANNEL_LABELS } from '@/lib/clients/clients';
import { RENTAL_TAX_ROWS_2026, climateLevyRates, rentalIncomeTax } from '@/lib/billing/greekTax';
import { shortTermYearSummary, yearsWithStays, type TaxStay } from '@/lib/tax/shortTermTax';
import { stayTotal } from '@/lib/clients/clients';

export default function ShortTermTaxSummary({ propertyId, userId }: { propertyId: string; userId: string }) {
  const supabase = createClient();
  const [stays, setStays] = useState<TaxStay[]>([]);
  const [allStays, setAllStays] = useState<TaxStay[]>([]);
  const [sqm, setSqm] = useState<number | null>(null);
  const [isHouse, setIsHouse] = useState(false);
  const [propCount, setPropCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: all }, { data: prop }, { count }] = await Promise.all([
      supabase.from('client_stays').select('check_in,check_out,nights,nightly_rate,total,channel').eq('user_id', userId).eq('property_id', propertyId),
      supabase.from('client_stays').select('check_in,total,nightly_rate,nights').eq('user_id', userId),
      supabase.from('user_properties').select('sqm,prop_type').eq('id', propertyId).maybeSingle(),
      supabase.from('user_properties').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    const list = (data || []) as TaxStay[];
    setStays(list);
    setAllStays((all || []) as TaxStay[]);
    setSqm(prop?.sqm != null ? Number(prop.sqm) : null);
    setIsHouse(['house', 'villa'].includes(String(prop?.prop_type || '')));
    setPropCount(count || 1);
    const ys = yearsWithStays(list);
    if (ys.length && !ys.includes(year)) setYear(ys[0]);
    setLoading(false);
  }, [userId, propertyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: οι διαμονές (χειροκίνητες + iCal) ενημερώνουν τη φορολογική εικόνα.
  useEffect(() => {
    const ch = supabase.channel('sttax-' + propertyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_stays', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, propertyId, load]);

  const years = useMemo(() => { const ys = yearsWithStays(stays); return ys.length ? ys : [new Date().getFullYear()]; }, [stays]);
  const sum = useMemo(() => shortTermYearSummary(stays, year, { sqm, isHouse, propertyCount: propCount }), [stays, year, sqm, isHouse, propCount]);
  const levyRates = useMemo(() => climateLevyRates(sqm, isHouse), [sqm, isHouse]);
  // Ενοποιημένη εικόνα: ο φόρος εισοδήματος είναι προοδευτικός στο ΣΥΝΟΛΟ των
  // εσόδων σου, όχι ανά ακίνητο. Υπολογίζουμε τα συνολικά μεικτά βραχυχρόνιας.
  const unified = useMemo(() => {
    const totalGross = allStays.filter(s => (s.check_in || '').slice(0, 4) === String(year)).reduce((sum2, s) => sum2 + stayTotal(s), 0);
    return { totalGross, totalTax: rentalIncomeTax(totalGross) };
  }, [allStays, year]);
  const maxCh = useMemo(() => Math.max(1, ...sum.byChannel.map(c => c.revenue)), [sum]);

  const kpis = [
    { label: 'Μεικτά έσοδα', value: fe(sum.grossRevenue, 0), sub: `${sum.stayCount} διαμονές, ${sum.totalNights} νύχτες` },
    { label: 'Εκτ. φόρος εισοδήματος', value: fe(sum.incomeTax, 0), sub: `μέσος συντελεστής ${Math.round(sum.effectiveRate * 100)}%` },
    { label: 'Τέλος Ανθεκτικότητας', value: fe(sum.levy, 0), sub: 'ανά διανυκτέρευση' },
    { label: 'Τέλος παρεπιδημούντων', value: sum.municipalExempt ? '0 €' : fe(sum.municipalTax, 0), sub: sum.municipalExempt ? 'εξαίρεση (δες σημείωση)' : '0,5% επί μεικτών' },
    { label: 'Καθαρά μετά φόρων', value: fe(sum.net, 0), sub: 'μεικτά μείον φόροι και τέλη', tone: 'positive' as const },
  ];

  const exportCsv = () => {
    downloadCsv(`forologia_vraxyxronia_${year}`,
      ['Στοιχείο', 'Ποσό (€)'],
      [
        ['Έτος', String(year)],
        ['Μεικτά έσοδα', String(Math.round(sum.grossRevenue))],
        ['Διανυκτερεύσεις', String(sum.totalNights)],
        ['Διαμονές', String(sum.stayCount)],
        ['Εκτ. φόρος εισοδήματος', String(Math.round(sum.incomeTax))],
        ['Τέλος Ανθεκτικότητας (ΤΑΚΚ)', String(Math.round(sum.levy))],
        ['Τέλος παρεπιδημούντων', String(sum.municipalTax)],
        ['Καθαρά μετά φόρων', String(Math.round(sum.net))],
        ...sum.byChannel.map(c => [`Έσοδα ${STAY_CHANNEL_LABELS[c.channel as keyof typeof STAY_CHANNEL_LABELS] || 'Άλλο'}`, String(Math.round(c.revenue))]),
      ]);
  };

  if (loading) return <div style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>Φόρτωση φορολογικής σύνοψης…</div>;

  return (
    <div style={{ marginTop: 8 }}>
      <SecHdr label="Φορολογία βραχυχρόνιας μίσθωσης"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 20, overflow: 'hidden' }}>
              {years.slice(0, 4).map(y => (
                <button key={y} onClick={() => setYear(y)} style={{ border: 'none', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12, fontWeight: 600, padding: '6px 12px', background: year === y ? 'var(--accent)' : 'transparent', color: year === y ? '#fff' : 'var(--text-secondary)' }}>{y}</button>
              ))}
            </div>
            {sum.stayCount > 0 && <ExportButton onClick={exportCsv} />}
          </div>
        } />

      {sum.stayCount === 0 ? (
        <div style={{ background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 14, padding: '32px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.6 }}>
          Δεν υπάρχουν καταγεγραμμένες διαμονές βραχυχρόνιας μίσθωσης για το {year}. Καταχώρησε διαμονές (χειροκίνητα ή με εισαγωγή iCal) στο Πελατολόγιο για να δεις τη φορολογική σου εικόνα.
        </div>
      ) : (
        <>
          <KPIGrid items={kpis} />

          {/* Έσοδα ανά κανάλι */}
          {sum.byChannel.length > 0 && (
            <div style={{ marginTop: 16, background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 12 }}>Έσοδα ανά κανάλι</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sum.byChannel.map(c => (
                  <div key={c.channel}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{STAY_CHANNEL_LABELS[c.channel as keyof typeof STAY_CHANNEL_LABELS] || 'Άλλο'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.num }}>{fe(c.revenue, 0)}<span style={{ color: 'var(--text-tertiary)', marginLeft: 8 }}>{c.nights} νύχτες · {c.stays} διαμονές</span></span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(2, (c.revenue / maxCh) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Τι χρειάζεται το Ε2 + κλίμακα */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14 }}>
            <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Τι χρειάζεται το Ε2</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <li>Αριθμός Μητρώου Ακινήτου (ΑΜΑ) βραχυχρόνιας διαμονής, ανά ακίνητο.</li>
                <li>Μεικτά έσοδα ανά ακίνητο: <strong style={{ fontFamily: T.font.num }}>{fe(sum.grossRevenue, 0)}</strong> για το {year}.</li>
                <li>Ημέρες μίσθωσης / διανυκτερεύσεις: <strong style={{ fontFamily: T.font.num }}>{sum.totalNights}</strong>.</li>
                <li>Καταμερισμός ανά συνιδιοκτήτη (αν υπάρχει), βάσει ποσοστών.</li>
              </ul>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10 }}>Το πλήρες Ε2 (με εξαγωγή) βρίσκεται στην ενότητα φορολογικών αναφορών.</div>
            </div>
            <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Κλίμακα φόρου εισοδήματος (2026)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {RENTAL_TAX_ROWS_2026.map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span>{r.range}</span><span style={{ fontFamily: T.font.num, fontWeight: 600 }}>{r.rate}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.5 }}>
                Τέλος Ανθεκτικότητας ανά διανυκτέρευση ({isHouse && sqm != null && sqm > 80 ? 'μονοκατοικία άνω των 80 τ.μ.' : 'διαμέρισμα/κατοικία'}, ενδεικτικά 2025): υψηλή περίοδος (Απρ–Οκτ) {levyRates.high} €, χαμηλή (Νοε–Μαρ) {levyRates.low} €. Το υψηλότερο κλιμάκιο (15/4) αφορά μόνο μονοκατοικίες άνω των 80 τ.μ. Τα ακριβή ποσά και οι μήνες ορίζονται από την ΑΑΔΕ.
                <br />Τέλος παρεπιδημούντων 0,5% επί των μεικτών. {sum.municipalExempt ? 'Το ακίνητό σου εξαιρείται (μονοκατοικία ή έως 80 τ.μ., φυσικό πρόσωπο με έως 2 ακίνητα), άρα 0 €.' : 'Δεν πληροίς την εξαίρεση, οπότε εφαρμόζεται.'}
              </div>
            </div>
          </div>

          {propCount > 1 && unified.totalGross > 0 && (
            <div style={{ marginTop: 16, background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Ενοποιημένη εικόνα ({propCount} ακίνητα)</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Ο φόρος εισοδήματος είναι προοδευτικός στο <strong>σύνολο</strong> των εσόδων σου. Στο σύνολο των ακινήτων σου, τα μεικτά βραχυχρόνιας για το {year} είναι <strong style={{ fontFamily: T.font.num }}>{fe(unified.totalGross, 0)}</strong> και ο εκτιμώμενος φόρος εισοδήματος <strong style={{ fontFamily: T.font.num }}>{fe(unified.totalTax, 0)}</strong>. Η ανά-ακίνητο εκτίμηση παραπάνω είναι ενδεικτική κατανομή.
              </div>
            </div>
          )}

          <InfoBanner tone="warning">
            Ενδεικτική εκτίμηση. Ο φόρος εισοδήματος υπολογίζεται προοδευτικά επί του <strong>συνολικού</strong> εισοδήματός σου από ακίνητα (εδώ εμφανίζεται επί των μεικτών αυτού του ακινήτου, πριν τυχόν εκπτώσεις δαπανών). Με 3 ή περισσότερα ακίνητα βραχυχρόνιας ενδέχεται να θεωρηθεί επιχειρηματική δραστηριότητα (ΦΠΑ, διαφορετική μεταχείριση). Πηγές: ΑΑΔΕ, ν.5073/2023. Επιβεβαίωσε πάντα με τον λογιστή σου.
          </InfoBanner>
        </>
      )}
    </div>
  );
}
