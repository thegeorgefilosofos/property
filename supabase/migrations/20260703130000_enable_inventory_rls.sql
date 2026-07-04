-- ─────────────────────────────────────────────────────────────────────────
-- ΑΣΦΑΛΕΙΑ: Ενεργοποίηση Row Level Security στους πίνακες Απογραφής.
-- Ήταν εκτεθειμένοι με το anon key (οποιοσδήποτε μπορούσε να διαβάσει/γράψει).
--
-- Μοντέλο ιδιοκτησίας ανά πίνακα (όπως προκύπτει από τον κώδικα):
--   inventory_items       → property_id  (δείχνει στο user_properties.id)
--   inventory_maintenance → property_id
--   inventory_handovers   → property_id
--   inventory_repairs     → item_id + user_id  (ΔΕΝ έχει property_id)
--
-- Οι συγκρίσεις γίνονται με ::text σε ΚΑΙ ΤΙΣ ΔΥΟ πλευρές γιατί το property_id
-- είναι αποθηκευμένο ως text ενώ το user_properties.id είναι uuid
-- (αλλιώς: ERROR 42883 operator does not exist: uuid = text).
-- Ασφαλές να τρέξει πολλές φορές (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.inventory_items       enable row level security;
alter table public.inventory_repairs     enable row level security;
alter table public.inventory_handovers   enable row level security;
alter table public.inventory_maintenance enable row level security;

-- inventory_items: ιδιοκτησία μέσω property_id → user_properties
drop policy if exists "own_inventory_items" on public.inventory_items;
create policy "own_inventory_items" on public.inventory_items for all
  using      (exists (select 1 from public.user_properties p where p.id::text = inventory_items.property_id::text       and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id::text = inventory_items.property_id::text       and p.user_id = auth.uid()));

-- inventory_maintenance: ιδιοκτησία μέσω property_id → user_properties
drop policy if exists "own_inventory_maintenance" on public.inventory_maintenance;
create policy "own_inventory_maintenance" on public.inventory_maintenance for all
  using      (exists (select 1 from public.user_properties p where p.id::text = inventory_maintenance.property_id::text and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id::text = inventory_maintenance.property_id::text and p.user_id = auth.uid()));

-- inventory_handovers: ιδιοκτησία μέσω property_id → user_properties
drop policy if exists "own_inventory_handovers" on public.inventory_handovers;
create policy "own_inventory_handovers" on public.inventory_handovers for all
  using      (exists (select 1 from public.user_properties p where p.id::text = inventory_handovers.property_id::text   and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id::text = inventory_handovers.property_id::text   and p.user_id = auth.uid()));

-- inventory_repairs: ΔΕΝ έχει property_id. Ιδιοκτησία μέσω του γονέα item_id
-- (→ inventory_items → property → user). Παράλληλα δεχόμαστε και το user_id
-- της ίδιας της γραμμής, ώστε να δουλεύει ακόμη κι αν λείπει το item_id.
drop policy if exists "own_inventory_repairs" on public.inventory_repairs;
create policy "own_inventory_repairs" on public.inventory_repairs for all
  using (
    inventory_repairs.user_id::text = auth.uid()::text
    or exists (
      select 1 from public.inventory_items i
      join public.user_properties p on p.id::text = i.property_id::text
      where i.id::text = inventory_repairs.item_id::text and p.user_id = auth.uid()
    )
  )
  with check (
    inventory_repairs.user_id::text = auth.uid()::text
    or exists (
      select 1 from public.inventory_items i
      join public.user_properties p on p.id::text = i.property_id::text
      where i.id::text = inventory_repairs.item_id::text and p.user_id = auth.uid()
    )
  );
