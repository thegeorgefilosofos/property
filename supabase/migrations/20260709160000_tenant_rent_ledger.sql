-- ═══════════════════════════════════════════════════════════════════════════
-- Ενοικιαστές — αναβάθμιση καθολικού ενοικίων (rent ledger) & αντιστοίχιση
-- αποδείξεων. Επιτρέπει: τρόπο πληρωμής, σύνδεση σκαναρισμένης απόδειξης με
-- συγκεκριμένη δόση ενοικίου, και μοναδικότητα δόσης ανά ενοικιαστή/μήνα.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.rent_payments add column if not exists method         text;    -- cash | bank | e-payment | card
alter table public.rent_payments add column if not exists receipt_url    text;    -- σύνδεσμος απόδειξης/αποδεικτικού
alter table public.rent_payments add column if not exists receipt_doc_id uuid;    -- σύνδεση με property_documents (σκαναρισμένη απόδειξη)
alter table public.rent_payments add column if not exists due_date       date;    -- ημερομηνία λήξης πληρωμής (για ληξιπρόθεσμα/υπενθυμίσεις)

-- Μία δόση ανά ενοικιαστή/μήνα/έτος (αποτρέπει διπλοεγγραφές κατά τη μαζική
-- δημιουργία περιόδων από τους όρους μίσθωσης). Δημιουργείται μόνο αν λείπει.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'rent_payments_tenant_period_uidx'
  ) then
    create unique index rent_payments_tenant_period_uidx
      on public.rent_payments (tenant_id, period_year, period_month);
  end if;
exception when others then null;
end $$;
