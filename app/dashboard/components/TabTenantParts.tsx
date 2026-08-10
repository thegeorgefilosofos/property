'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Ο ΕΝΟΙΚΙΑΣΤΗΣ: ΤΑ ΜΙΚΡΑ ΚΟΜΜΑΤΙΑ ΠΟΥ ΞΑΝΑΧΡΗΣΙΜΟΠΟΙΟΥΝΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// Κεφαλίδα ενότητας, πλακίδιο, σήμα κατάστασης, γραμμή στοιχείου, μπάρα
// ειδοποίησης, οι μπάρες πληρωμών. Καθένα τους εμφανίζεται σε τρεις ως έξι από
// τις οθόνες της καρτέλας. Χωρίς δικό τους αρχείο, το «άλλαξε το πλακίδιο»
// σήμαινε άνοιγμα ενός αρχείου τριών χιλιάδων γραμμών.
// ═══════════════════════════════════════════════════════════════════════════
import React from 'react';
import { T, EmptyState, fn } from '@/components/Theme';
import { BarChart3 } from 'lucide-react';
import { daysLeft } from './TabTenantHelpers';
import { MONTHS_SHORT } from '@/lib/core/months';
import { fieldDecision, type FieldContext, type FieldDecision } from '@/lib/property/fields';
import type { RentPayment, Tenant } from './TabTenantTypes';

// ─── Micro components ─────────────────────────────────────────────────────────
// Κεφαλίδα ενότητας: ίδια οπτική με το κοινό SecHdr (χωρίς διακοσμητική τελεία),
// για ομοιομορφία με όλο το app.
// Πλαίσιο πληροφορίας με έγχρωμη κουκκίδα. ΣΕ MODULE SCOPE, δίπλα στο
// SectionTitle: ήταν ορισμένο μέσα στο component, οπότε τα έξι πλαίσια
// υποχρεώσεων ξαναγεννιούνταν σε κάθε render της καρτέλας ενοικιαστή.
export const InfoBlock = ({ title, children, tone }: { title: string; children: React.ReactNode; tone?: string }) => (
  <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border-subtle)' }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
      <div style={{ width:5, height:5, borderRadius:'50%', background:tone||'var(--accent)' }}/>
      <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{title}</span>
    </div>
    <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.7, paddingLeft:13 }}>{children}</div>
  </div>
);

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      <span style={{ fontSize:'10px', letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, fontWeight:700 }}>{children}</span>
    </div>
  );
}

// ΤΙ ΕΦΥΓΕ: το `SvcSection` (πέντε πτυσσόμενες ενότητες υπηρεσιών) και το
// `SplitBar` (συρόμενη κατανομή κόστους 0–100 ανά μηχάνημα). Υπήρχαν για να
// στεγάσουν 15 πεδία συντηρήσεων και 9 μετρητών· με ελεύθερες γραμμές δεν
// χρειάζονται. Το «ποιος πληρώνει» είναι πλέον τρεις επιλογές, όχι δρομέας.

export function KpiCard({ label, value, color='var(--text-primary)', sub }: { label:string; value:string; color?:string; sub?:string }) {
  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'16px 14px', display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ fontSize:'18px', fontWeight:700, color, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.5px', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:'10px', color:'var(--text-secondary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{sub}</div>}
      <div style={{ fontSize:'9px', letterSpacing:'0.12em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{label}</div>
    </div>
  );
}

export function StatusBadge({ label, color, bg }: { label:string; color:string; bg:string }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:T.radius.badge, fontSize:'10px', letterSpacing:'0.08em', textTransform:'uppercase' as const, color, background:bg, border:`1px solid color-mix(in srgb, ${color} 20%, transparent)`, fontFamily:T.font.sans, fontWeight:600 }}>
      {label}
    </span>
  );
}

export function DataRow({ label, value, mono=false }: { label:string; value:React.ReactNode; mono?:boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border-subtle)' }}>
      <span style={{ fontSize:'12px', color:'var(--text-secondary)', fontFamily:T.font.sans }}>{label}</span>
      <span style={{ fontSize:'12px', color:'var(--text-primary)', fontFamily:mono?T.font.mono:T.font.sans, fontVariantNumeric:(mono?'tabular-nums':'normal') as 'tabular-nums'|'normal', fontWeight:mono?600:400, textAlign:'right' as const, maxWidth:'55%' }}>{value}</span>
    </div>
  );
}

export function AlertBar({ text, level='warning' }: { text:string; level?:'critical'|'warning'|'info' }) {
  const color = level==='critical' ? 'var(--negative)' : level==='warning' ? 'var(--warning)' : 'var(--accent)';
  const bg    = level==='critical' ? 'var(--negative-dim)' : level==='warning' ? 'var(--warning-dim)' : 'var(--accent-dim)';
  return (
    <div style={{ background:bg, border:`1px solid color-mix(in srgb, ${color} 26%, transparent)`, borderLeft:`3px solid ${color}`, borderRadius:T.radius.inner, padding:'10px 16px', marginBottom:8, fontSize:'12px', color, fontFamily:T.font.sans, fontWeight:500, lineHeight:1.5 }}>
      {text}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ «ΣΚΟΡ ΕΝΟΙΚΙΑΣΤΗ» ΕΦΥΓΕ, ΚΑΙ Η ΕΤΙΚΕΤΑ ΜΑΖΙ ΤΟΥ
//
// Ήταν: 100 − απλήρωτες×8 − καθυστερήσεις×4 − min(μέση×0,5 · 15) + προφίλ×10,
// με κατώφλια 85/70/50 και ετικέτες «Άριστος / Καλός / Μέτριος / Προβληματικός».
// Δύο ανεξάρτητα λάθη:
//   1. Το `profilePts` μέτραγε πόσα από email/τηλέφωνο/ΑΦΜ/IBAN/ταυτότητα είχε
//      πληκτρολογήσει Ο ΕΚΜΙΣΘΩΤΗΣ. Ο ενοικιαστής περνούσε από «Μέτριος» σε
//      «Καλός» επειδή ο ιδιοκτήτης βρήκε ένα IBAN. Ο άνθρωπος που αξιολογείται
//      δεν είχε καμία σχέση με τη μεταβολή της αξιολόγησής του.
//   2. Τα βάρη και τα κατώφλια δεν προέρχονταν από πουθενά, και το αποτέλεσμα
//      ήταν ένας χαρακτηρισμός πάνω σε όνομα ανθρώπου.
// Μένουν τα γεγονότα: πόσες δόσεις πληρώθηκαν, πόσες λείπουν, μέση καθυστέρηση.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Οι ειδοποιήσεις που ΠΡΟΚΥΠΤΟΥΝ ΑΠΟ ΗΜΕΡΟΛΟΓΙΟ Ή ΑΠΟ ΑΠΛΗΡΩΤΕΣ ΔΟΣΕΙΣ.
 *
 * Έφυγαν τα «πρότυπα»: το παλιό «Πρότυπο καλοκαιριού» ενεργοποιούνταν με ΔΥΟ
 * καθυστερήσεις. Δύο σημεία δεν είναι πρότυπο, και το app το παρουσίαζε ως
 * πρόβλεψη. Ό,τι μένει είναι μετρήσιμο σήμερα: μια ημερομηνία και ένα πλήθος.
 */
export function leaseAlerts(payments:RentPayment[], tenant:Tenant|null):{text:string;level:'critical'|'warning'|'info'}[] {
  if (!tenant) return [];
  const alerts:{text:string;level:'critical'|'warning'|'info'}[]=[];
  const d=daysLeft(tenant.lease_end);
  if(d!==null){
    if(d<0) alerts.push({text:'Το μισθωτήριο έχει λήξει, ανανέωσε ή ξεκίνα διαδικασία αποχώρησης',level:'critical'});
    else if(d<=30) alerts.push({text:`Κρίσιμο: Λήξη μισθωτηρίου σε ${d} ημέρες, απαιτείται άμεση ενέργεια`,level:'critical'});
    else if(d<=60) alerts.push({text:`Λήξη μισθωτηρίου σε ${d} ημέρες, ξεκίνα διαπραγματεύσεις ανανέωσης`,level:'warning'});
    else if(d<=90) alerts.push({text:`Λήξη μισθωτηρίου σε ${d} ημέρες`,level:'info'});
  }
  const unpaid=payments.filter(p=>!p.paid);
  if(unpaid.length>=2) alerts.push({text:`${unpaid.length} εκκρεμείς πληρωμές, απαιτείται άμεση ενέργεια`,level:'critical'});
  return alerts;
}

// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΙΑ ΠΕΔΙΑ ΒΛΕΠΕΙ ΑΥΤΟΣ Ο ΧΡΗΣΤΗΣ — μία πηγή: lib/property/fields.ts
//
// Η καρτέλα Ενοικιαστής υπάρχει ΜΟΝΟ σε μακροχρόνια μίσθωση (visibility.ts:
// `tenant: ['rent_long']`), οπότε η κατάσταση είναι σταθερή. Ό,τι αλλάζει μέσα
// στη φόρμα είναι η ΕΠΙΛΟΓΗ του χρήστη για την επίπλωση: γυμνό διαμέρισμα δεν
// έχει παρεχόμενες υπηρεσίες, άρα δεν έχει και τα πεδία τους.
// ═══════════════════════════════════════════════════════════════════════════

export const tenantFieldCtx = (furnished:boolean, propertyCount:number):FieldContext => ({
  status:'rent_long', business:false, doubleEntry:false, propertyCount, furnished,
});

/** Το «γιατί το ζητάμε» του μητρώου, κάτω από το πεδίο. Χωρίς αυτό δεν συμπληρώνεται. */
export function Why({ id }:{ id:string }) {
  const why=fieldDecision(id, tenantFieldCtx(true,1)).why;
  if(!why) return null;
  return <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.5, marginTop:6 }}>{why}</div>;
}

/** Γραμμή συμμόρφωσης: τι λείπει για να κλείσει η δήλωση, με το γιατί. */
export function MissingCriticalBar({ missing }:{ missing:FieldDecision[] }) {
  if(!missing.length) return null;
  return (
    <div style={{ background:'var(--warning-dim)', border:'1px solid color-mix(in srgb, var(--warning) 26%, transparent)', borderLeft:'3px solid var(--warning)', borderRadius:T.radius.inner, padding:'12px 16px', marginBottom:16 }}>
      <div style={{ fontSize:12, fontWeight:600, color:'var(--warning)', fontFamily:T.font.sans, marginBottom:8 }}>
        Λείπουν {fn(missing.length)} στοιχεία που χρειάζεται η δήλωση
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        {missing.map(m=>(
          <div key={m.id} style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.55 }}>
            <strong style={{ color:'var(--text-primary)' }}>{m.label}</strong> — {m.why}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ποια κρίσιμα πεδία είναι όντως συμπληρωμένα, για τον ίδιο ενοικιαστή. */
export const filledTenantIds = (t:{full_name?:string|null;afm?:string|null;lease_category?:string|null;lease_start?:string|null;monthly_rent?:number|null;rent_iban?:string|null}):Set<string> => {
  const set=new Set<string>();
  if(t.full_name) set.add('tenant.full_name');
  if(t.afm) set.add('tenant.afm');
  if(t.lease_category) set.add('tenant.lease_category');
  if(t.lease_start) set.add('tenant.lease_start');
  if(t.monthly_rent) set.add('tenant.rent');
  if(t.rent_iban) set.add('tenant.rent_iban');
  return set;
};

// ─── Payment Bar Chart ────────────────────────────────────────────────────────
export function PaymentBars({ payments }:{payments:RentPayment[]}) {
  if(!payments.length) return (
    <EmptyState icon={<BarChart3 size={20}/>} title="Καμία πληρωμή ακόμη" hint="Μόλις καταγραφεί η πρώτη είσπραξη, το γράφημα 12 μηνών γεμίζει αυτόματα." />
  );
  const last12=[...payments].sort((a,b)=>b.period_year-a.period_year||b.period_month-a.period_month).slice(0,12).reverse();
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:72, marginBottom:6 }}>
        {last12.map((p)=>{
          const late=p.days_late||0;
          const color=!p.paid?'var(--negative)':late>14?'var(--warning)':late>0?'var(--info)':'var(--positive)';
          return (
            <div key={p.id} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}
              title={`${MONTHS_SHORT[p.period_month-1]} ${p.period_year}: ${p.paid?'Εξοφλήθη':'Εκκρεμεί'}${late>0?` (${late} ημ. καθυστέρηση)`:''}`}>
              <div style={{ width:'100%', height:p.paid?72:36, background:color, borderRadius:'3px 3px 0 0', opacity:0.8, transition:'height 0.4s ease' }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:5 }}>
        {last12.map((p,i)=>(
          <div key={i} style={{ flex:1, fontSize:9, color:'var(--text-tertiary)', textAlign:'center' as const, fontFamily:T.font.sans }}>
            {MONTHS_SHORT[p.period_month-1]}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexWrap:'wrap' as const, gap:'10px 16px', marginTop:12 }}>
        {[['var(--positive)','Εμπρόθεσμη'],['var(--info)','Μικρή καθυστέρηση'],['var(--warning)','Μεγάλη καθυστέρηση'],['var(--negative)','Εκκρεμεί']].map(([c,l])=>(
          <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:8, height:8, borderRadius:3, background:c, flexShrink:0 }}/>
            <span style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard View ────────────────────────────────────────────────────────────
