# Πώς να υπογράψετε τα DPAs των υπεργολάβων — Checklist

> **DRAFT — v0.1 (2026-07-22).** Λειτουργικός οδηγός για να κλείσουν τα ☐ στο
> `docs/compliance/subprocessors.md`. Κάθε βασικός υπεργολάβος προσφέρει τυποποιημένο
> DPA με ενσωματωμένες SCCs — δεν χρειάζεται διαπραγμάτευση, μόνο **αποδοχή/υπογραφή,
> αρχειοθέτηση, ενημέρωση μητρώου**.

## Γενικά βήματα (για κάθε υπεργολάβο)
1. Συνδεθείτε με τον **λογαριασμό-οργανισμό** (όχι προσωπικό) που κατέχει τα production δεδομένα.
2. Συμπληρώστε τα **νομικά στοιχεία** (επωνυμία, ΑΦΜ, διεύθυνση, υπογράφων) — τα ίδια placeholders.
3. Αποδεχθείτε/υπογράψτε το DPA· βεβαιωθείτε ότι περιλαμβάνει **EU SCCs (Module 2, Controller→Processor)**.
4. **Κατεβάστε το PDF** σε `docs/legal/executed-dpas/<provider>.pdf` (ή ασφαλή αποθήκη).
5. Ενημερώστε το `subprocessors.md`: ☐ → ✅ με **ημερομηνία + έκδοση**.

## 1. Supabase — κρίσιμο, EU/Frankfurt
- [ ] Dashboard → Organization → Legal/Compliance (ή supabase.com/legal/dpa) → υπογραφή DPA (SCCs).
- [ ] Επιβεβαίωση project **`eu-central-1`** (data residency ΕΕ).
- [ ] (Pro) managed backups/PITR όταν αναβαθμιστείτε.

## 2. Resend — email, ΗΠΑ (SCCs)
- [ ] Settings → Legal/DPA → υπογραφή με **SCCs**.
- [ ] Επιβεβαίωση ελαχιστοποίησης (μόνο email/όνομα/περιεχόμενο).

## 3. Anthropic — AI, ΗΠΑ (SCCs) — προσοχή στο no-training
- [ ] Console → Data Processing Addendum → υπογραφή με **SCCs**.
- [ ] **Έγγραφη επιβεβαίωση όρων μη-εκπαίδευσης** (API data δεν χρησιμοποιείται για training).
- [ ] Καμία ειδική κατηγορία δεδομένων στα prompts.

## 4. GitHub — κώδικας/CI/backups, ΗΠΑ (SCCs)
- [ ] Αποδοχή Microsoft/GitHub DPA· κατέβασμα ισχύοντος PDF από το trust center.
- [ ] **Backup artifacts κρυπτογραφημένα** (`BACKUP_PASSPHRASE` set).

## 5. Lemon Squeezy — χρέωση συνδρομών (merchant of record)
- [ ] Settings → Legal → DPA· η κάρτα μένει στο PCI scope της Lemon Squeezy, που πουλά ως merchant of record και αποδίδει τον ΦΠΑ κάθε χώρας.

## Μελλοντικοί (πριν το go-live)
- [ ] **Google/Apple/Mozilla (υπηρεσίες push των περιηγητών)**: ενεργοποιούνται μόλις
      μπουν τα κλειδιά VAPID. Παραδίδουν κρυπτογραφημένο περιεχόμενο (RFC 8291) και
      βλέπουν μόνο τη διεύθυνση της συσκευής· η ειδοποίηση όμως εμφανίζεται σε οθόνη
      κλειδώματος, οπότε ο κανόνας «τίποτα που δεν θα άντεχε δημόσιο βλέμμα» ισχύει.
- [ ] **Viber/WhatsApp(Meta)/Apple(APNs)**: DPA κάθε παρόχου **πριν** τις
      πολυκαναλικές ειδοποιήσεις· κανόνας «χωρίς ποσά/ονόματα στην οθόνη κλειδώματος».

## Μετά την υπογραφή όλων
- [ ] `subprocessors.md`: όλα τα ☐ → ✅ με ημερομηνίες.
- [ ] **Δημοσίευση περίληψης** καταλόγου υπεργολάβων στον ιστότοπο (28(3)(δ)).
- [ ] **Διαδικασία ειδοποίησης πελατών** για αλλαγές (με δικαίωμα εναντίωσης, §8 DPA).
- [ ] Καταγραφή εκδόσεων/ημερομηνιών SCC (due diligence αγοραστή).

---

## English quick reference
Each core subprocessor offers a **standard, click-to-accept DPA with EU SCCs (Module 2,
Controller→Processor)** — accept/sign, save the PDF, update the register.
1. **Supabase** — Org → Legal; sign DPA (SCCs); confirm `eu-central-1`.
2. **Resend** — Settings → DPA (SCCs).
3. **Anthropic** — Console → DPA (SCCs); **confirm no-training in writing**; no special-
   category data in prompts.
4. **GitHub** — accept Microsoft/GitHub DPA; confirm **encrypted** backups.
5. **Lemon Squeezy** — Settings → Legal → DPA; card stays in Lemon Squeezy PCI scope; they are the merchant of record.
Then flip every ☐→✅ with dates; publish a subprocessor summary; set up customer change-
notification; log SCC versions. Store signed PDFs in `docs/legal/executed-dpas/`.
