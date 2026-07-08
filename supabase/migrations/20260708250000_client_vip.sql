-- vip: ρητή σήμανση πελάτη ως VIP (πέρα από βαθμολογία/έσοδα), ώστε να εμφανίζεται
-- πάντα στο φίλτρο VIP του Πελατολογίου. Λειτουργεί όπως το do_not_rent.
alter table public.clients add column if not exists vip boolean default false;
