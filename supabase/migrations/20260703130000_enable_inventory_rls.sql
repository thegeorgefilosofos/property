-- ─────────────────────────────────────────────────────────────────────────
-- ΑΣΦΑΛΕΙΑ: Ενεργοποίηση Row Level Security στους πίνακες Απογραφής.
-- Ήταν εκτεθειμένοι με το anon key (οποιοσδήποτε μπορούσε να διαβάσει/γράψει).
-- Η ιδιοκτησία προκύπτει από το ακίνητο-γονέα (user_properties.user_id = auth.uid()).
--
-- ΣΗΜΕΙΩΣΗ: Υποθέτει ότι και οι 4 πίνακες έχουν στήλη property_id που δείχνει
-- στο user_properties.id. Αν κάποιος πίνακας δεν την έχει (π.χ. έχει item_id),
-- πες μου να προσαρμόσω το αντίστοιχο policy. Ασφαλές να τρέξει πολλές φορές.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.inventory_items       enable row level security;
alter table public.inventory_repairs     enable row level security;
alter table public.inventory_handovers   enable row level security;
alter table public.inventory_maintenance enable row level security;

drop policy if exists "own_inventory_items" on public.inventory_items;
create policy "own_inventory_items" on public.inventory_items for all
  using      (exists (select 1 from public.user_properties p where p.id = inventory_items.property_id       and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id = inventory_items.property_id       and p.user_id = auth.uid()));

drop policy if exists "own_inventory_repairs" on public.inventory_repairs;
create policy "own_inventory_repairs" on public.inventory_repairs for all
  using      (exists (select 1 from public.user_properties p where p.id = inventory_repairs.property_id     and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id = inventory_repairs.property_id     and p.user_id = auth.uid()));

drop policy if exists "own_inventory_handovers" on public.inventory_handovers;
create policy "own_inventory_handovers" on public.inventory_handovers for all
  using      (exists (select 1 from public.user_properties p where p.id = inventory_handovers.property_id   and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id = inventory_handovers.property_id   and p.user_id = auth.uid()));

drop policy if exists "own_inventory_maintenance" on public.inventory_maintenance;
create policy "own_inventory_maintenance" on public.inventory_maintenance for all
  using      (exists (select 1 from public.user_properties p where p.id = inventory_maintenance.property_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id = inventory_maintenance.property_id and p.user_id = auth.uid()));
