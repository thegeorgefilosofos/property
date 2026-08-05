'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Η ΩΡΑ ΕΛΛΑΔΑΣ, ΖΩΝΤΑΝΗ — ΚΑΙ ΧΩΡΙΣ ΝΑ ΞΑΝΑΣΧΕΔΙΑΖΕΙ ΤΗΝ ΟΘΟΝΗ.
//
// ΓΙΑΤΙ ΧΩΡΙΣΤΟ ΑΡΧΕΙΟ. Το ρολόι πρέπει να χτυπά κάθε λεπτό. Αν το state του
// ζούσε μέσα στην Επισκόπηση, κάθε λεπτό θα ξαναϋπολογιζόταν ΟΛΟΚΛΗΡΗ η οθόνη:
// φόρος χαρτοφυλακίου, γράφημα δαπανών, insights. Εδώ ξαναποδίδεται μόνο μία
// γραμμή κειμένου.
//
// ΓΙΑΤΙ ΚΕΝΟ ΣΤΗΝ ΠΡΩΤΗ ΑΠΟΔΟΣΗ. Ο διακομιστής και ο περιηγητής δεν είναι στο
// ίδιο δευτερόλεπτο. Αν τυπώναμε ώρα και στα δύο, η React θα έβρισκε διαφορά
// στο hydration. Η ώρα εμφανίζεται μετά το mount — δηλαδή μόνο εκεί όπου
// υπάρχει πραγματικό ρολόι — και κρατά τη θέση της ώστε να μην αναπηδά η σελίδα.
//
// Η ζώνη είναι ΠΑΝΤΑ Europe/Athens (lib/core/time.ts), όχι του περιηγητή: ο
// ιδιοκτήτης που ταξιδεύει βλέπει την ώρα που μετράει για τις προθεσμίες του.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { athensNowLabel } from '@/lib/core/time';

export default function AthensNow({ style }: { style?: React.CSSProperties }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setLabel(athensNowLabel());
    tick();
    // Ευθυγράμμιση στο επόμενο ακέραιο λεπτό: αλλιώς η ένδειξη «14:07» θα άλλαζε
    // κάπου στη μέση του λεπτού και θα έδειχνε λάθος ως και 59 δευτερόλεπτα.
    const toMinute = 60_000 - (Date.now() % 60_000);
    let every: ReturnType<typeof setInterval> | null = null;
    const first = setTimeout(() => { tick(); every = setInterval(tick, 60_000); }, toMinute);
    return () => { clearTimeout(first); if (every) clearInterval(every); };
  }, []);

  return <div style={style} suppressHydrationWarning>{label ?? ' '}</div>;
}
