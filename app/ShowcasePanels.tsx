'use client';

import BrandMark from '@/components/BrandMark';
import { T } from '@/components/Theme';
import { navLabel } from '@/lib/nav/labels';
// ═══════════════════════════════════════════════════════════════════════════
// Τα τρία «πάνελ προϊόντος» (Σάρωση · Πίνακας · Βοηθός), ΜΙΑ πηγή αλήθειας
// για το showcase του hero ΚΑΙ το scrollytelling «Πώς δουλεύει». Μαζί τους
// το PanelFX: τα keyframes και οι ζωντανές αντιδράσεις που χρειάζονται τα
// πάνελ όπου κι αν εμφανίζονται. Καμία εικόνα, μόνο κώδικας.
// ═══════════════════════════════════════════════════════════════════════════

// Κινήσεις των πάνελ: γραμμή σάρωσης, εμφάνιση chips/μηνυμάτων, κυματισμός
// φωνής, ανάπτυξη ράβδων, και οι ζωντανές αντιδράσεις στο πέρασμα του κέρσορα.
export const PanelFX = () => (
  <style>{`
    /* ═══ Η ΓΡΑΜΜΗ ΣΑΡΩΣΗΣ ΚΙΝΕΙΤΑΙ ΜΕ transform, ΟΧΙ ΜΕ top ═══════════════════
       ΤΟ «top» ΕΙΝΑΙ ΙΔΙΟΤΗΤΑ ΔΙΑΤΑΞΗΣ. Κινούμενο κάθε 2,6 δευτερόλεπτα, επ'
       άπειρον, ανάγκαζε τον περιηγητή σε αδιάκοπη ροή layout shifts: μετρήθηκαν
       πάνω από 45 διαδοχικές μετατοπίσεις από το 1,6ο ώς το 7,8ο δευτερόλεπτο,
       και το CLS δεν σταματούσε ποτέ να μεγαλώνει. Το ίδιο οπτικό αποτέλεσμα με
       «transform: translateY()» μένει στον compositor: μηδέν διάταξη, μηδέν
       βάψιμο, μηδέν μετατόπιση. */
    /* Η ΔΙΑΔΡΟΜΗ ΒΓΑΙΝΕΙ ΑΠΟ ΤΟΝ ΓΟΝΕΑ. Το «translateY» σε ποσοστό μετριέται
       πάνω στο ΙΔΙΟ το στοιχείο, που εδώ έχει ύψος 2 pixel: θα έκανε ένα βήμα
       δύο εικονοστοιχείων. Το container query δίνει το ύψος του πάνελ, οπότε η
       γραμμή διανύει το 86% του, όσο και πριν με το «top». */
    /* ═══ Η ΣΑΡΩΣΗ ΚΙΝΕΙΤΑΙ ΜΕ ΤΟ ΥΨΟΣ ΤΗΣ ΚΑΡΤΑΣ, ΧΩΡΙΣ ΝΑ ΤΟ ΑΚΥΡΩΝΕΙ ══════
       ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΔΙΟΡΘΩΝΕΤΑΙ: για να μετρηθεί η κίνηση σε «cqh» έπρεπε η
       κάρτα να γίνει δοχείο μεγέθους. Το «container-type: size» όμως περιορίζει
       ΚΑΙ ΤΟΥΣ ΔΥΟ άξονες: το ύψος παύει να βγαίνει από το περιεχόμενο. Η κάρτα
       κατέρρευσε στο γέμισμά της και το «overflow: hidden» έκοψε τα πάντα κάτω
       από την πρώτη σειρά. Έμενε ορατός ο τίτλος «Ρεύμα» και τίποτε άλλο: ούτε
       περίοδος, ούτε κατανάλωση, ούτε το πληρωτέο. Δηλαδή το πάνελ που δείχνει
       τι κάνει η σάρωση δεν έδειχνε τη σάρωση.

       Η ΛΥΣΗ ΧΩΡΙΣ ΔΟΧΕΙΟ. Η γραμμή μπαίνει μέσα σε έναν σαρωτή που καλύπτει
       ολόκληρη την κάρτα («inset: 0»), και κινείται Ο ΣΑΡΩΤΗΣ, όχι η γραμμή.
       Το ποσοστό σε «translateY» μετριέται πάνω στο ύψος ΤΟΥ ΙΔΙΟΥ του
       στοιχείου: του σαρωτή είναι το ύψος της κάρτας, της γραμμής θα ήταν δύο
       εικονοστοιχεία. Άρα «translateY(100%)» σημαίνει ακριβώς «μια κάρτα κάτω»,
       χωρίς καμία δήλωση δοχείου και χωρίς να πειραχθεί η ροή.

       Παραμένει μόνο μετασχηματισμός, δηλαδή δουλειά της κάρτας γραφικών και
       όχι νέα διάταξη σε κάθε καρέ. */
    @keyframes lpScan { 0% { transform: translateY(0); opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { transform: translateY(100%); opacity: 0; } }
    .lp-scan-sweep { position: absolute; inset: 0; pointer-events: none; will-change: transform; animation: lpScan 2.6s cubic-bezier(.4, 0, .2, 1) infinite; }
    /* Η κίνηση σταματά στην αφή: μια γραμμή που σαρώνει επ' άπειρον κοστίζει
       επανασύνθεση σε κάθε καρέ, και σε τηλέφωνο δεν την κοιτάζει κανείς. */
    /* ΣΤΗΝ ΑΦΗ ΣΤΑΜΑΤΑΝΕ ΟΛΕΣ ΟΙ ΑΤΕΡΜΟΝΕΣ ΚΙΝΗΣΕΙΣ ΤΩΝ ΜΑΚΕΤΩΝ.
       Οκτώ ράβδοι που τεντώνονται κάθε δευτερόλεπτο και μια γραμμή που σαρώνει
       κάθε 2,6: εννέα επίπεδα σε αδιάκοπη επανασύνθεση, για διακόσμηση που
       κανείς δεν κοιτάζει κρατώντας τηλέφωνο. Οι ράβδοι μένουν στο ύψος τους,
       η γραμμή μένει στη θέση της· η εικόνα είναι ίδια, ακίνητη. */
    @media (hover: none) {
      .lp-scan-sweep { animation: none; opacity: .5; }
      .lp-bar { animation: none; transform: scaleY(.8); }
    }
    @keyframes lpPop { 0% { opacity: 0; transform: translateY(6px) scale(.96); } 100% { opacity: 1; transform: none; } }
    .lp-pop { animation: lpPop .5s cubic-bezier(.2, 0, 0, 1) both; }
    @keyframes lpWave { 0%, 100% { transform: scaleY(.4); } 50% { transform: scaleY(1); } }
    .lp-bar { animation: lpWave 1s ease-in-out infinite; transform-origin: center; }
    @keyframes lpGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
    .lp-grow { transform-origin: bottom; animation: lpGrow .5s cubic-bezier(.2, 0, 0, 1) both; }
    .lp-live { transition: filter .18s ease, transform .18s cubic-bezier(.2, 0, 0, 1), box-shadow .18s ease; }
    .lp-live:hover { filter: brightness(1.13); transform: translateY(-1.5px); box-shadow: 0 4px 14px -6px rgba(16,24,40,.22); }
    .lp-vbar { transition: filter .18s ease; }
    .lp-vbar:hover { filter: brightness(1.4) saturate(1.15); }
    @media (max-width: 760px) { .lp-rail { display: none; } }
    @media (prefers-reduced-motion: reduce) {
      .lp-scan-sweep, .lp-bar, .lp-pop, .lp-grow { animation: none !important; }
      .lp-live, .lp-vbar { transition: none; }
      .lp-live:hover { transform: none; }
    }
  `}</style>
);

// ── Πάνελ: Ο πίνακάς σου ─────────────────────────────────────────────────────
export function PanelDashboard() {
  const months = [42, 55, 48, 61, 52, 70, 66, 78, 60, 84, 72, 90];
  // ΤΡΕΙΣ ΕΤΙΚΕΤΕΣ, ΤΡΙΑ ΔΙΑΦΟΡΕΤΙΚΑ ΥΨΗ. «ΚΑΘΑΡΗ ΑΠΟΔΟΣΗ» και «ΜΗΝΙΑΙΑ ΕΣΟΔΑ»
  // έπιαναν δύο σειρές, «ΠΛΗΡΟΤΗΤΑ» μία: η σειρά διαβαζόταν ακανόνιστη ό,τι κι αν
  // έκανε το κατώφλι ύψους από κάτω. Μία λέξη η καθεμία, μία σειρά, τίποτα να
  // ζυγίσει. Και τα ποσά με δύο δεκαδικά, όπως παντού στην εφαρμογή.
  const kpis = [['Απόδοση', '4,80%'], ['Έσοδα/μήνα', '1.250,00 €'], ['Πληρότητα', '92%']];
  return (
    <div style={{ display: 'flex', gap: 16, textAlign: 'left' }}>
      <div className="lp-rail" style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 12px' }}>
          <BrandMark size={22} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>PROPERWISE</div>
        </div>
        {['Επισκόπηση', 'Ενοίκιο', 'Δαπάνες', 'Λογαριασμοί', 'Ημερολόγιο'].map((r, i) => (
          <div key={i} className="lp-live" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, background: i === 0 ? 'var(--bg-elevated)' : 'transparent', border: i === 0 ? '1px solid var(--border-subtle)' : '1px solid transparent', color: i === 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: i === 0 ? 700 : 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: i === 0 ? 'var(--text-secondary)' : 'var(--border-strong)' }} />{r}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ═══ ΤΟ ΠΟΣΟ ΕΒΓΑΙΝΕ ΕΞΩ ΑΠΟ ΤΟ ΠΛΑΚΙΔΙΟ ═════════════════════════════
            ΤΙ ΣΥΝΕΒΑΙΝΕ. Το «1.250,00 €» είναι δέκα χαρακτήρες· τα άλλα δύο
            πλακίδια έχουν πέντε και τρεις. Με μέγεθος δεμένο στο ΠΛΑΤΟΣ ΟΘΟΝΗΣ
            (2.1vw) και χωρίς αναδίπλωση, το ποσό δεν είχε πού να χωρέσει σε στήλη που
            είναι το ένα τρίτο ενός πάνελ: το ευρώ έβγαινε έξω από το περίγραμμα.
            Στην αρχική σελίδα, δηλαδή στην πρώτη εικόνα του προϊόντος.

            ΓΙΑΤΙ ΔΕΝ ΑΡΚΕΙ ΜΙΚΡΟΤΕΡΗ ΓΡΑΜΜΑΤΟΣΕΙΡΑ. Ένα μικρότερο σταθερό
            μέγεθος λύνει τη μία οθόνη και σπάει την επόμενη· το πρόβλημα δεν
            είναι το μέγεθος αλλά ότι μετριέται με λάθος μονάδα. Η οθόνη δεν
            ξέρει πόσο πλατύ είναι το πάνελ.

            Η ΛΥΣΗ: το πάνελ γίνεται ΔΟΧΕΙΟ και το μέγεθος μετριέται σε cqi,
            δηλαδή σε ποσοστό του δικού του πλάτους. Ο συντελεστής βγαίνει από
            τον ΠΛΑΤΥΤΕΡΟ αριθμό και από το καθαρό πλάτος του πλακιδίου
            (πλάτος/3 μείον γεμίσματα και κενά), με περιθώριο ασφαλείας.
            Και επειδή το δοχείο είναι το πάνελ και όχι το κάθε πλακίδιο, τα
            τρία ποσά έχουν ΤΟ ΙΔΙΟ μέγεθος: αλλιώς το φαρδύ θα μίκραινε μόνο
            του και η σειρά θα είχε τρεις τυπογραφίες.

            ΚΑΙ ΣΤΟ ΚΕΝΤΡΟ, ΚΑΙ ΤΑ ΤΡΙΑ. Αριστερά στοιχισμένα, η ετικέτα και ο
            αριθμός έχουν διαφορετικό πλάτος μέσα σε κάθε πλακίδιο, οπότε το
            κενό έπεφτε πάντα δεξιά και σε άλλο μέγεθος σε καθένα: τρία κουτιά
            ίδιου σχήματος με τρία διαφορετικά βάρη. Στο κέντρο, το κενό
            μοιράζεται και στις δύο πλευρές και η σειρά ισορροπεί. */}
        <div style={{ containerType: 'inline-size', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {kpis.map(([l, v], i) => (
            <div key={i} className="lp-live" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '13px 14px', minWidth: 0, overflow: 'hidden', textAlign: 'center' }}>
              {/* Η ΕΤΙΚΕΤΑ ΚΟΒΟΤΑΝ ΜΕ ΑΠΟΣΙΩΠΗΤΙΚΑ: «ΚΑΘΑΡΗ…», «ΜΗΝΙΑΙ…»,
                  «ΠΛΗΡΟΤ…». Πρώτα διορθώθηκαν τα ΟΝΟΜΑΤΑ, μία λέξη το καθένα.
                  Το «ΕΣΟΔΑ/ΜΗΝΑ» όμως είναι ακόμη δέκα κεφαλαία με αραίωση και
                  ξεχειλίζει από το ίδιο πλακίδιο λίγο μετά τον αριθμό, οπότε
                  παίρνει την ίδια μονάδα με αυτόν: διορθωμένο μόνο το ένα από
                  τα δύο θα άφηνε το άλλο να σπάσει στο επόμενο στένεμα. */}
              <div style={{ fontSize: 'clamp(8px, 2.8cqi, 10px)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, lineHeight: 1.3, whiteSpace: 'nowrap' }}>{l}</div>
              <div style={{ fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.025em', fontSize: 'clamp(11px, 4.2cqi, 19px)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 16px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Έσοδα ανά μήνα</div>
            {/* ΗΤΑΝ ΠΡΑΣΙΝΟ ΜΕ ΤΡΙΓΩΝΟ. Ο κανόνας του προϊόντος είναι ένας: καμία
                σημασιολογική χρήση πράσινου, καμία επιβράβευση με χρώμα. Η
                αύξηση φαίνεται ήδη από τις ίδιες τις μπάρες· η γραμμή απλώς τη
                μετράει. */}
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 650 }}>+12% φέτος</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(4px, 1.2vw, 9px)', height: 92 }}>
            {months.map((m, i) => (
              <div key={i} className="lp-grow lp-vbar" style={{ animationDelay: `${i * 0.04}s`, flex: 1, height: `${m}%`, borderRadius: '4px 4px 0 0', background: i === months.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 34%, transparent)' }} />
            ))}
          </div>
        </div>
        <div className="lp-hide-xs lp-live" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /></svg>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Πρόταση:</strong> αλλάζοντας πάροχο ρεύματος, γλιτώνεις 184,00 € τον χρόνο.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Πάνελ: Σάρωση ────────────────────────────────────────────────────────────
export function PanelScan() {
  const filed = ['Λογαριασμοί', 'Δαπάνες', 'Ημερολόγιο', navLabel('documents')];
  return (
    <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'left' }}>
      <div className="lp-live" style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '18px 18px 16px' }}>
        <div className="lp-scan-sweep" aria-hidden="true">
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 60%, transparent)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Ρεύμα</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Μηνιαίος λογαριασμός</div>
        </div>
        {[['Περίοδος', 'Ιούν 2026'], ['Κατανάλωση', '312 kWh'], ['Ημερομηνία λήξης', '10/08/2026']].map(([l, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--text-secondary)' }}><span>{l}</span><span style={{ color: 'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums' }}>{v}</span></div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Πληρωτέο</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>88,50&nbsp;€</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
        <svg aria-hidden="true" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /></svg>
        Μπήκε μόνος του σε:
      </div>
      {/* ═══ ΤΑ ΤΕΣΣΕΡΑ ΣΕ ΜΙΑ ΕΥΘΕΙΑ ════════════════════════════════════════
          ΤΙ ΔΕΝ ΧΩΡΟΥΣΕ. Κάθε σήμα κουβαλούσε ένα «✓». Τέσσερα εικονίδια επί 20
          εικονοστοιχεία (εικονίδιο και κενό) είναι ογδόντα, και ακριβώς αυτά τα
          ογδόντα έσπρωχναν το τέταρτο σήμα σε δεύτερη σειρά: τρία πάνω, ένα
          κάτω, δηλαδή η χειρότερη δυνατή αναδίπλωση.

          ΓΙΑΤΙ ΕΦΥΓΕ ΤΟ ΕΙΚΟΝΙΔΙΟ ΚΑΙ ΟΧΙ ΤΟ ΚΕΙΜΕΝΟ. Η σειρά από πάνω λέει ήδη
          «Μπήκε μόνος του σε:». Το «✓» δεν πρόσθετε πληροφορία — την
          επαναλάμβανε τέσσερις φορές. Χωρίς αυτό, τα τέσσερα σήματα πιάνουν 410
          από τα 440 εικονοστοιχεία του πάνελ και κάθονται σε μία ευθεία, με τα
          ονόματα των οθονών να μένουν ακέραια όπως τα λέει η εφαρμογή.

          Η αναδίπλωση μένει ως δίχτυ για πολύ στενές οθόνες: εκεί καμία
          γραμματοσειρά δεν χωράει δεκαέξι γράμματα, και μια σπασμένη σειρά είναι
          προτιμότερη από κείμενο που ξεχειλίζει. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {filed.map((t, i) => (
          <span key={i} className="lp-pop lp-live" style={{ animationDelay: `${0.18 * i + 0.3}s`, display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '6px 12px', whiteSpace: 'nowrap' }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

// ── Πάνελ: Βοηθός ────────────────────────────────────────────────────────────
export function PanelAssistant() {
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 12, marginBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>Ν</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Νόα</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Ο βοηθός σου για τα ακίνητα</div>
        </div>
        {/* Η κουκκίδα «ενεργός» ήταν πράσινη. Στην εφαρμογή το «εδώ είσαι, εδώ
            πατάς» το λέει το χρώμα της μάρκας, και το πράσινο δεν σημαίνει
            τίποτα πουθενά αλλού. */}
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
      </div>
      <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="lp-pop lp-live" style={{ animationDelay: '.1s', alignSelf: 'flex-end', maxWidth: '82%', padding: '10px 14px', borderRadius: T.radius.card, borderBottomRightRadius: 4, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, lineHeight: 1.5 }}>Νόα, πόσα ξόδεψα σε ρεύμα φέτος;</div>
        <div className="lp-pop lp-live" style={{ animationDelay: '.5s', alignSelf: 'flex-start', maxWidth: '90%', padding: '10px 14px', borderRadius: T.radius.card, borderBottomLeftRadius: 4, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
          Φέτος ξόδεψες <strong>1.240,00&nbsp;€</strong> σε ρεύμα, 18% περισσότερα από πέρσι, ενώ η κατανάλωση έμεινε σχεδόν σταθερή. Θέλεις να σου προτείνω οικονομικότερο πρόγραμμα ή πάροχο για το ακίνητό σου;
        </div>
        <div className="lp-pop" style={{ animationDelay: '.9s', alignSelf: 'flex-start' }}>
          <span className="lp-live" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)', borderRadius: T.radius.pill, padding: '6px 12px' }}>
            Μετάβαση: Σύγκριση ρεύματος
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 2px', borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 24 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <span key={i} className="lp-bar" style={{ animationDelay: `${i * 0.09}s`, width: 3, height: 18, borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 55%, transparent)' }} />
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 'auto' }}>Μίλα του ελληνικά…</div>
      </div>
    </div>
  );
}
