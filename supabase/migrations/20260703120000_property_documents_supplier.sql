-- Προσθήκη διάστασης «Προμηθευτής/Πάροχος» στο αρχείο εγγράφων & φωτογραφιών.
-- Επιτρέπει κατηγοριοποίηση ανά πάροχο (ΔΕΗ, ΕΥΔΑΠ, COSMOTE, ασφαλιστική κ.λπ.)
-- επιπλέον της κατηγορίας. Ασφαλές να τρέξει πολλές φορές.
alter table public.property_documents
  add column if not exists supplier text;

create index if not exists property_documents_supplier_idx
  on public.property_documents (property_id, supplier);
