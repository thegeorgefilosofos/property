// ═══════════════════════════════════════════════════════════════════════════
// ownerSplit — Κατανομή εσόδων/εξόδων σε συνιδιοκτήτες + διαχειριστική αμοιβή.
//
// Για την persona «διαχειριστής ακινήτων»: ένα ακίνητο μπορεί να ανήκει σε
// πολλούς ιδιοκτήτες (ποσοστά), και ο διαχειριστής κρατά αμοιβή (% επί των
// εισπραγμένων ενοικίων). Υπολογίζει το ΚΑΘΑΡΟ κάθε ιδιοκτήτη μετά τα κοινά
// έξοδα και την αμοιβή, με ακριβή στρογγυλοποίηση (το άθροισμα «κλείνει»).
//
// Καθαρό & δοκιμάσιμο — καμία εξάρτηση.
// ═══════════════════════════════════════════════════════════════════════════

export interface OwnerShare { name: string; pct: number; afm?: string }

export interface SplitInput {
  grossIncome: number;         // εισπραγμένα ενοίκια περιόδου
  expenses: number;            // κοινά έξοδα περιόδου (βαρύνουν τους ιδιοκτήτες pro-rata)
  owners: OwnerShare[];        // ποσοστά ιδιοκτησίας (0-100, άθροισμα ~100)
  managementFeePct?: number;   // αμοιβή διαχειριστή, % επί των εισπραγμένων (default 0)
  managerName?: string;
}

export interface OwnerResult {
  name: string; pct: number; afm?: string;
  incomeShare: number; expenseShare: number; feeShare: number; net: number;
}

export interface SplitResult {
  owners: OwnerResult[];
  gross: number; expenses: number; managementFee: number; distributable: number;
  managerName?: string;
  pctSum: number; valid: boolean; warning?: string;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computeSplit(input: SplitInput): SplitResult {
  const gross = r2(input.grossIncome);
  const expenses = r2(input.expenses);
  const feePct = Math.max(0, Number(input.managementFeePct) || 0);
  const managementFee = r2(gross * feePct / 100);
  const distributable = r2(gross - expenses - managementFee);

  const owners = (input.owners || []).filter(o => o && o.name?.trim());
  const pctSum = r2(owners.reduce((s, o) => s + (Number(o.pct) || 0), 0));
  const valid = Math.abs(pctSum - 100) < 0.01 && owners.length > 0;

  // Raw υπολογισμοί ανά ιδιοκτήτη (με βάση το ποσοστό).
  const results: OwnerResult[] = owners.map(o => {
    const pct = Number(o.pct) || 0;
    const f = pct / 100;
    return {
      name: o.name.trim(), pct, afm: o.afm,
      incomeShare: r2(gross * f), expenseShare: r2(expenses * f), feeShare: r2(managementFee * f),
      net: r2(distributable * f),
    };
  });

  // Στρογγυλοποίηση: το άθροισμα των net πρέπει να ισούται ακριβώς με το distributable.
  // Το υπόλοιπο (λόγω 2 δεκαδικών) πάει στον ιδιοκτήτη με το μεγαλύτερο ποσοστό.
  if (results.length) {
    const sumNet = r2(results.reduce((s, r) => s + r.net, 0));
    const diff = r2(distributable - sumNet);
    if (Math.abs(diff) >= 0.01) {
      let idx = 0;
      for (let i = 1; i < results.length; i++) if (results[i].pct > results[idx].pct) idx = i;
      results[idx].net = r2(results[idx].net + diff);
    }
  }

  return {
    owners: results, gross, expenses, managementFee, distributable,
    managerName: input.managerName?.trim() || undefined,
    pctSum, valid,
    warning: valid ? undefined : (owners.length === 0 ? 'Δεν έχουν οριστεί ιδιοκτήτες.' : `Τα ποσοστά αθροίζουν ${pctSum}% (πρέπει 100%).`),
  };
}
