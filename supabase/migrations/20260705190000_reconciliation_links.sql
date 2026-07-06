-- ─────────────────────────────────────────────────────────────────────────
-- Σύνδεσμος συμφωνίας (reconciliation) + realtime.
-- Συνδέει έξοδα & γεγονότα ημερολογίου με τον λογαριασμό-πηγή (bill_id), ώστε
-- η εξόφληση/αναίρεση να είναι ΑΚΡΙΒΗΣ (όχι με ταίριασμα ποσού) και να μπορεί
-- να γίνει undo με ένα κλικ. Ενεργοποιεί επίσης realtime για ζωντανές αλλαγές.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.expenses        add column if not exists bill_id uuid references public.bills(id) on delete set null;
alter table public.calendar_events add column if not exists bill_id uuid references public.bills(id) on delete set null;

create index if not exists expenses_bill_id_idx        on public.expenses(bill_id);
create index if not exists calendar_events_bill_id_idx on public.calendar_events(bill_id);

-- Realtime: κάνε τα βασικά tables μέλη της δημοσίευσης realtime της Supabase,
-- ώστε οι αλλαγές «Πληρωμένο/Εκκρεμές» να φτάνουν ζωντανά στις ανοιχτές καρτέλες.
-- Τυλιγμένο σε exception handlers ώστε να είναι idempotent (αγνοεί διπλότυπα).
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.bills';           exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.expenses';        exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.calendar_events'; exception when others then null; end;
end $$;
