// ═══════════════════════════════════════════════════════════════════════════
// ΠΑΡΑΓΟΜΕΝΟ ΑΡΧΕΙΟ — ΜΗΝ ΤΟ ΓΡΑΨΕΙΣ ΣΤΟ ΧΕΡΙ
//
// Γεννιέται από τα ίδια τα migrations με `npm run db-types`. Κάθε αλλαγή που
// γράφεται εδώ χάνεται στην επόμενη γέννηση, και το `npm run db-types --check`
// (μέρος του ελέγχου) την πιάνει αμέσως.
//
// ΤΙ ΕΙΝΑΙ. Το σχήμα των γραμμών όπως τις επιστρέφει το PostgREST. Χωρίς
// αυτό, κάθε `select` γυρίζει `any` και ένα ορθογραφικό λάθος σε όνομα
// στήλης περνά μέχρι την οθόνη του χρήστη.
//
// ΤΙ ΔΕΝ ΕΙΝΑΙ. Δεν αντικαθιστά τον φύλακα schema-drift: εκείνος ελέγχει τα
// ονόματα στηλών ΜΕΣΑ στα strings του `select(…)`, που ο TypeScript δεν
// βλέπει. Οι δύο πιάνουν διαφορετικά μισά του ίδιου λάθους.
// ═══════════════════════════════════════════════════════════════════════════

/** Τιμή στήλης `jsonb`: υπάρχει, αλλά το σχήμα της δεν ζει στη βάση. */
export type Json = unknown;

export interface AccountDeletionIncidentsRow {
  id: string | null;
  subject_id: string;
  occurred_at: string;
  sqlstate: string | null;
  message: string | null;
  objects_gone: number;
  objects_left: number | null;
  buckets: string[];
}

export interface AccountantClientsRow {
  accountant_id: string;
  owner_id: string;
  linked_at: string;
  active: boolean;
  claimed_token: string | null;
}

export interface AccountantDossierRow {
  user_id: string;
  year: number;
  have_ids: string[];
  legal_form: string;
  bookkeeping: string;
  has_renovation: boolean;
  has_loan: boolean;
  ownership_changed: boolean;
  updated_at: string;
}

export interface AccountantLinksRow {
  id: string;
  token: string;
  user_id: string;
  active: boolean | null;
  created_at: string | null;
  expires_at: string | null;
}

export interface AccountantRequestsRow {
  id: string | null;
  accountant_id: string;
  owner_id: string;
  item: string;
  note: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ActivityLogRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
}

export interface AiBudgetRow {
  month: string | null;
  free_count: number;
  updated_at: string;
}

export interface AiUsageRow {
  user_id: string | null;
  minute_bucket: string;
  minute_count: number;
  day: string;
  day_count: number;
  updated_at: string;
  month: string | null;
  month_count: number | null;
}

export interface AirbnbBookingsRow {
  id: string;
  property_id: string;
  user_id: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number | null;
  gross_amount: number;
  airbnb_fee: number | null;
  cleaning_fee: number | null;
  net_amount: number;
  platform: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface AppAdminsRow {
  email: string;
  created_at: string | null;
}

export interface BankConnectionRefsRow {
  connection_id: string | null;
  external_ref: string;
  created_at: string;
}

export interface BankConnectionsRow {
  id: string | null;
  user_id: string;
  provider: string;
  institution_id: string;
  institution_name: string;
  status: string;
  consent_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankRatesRow {
  bank_id: string;
  bank_name: string;
  color: string | null;
  fixed_3yr: string | null;
  fixed_5yr: string | null;
  fixed_10yr: string | null;
  fixed_15yr: string | null;
  fixed_20yr: string | null;
  variable_spread_min: number | null;
  variable_spread_max: number | null;
  fixed_min: number | null;
  max_ltv: number | null;
  max_years: number | null;
  max_amount: number | null;
  min_amount: number | null;
  green_discount: number | null;
  spiti_mou: boolean | null;
  features: string[] | null;
  programs: string[] | null;
  fees: string | null;
  note: string | null;
  url: string | null;
  source_url: string | null;
  verified_at: string | null;
  is_active: boolean | null;
}

export interface BankTransactionsRow {
  id: string;
  user_id: string;
  property_id: string | null;
  txn_date: string | null;
  description: string | null;
  amount: number;
  dedup_hash: string;
  imported_at: string;
  connection_id: string | null;
}

export interface BillingProfilesRow {
  user_id: string;
  doc_type: string | null;
  full_name: string | null;
  company_name: string | null;
  afm: string | null;
  doy: string | null;
  profession: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  plan: string | null;
  billing_cycle: string | null;
  subscription_status: string | null;
  updated_at: string | null;
  owner_name: string | null;
  profile_type: string | null;
  share_market_data: boolean;
  comp_plan: string | null;
  comp_until: string | null;
  comp_months_granted: number | null;
  comp_started_at: string | null;
  wants_mobile: boolean | null;
  full_name_changed_at: string | null;
  vat_number: string | null;
  share_market_data_decided_at: string | null;
  extra_properties: number | null;
  legal_form: string | null;
  bookkeeping: string | null;
  bonus_properties: number | null;
  bonus_properties_until: string | null;
  mor_customer_id: string | null;
  mor_subscription_id: string | null;
  mor_variant_id: string | null;
  mor_renews_at: string | null;
  mor_ends_at: string | null;
  mor_event_at: string | null;
  trial_used_at: string | null;
  tester_since: string | null;
  hold_plan: string | null;
  hold_until: string | null;
  lapsed_at: string | null;
}

export interface BillsRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  type: string;
  amount: number;
  due_date: string;
  period: string | null;
  paid: boolean | null;
  created_at: string | null;
  category: string | null;
  name: string | null;
  vat_rate: number | null;
  recurring: boolean | null;
  notes: string | null;
  kwh: number | null;
  ert: number | null;
  etmear: number | null;
  dimotika: number | null;
  paid_at: string | null;
  paid_by: string | null;
  share_percent: number | null;
  share_note: string | null;
  updated_at: string | null;
}

export interface BillsHistoryRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  category: string;
  month: number;
  year: number;
  amount: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BillsSettingsRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  section: string;
  data: Json;
  updated_at: string | null;
}

export interface BookClosingsRow {
  id: string;
  user_id: string;
  property_id: string;
  year: number;
  snapshot: Json;
  locked_at: string;
}

export interface CalendarEventsRow {
  id: string;
  property_id: string;
  user_id: string;
  title: string;
  category: string;
  event_date: string;
  amount: number | null;
  priority: string | null;
  status: string | null;
  recurring: boolean | null;
  recurring_interval: string | null;
  notes: string | null;
  source: string | null;
  attachment_url: string | null;
  color: string | null;
  created_at: string | null;
  bill_id: string | null;
  event_time: string | null;
  duration_minutes: number | null;
  recurrence_until: string | null;
  recurrence_count: number | null;
  recurrence_exdates: Json;
  contact_phone: string | null;
  contact_email: string | null;
}

export interface CalendarFeedTokensRow {
  user_id: string;
  token: string;
  created_at: string;
  expires_at: string | null;
}

export interface CategoryHintsRow {
  user_id: string;
  vendor_key: string;
  category: string;
}

export interface CheckinLinksRow {
  id: string;
  token: string;
  property_id: string | null;
  client_id: string | null;
  user_id: string;
  active: boolean | null;
  created_at: string | null;
  expires_at: string | null;
}

export interface ChecklistItemsRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  category: string;
  description: string;
  note: string | null;
  completed: boolean | null;
  completed_at: string | null;
  created_at: string | null;
  priority: string | null;
  due_date: string | null;
  recurring: string | null;
  assigned_contact_id: string | null;
  assigned_contact_name: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  status: string | null;
  template_id: string | null;
  sort_order: number | null;
  start_date: string | null;
  budget: number | null;
  depends_on: string | null;
  calendar_event_id: string | null;
  expense_id: string | null;
}

export interface ClientDocumentsRow {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  file_path: string;
  mime: string | null;
  size: number | null;
  kind: string | null;
  created_at: string;
}

export interface ClientNotesRow {
  id: string;
  user_id: string;
  client_id: string;
  kind: string | null;
  body: string;
  created_at: string;
}

export interface ClientStaysRow {
  id: string;
  user_id: string;
  client_id: string;
  property_id: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  guests: number | null;
  nightly_rate: number | null;
  total: number | null;
  channel: string | null;
  rating: number | null;
  damages: boolean | null;
  damage_cost: number | null;
  damage_note: string | null;
  notes: string | null;
  created_at: string;
  gross_guest_paid: number | null;
  platform_fee: number | null;
  climate_levy: number | null;
  amount_basis: string | null;
  declared_at: string | null;
  damage_item_id: string | null;
  source_uid: string | null;
  cancelled_at: string | null;
}

export interface ClientsRow {
  id: string;
  user_id: string;
  type: string;
  full_name: string;
  afm: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  stage: string;
  deal_value: number | null;
  next_action: string | null;
  next_date: string | null;
  created_at: string;
  updated_at: string;
  rating: number | null;
  tags: string[] | null;
  do_not_rent: boolean | null;
  address: string | null;
  id_number: string | null;
  nationality: string | null;
  budget: number | null;
  needs: string | null;
  source: string | null;
  vip: boolean | null;
}

export interface ContactsRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  role: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface CronSecretsRow {
  name: string;
  secret: string;
  created_at: string;
}

export interface EmailCampaignsRow {
  id: string;
  user_id: string;
  subject: string;
  body_html: string;
  kind: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  created_at: string;
  sent_at: string | null;
}

export interface EmailMarketingPrefsRow {
  user_id: string;
  product_news: boolean;
  market_news: boolean;
  unsubscribe_token: string;
  updated_at: string;
}

export interface EmailOutboxRow {
  id: number;
  copy_id: string;
  to_email: string;
  to_name: string | null;
  params: Json;
  category: string;
  priority: number;
  send_window: string | null;
  digest_group: string | null;
  dedup_key: string | null;
  scheduled_for: string;
  status: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  channel: string | null;
  created_at: string;
}

export interface EmailRecipientsRow {
  id: string;
  campaign_id: string;
  user_id: string;
  client_id: string | null;
  email: string;
  name: string | null;
  status: string;
  error: string | null;
  resend_id: string | null;
  sent_at: string | null;
}

export interface EnergyTariffsRow {
  id: string;
  tariff_id: string;
  valid_month: string;
  provider: string;
  provider_label: string;
  name: string;
  badge: string;
  type: string;
  kwh_day: number | null;
  kwh_night: number | null;
  kwh_tier2: number | null;
  tier2_threshold: number | null;
  flat_monthly: number | null;
  fixed: number | null;
  fixed_ebill: number | null;
  contract_months: number | null;
  no_fixed: boolean | null;
  dynamic: boolean | null;
  source: string | null;
  updated_at: string | null;
}

export interface ExpensesRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  description: string;
  amount: number;
  category: string;
  date: string;
  created_at: string | null;
  expense_group: string | null;
  payment_method: string | null;
  installments: number | null;
  amount_upfront: number | null;
  amount_per_installment: number | null;
  cashback_pct: number | null;
  cashback_amount: number | null;
  original_price: number | null;
  discount_amount: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  energy_class: string | null;
  serial_number: string | null;
  warranty_months: number | null;
  purchase_year: number | null;
  model_sku: string | null;
  store_vendor: string | null;
  is_recurring: boolean | null;
  recurring_frequency: string | null;
  notes: string | null;
  paid: boolean | null;
  paid_by: string | null;
  vehicle_lease_model: string | null;
  vehicle_lease_months: number | null;
  vehicle_lease_monthly: number | null;
  vehicle_lease_type: string | null;
  vehicle_lease_count: number | null;
  broker_commission_pct: number | null;
  broker_commission_amount: number | null;
  travel_type: string | null;
  appliance_lease_months: number | null;
  appliance_lease_monthly: number | null;
  exhibition_booth_cost: number | null;
  exhibition_name: string | null;
  travel_destination: string | null;
  floor_type: string | null;
  attachment_url: string | null;
  bill_id: string | null;
  share_percent: number | null;
  share_note: string | null;
  contact_id: string | null;
  supplier_country: string | null;
  supply: string | null;
  supplier_afm: string | null;
  dedup_hash: string | null;
}

export interface FeedbackCampaignWinnersRow {
  campaign_id: string;
  user_id: string | null;
  drawn_at: string;
}

export interface GuestCheckinsRow {
  id: string;
  token: string | null;
  user_id: string | null;
  client_id: string | null;
  property_id: string | null;
  full_name: string;
  id_number: string | null;
  nationality: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  arrival_date: string | null;
  guests_count: number | null;
  accepts_rules: boolean | null;
  created_at: string | null;
  privacy_consent: boolean | null;
  privacy_consent_at: string | null;
}

export interface IcalFeedsRow {
  id: string;
  user_id: string;
  property_id: string;
  channel: string;
  url: string;
  include_blocked: boolean | null;
  active: boolean | null;
  last_synced_at: string | null;
  last_status: string | null;
  created_at: string;
}

export interface InboundMailboxesRow {
  user_id: string;
  token: string;
  active: boolean;
  created_at: string;
  rotated_at: string | null;
}

export interface InboundMessagesRow {
  id: string;
  user_id: string;
  provider_id: string;
  received_at: string;
  from_address: string | null;
  subject: string | null;
  vendor: string | null;
  amount: number | null;
  due_date: string | null;
  issue_date: string | null;
  category: string | null;
  expense_group: string | null;
  attachments: number;
  status: string;
  expense_id: string | null;
}

export interface InventoryRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  category: string;
  acquisition: string | null;
  description: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  energy_class: string | null;
  year_bought: number | null;
  value: number | null;
  quantity: number | null;
  useful_life: number | null;
  warranty_until: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface InventoryHandoversRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  handover_type: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  handover_date: string | null;
  notes: string | null;
  items_snapshot: Json | null;
  created_at: string | null;
}

export interface InventoryItemsRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  name: string;
  category: string;
  room: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_value: number | null;
  current_value: number | null;
  purchase_date: string | null;
  warranty_expiry: string | null;
  condition: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  energy_class: string | null;
  power_watts: number | null;
  daily_hours_use: number | null;
  standby_watts: number | null;
  replacement_cost: number | null;
  smart_device: boolean | null;
  smart_notes: string | null;
  photos: string[] | null;
  tags: string[] | null;
  age_display: string | null;
  provenance: string | null;
  original_price: number | null;
  discount_pct: number | null;
  store_vendor: string | null;
  receipt_number: string | null;
  receipt_doc_url: string | null;
  receipt_doc_name: string | null;
  energy_mode: string | null;
  kwh_per_100_cycles: number | null;
  cycles_per_month: number | null;
  annual_kwh: number | null;
}

export interface InventoryMaintenanceRow {
  id: string;
  property_id: string;
  user_id: string;
  item_id: string | null;
  item_name: string | null;
  task: string;
  interval_months: number | null;
  last_done: string | null;
  next_due: string | null;
  notes: string | null;
  created_at: string | null;
  est_cost: number | null;
  calendar_event_id: string | null;
  expense_id: string | null;
}

export interface InventoryRepairsRow {
  id: string;
  item_id: string | null;
  user_id: string | null;
  repair_date: string | null;
  cost: number | null;
  technician: string | null;
  description: string | null;
  created_at: string | null;
}

export interface InvoiceCountersRow {
  series: string;
  year: number;
  last_no: number;
}

export interface InvoicesRow {
  id: string;
  number: string;
  series: string;
  year: number;
  user_id: string | null;
  country: string | null;
  vat_treatment: string | null;
  currency: string | null;
  net: number | null;
  vat_pct: number | null;
  vat_amount: number | null;
  gross: number | null;
  issued_at: string;
  mor_ref: string | null;
}

export interface IssuedDocumentsRow {
  id: string;
  user_id: string;
  doc_type: string;
  subject: string;
  period: string;
  issued_at: string;
  summary: Json;
  checksum: string;
}

export interface LoanProgramsRow {
  program_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  status: string | null;
  type_label: string | null;
  description: string | null;
  how_it_works: string | null;
  extra_info: string | null;
  savings_example: string | null;
  max_amount: number | null;
  max_prop_value: number | null;
  max_ltv: number | null;
  max_sqm: number | null;
  age_min: number | null;
  age_max: number | null;
  duration_label: string | null;
  deadline: string | null;
  deadline_label: string | null;
  deadline_urgent: boolean | null;
  total_budget: string | null;
  criteria: string[] | null;
  participating_banks: string[] | null;
  source_url: string | null;
  verified_at: string | null;
}

export interface LoansRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  bank: string | null;
  loan_amount: number | null;
  down_payment: number | null;
  rate_type: string | null;
  fixed_rate: number | null;
  euribor: number | null;
  spread: number | null;
  years: number | null;
  start_date: string | null;
  updated_at: string | null;
  status: string | null;
  loan_type: string | null;
  property_value: number | null;
  notes: string | null;
  created_at: string | null;
}

export interface MaintenanceRequestsRow {
  id: string;
  property_id: string;
  user_id: string | null;
  token: string | null;
  title: string;
  description: string | null;
  contact: string | null;
  status: string | null;
  created_at: string | null;
  tenant_id: string | null;
  category: string | null;
  resolved_at: string | null;
  photos: Json | null;
  assignee_name: string | null;
  assignee_contact: string | null;
}

export interface MaintenanceTasksRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  priority: string | null;
  completed: boolean | null;
  created_at: string | null;
}

export interface MarketRatesRow {
  id: number;
  euribor_1m: number | null;
  euribor_3m: number | null;
  euribor_6m: number | null;
  euribor_12m: number | null;
  ecb_rate: number | null;
  ecb_dfl: number | null;
  bog_housing_new: number | null;
  bog_housing_stock: number | null;
  source_euribor: string | null;
  source_bog: string | null;
  rate_changed: boolean | null;
  updated_at: string;
}

export interface MobileWaitlistRow {
  user_id: string;
  email: string | null;
  created_at: string;
  notified_at: string | null;
}

export interface NotificationLogRow {
  id: string;
  user_id: string;
  event_id: string | null;
  reminder_type: string;
  sent_at: string | null;
  created_at: string | null;
}

export interface NotificationPreferencesRow {
  id: string;
  user_id: string;
  email_enabled: boolean | null;
  reminder_7days: boolean | null;
  reminder_3days: boolean | null;
  reminder_1day: boolean | null;
  reminder_email: string | null;
  created_at: string | null;
  updated_at: string | null;
  dunning_enabled: boolean | null;
  dunning_every_days: number | null;
  dunning_max: number | null;
  legal_updates: boolean | null;
  reminder_today: boolean | null;
  reminder_overdue: boolean | null;
  reminder_email_verified: string | null;
  reminder_email_token: string | null;
  reminder_email_token_at: string | null;
}

export interface OnboardingProgressRow {
  user_id: string;
  welcomed: boolean | null;
  first_property: boolean | null;
  demo_seen: boolean | null;
  completed: boolean | null;
  updated_at: string;
  revealed_tabs: string[] | null;
  nav_show_all: boolean | null;
  start_collapsed: boolean | null;
}

export interface OrganizationMembersRow {
  id: string;
  org_id: string;
  user_id: string | null;
  email: string;
  role: string;
  status: string;
  invited_at: string | null;
  joined_at: string | null;
  can_edit: boolean | null;
  edit_requested_at: string | null;
  property_scope: string[] | null;
  can_view_financials: boolean | null;
}

export interface OrganizationsRow {
  id: string;
  owner_user_id: string;
  name: string;
  upgrade_requested_at: string | null;
  created_at: string | null;
}

export interface PortalLinksRow {
  id: string;
  token: string;
  property_id: string;
  user_id: string;
  active: boolean | null;
  created_at: string | null;
  pin_hash: string | null;
  payment_link: string | null;
  expires_at: string | null;
  tenant_id: string | null;
}

export interface PortalPinAttemptsRow {
  id: number | null;
  token: string;
  attempted_at: string;
  success: boolean;
}

export interface PricingSettingsRow {
  user_id: string;
  property_id: string;
  base: number | null;
  min_price: number | null;
  max_price: number | null;
  weekend_premium: number | null;
  min_stay: number | null;
  updated_at: string;
}

export interface ProductUpdatesRow {
  id: string;
  title: string;
  body_html: string;
  cta_label: string | null;
  cta_url: string | null;
  published: boolean;
  emailed_at: string | null;
  created_at: string;
}

export interface PropertyDataRow {
  id: string;
  user_id: string;
  data: Json;
  created_at: string | null;
}

export interface PropertyDocumentsRow {
  id: string;
  property_id: string;
  user_id: string;
  kind: string;
  category: string | null;
  title: string | null;
  notes: string | null;
  doc_date: string | null;
  file_path: string;
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
  supplier: string | null;
  amount: number | null;
  provider_afm: string | null;
  period_from: string | null;
  period_to: string | null;
  issue_date: string | null;
}

export interface PropertySettingsRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  owner_name: string | null;
  owner_afm: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  electricity_provider: string | null;
  water_provider: string | null;
  internet_provider: string | null;
  internet_plan: string | null;
  property_manager: string | null;
  property_manager_phone: string | null;
  insurance_company: string | null;
  insurance_policy: string | null;
  insurance_expiry: string | null;
  notes: string | null;
  kwh_price: number | null;
}

export interface PushSubscriptionsRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_sent_at: string | null;
  failures: number;
}

export interface ReferralCodesRow {
  user_id: string;
  code: string;
  created_at: string | null;
}

export interface ReferralPartnersRow {
  user_id: string;
  earned_at: string | null;
}

export interface ReferralRewardsRow {
  id: string;
  user_id: string;
  referral_id: string | null;
  kind: string;
  months: number | null;
  amount_eur: number | null;
  tier: string | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
}

export interface ReferralsRow {
  id: string;
  code: string;
  referred_user_id: string;
  created_at: string | null;
  referrer_user_id: string | null;
  activated_at: string | null;
}

export interface RentComparablesRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  title: string | null;
  area: string | null;
  sqm: number | null;
  rent: number | null;
  rent_per_sqm: number | null;
  distance: string | null;
  condition: string | null;
  source: string | null;
  url: string | null;
  notes: string | null;
  created_at: string | null;
  listing_type: string | null;
  asking_price: number | null;
  price_per_sqm: number | null;
  days_on_market: number | null;
  sold_price: number | null;
}

export interface RentConfigRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  target_rent: number | null;
  actual_rent: number | null;
  tenant_name: string | null;
  deposit: number | null;
  lease_start: string | null;
  lease_end: string | null;
  updated_at: string | null;
}

export interface RentPaymentsRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  payment_date: string | null;
  amount: number;
  period: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  method: string | null;
  receipt_url: string | null;
  receipt_doc_id: string | null;
  due_date: string | null;
  base_rent: number | null;
  services_charge: number | null;
  tenant_declared: boolean | null;
  tenant_declared_at: string | null;
  tenant_note: string | null;
  tenant_id: string | null;
  period_year: number | null;
  period_month: number | null;
  paid: boolean | null;
  paid_date: string | null;
  days_late: number | null;
}

export interface ReportBrandingRow {
  user_id: string;
  enabled: boolean | null;
  company_name: string | null;
  logo_url: string | null;
  accent_color: string | null;
  phone: string | null;
  email: string | null;
  updated_at: string | null;
}

export interface SendQuotaRow {
  user_id: string;
  kind: string;
  bucket: string;
  units: number;
  updated_at: string;
}

export interface TenantCommLogRow {
  id: string;
  tenant_id: string;
  property_id: string;
  user_id: string;
  type: string;
  summary: string;
  date: string;
  outcome: string | null;
  created_at: string | null;
}

export interface TenantDamagesRow {
  id: string;
  tenant_id: string | null;
  property_id: string | null;
  user_id: string;
  occurred_on: string | null;
  description: string;
  cost: number | null;
  charged_to_tenant: boolean | null;
  repaired: boolean | null;
  repaired_on: string | null;
  notes: string | null;
  created_at: string;
}

export interface TenantsRow {
  id: string;
  property_id: string | null;
  user_id: string | null;
  full_name: string | null;
  nationality: string | null;
  profession: string | null;
  employer: string | null;
  phone: string | null;
  email: string | null;
  afm: string | null;
  id_number: string | null;
  lease_start: string | null;
  lease_end: string | null;
  monthly_rent: number | null;
  deposit: number | null;
  payment_day: number | null;
  contract_type: string | null;
  status: string | null;
  mi_home_app: boolean | null;
  penalty_early_exit: number | null;
  kwh_limit: number | null;
  kwh_overage_price: number | null;
  notes: string | null;
  updated_at: string | null;
  lease_doc_url: string | null;
  lease_doc_name: string | null;
  lease_doc_external_url: string | null;
  internet_provider: string | null;
  internet_plan: string | null;
  internet_cost: number | null;
  electricity_provider: string | null;
  electricity_tariff: string | null;
  electricity_monthly_limit: number | null;
  water_monthly_limit: number | null;
  streaming_owner_cost: number | null;
  streaming_charged_to_tenant: number | null;
  cleaning_owner_cost: number | null;
  cleaning_charged_to_tenant: number | null;
  welcome_basket: boolean | null;
  welcome_basket_amount: number | null;
  welcome_basket_contents: string | null;
  ac_service_by: string | null;
  solar_service_by: string | null;
  pest_control_by: string | null;
  pest_control_frequency: string | null;
  heat_pump_service_by: string | null;
  solar_panels_service_by: string | null;
  annual_services_notes: string | null;
  parking_included: boolean | null;
  parking_extra: boolean | null;
  parking_extra_price: number | null;
  parking_type: string | null;
  parking_has_electricity: boolean | null;
  parking_notes: string | null;
  ac_service_frequency: string | null;
  solar_service_frequency: string | null;
  heat_pump_service_frequency: string | null;
  solar_panels_service_frequency: string | null;
  prepay_option: boolean | null;
  prepay_months: number | null;
  prepay_discount_pct: number | null;
  prepay_invested: boolean | null;
  prepay_invest_rate: number | null;
  prepay_invest_type: string | null;
  prepay_invest_term: string | null;
  deposit_invest_rate: number | null;
  deposit_invest_type: string | null;
  deposit_invest_term: string | null;
  all_inclusive: boolean | null;
  kwh_price: number | null;
  e_payment: boolean | null;
  streaming: Json | null;
  cleaning: Json | null;
  extra_perks: string | null;
  deposit_returned: boolean | null;
  deposit_return_date: string | null;
  deposit_invested: boolean | null;
  phone_work: string | null;
  id_doc_type: string | null;
  id_doc_number: string | null;
  iban: string | null;
  lease_type: string | null;
  custom_lease_days: number | null;
  payment_frequency: string | null;
  deposit_amount: number | null;
  lease_category: string | null;
  rent_due_day: number | null;
  deposit_method: string | null;
  deposit_paid_on: string | null;
  move_out_date: string | null;
  ac_service_owner_pct: number | null;
  solar_service_owner_pct: number | null;
  heat_pump_service_owner_pct: number | null;
  solar_panels_service_owner_pct: number | null;
  pest_control_owner_pct: number | null;
  furnishing: string | null;
  rent_iban: string | null;
  created_at: string | null;
  pending_rent: number | null;
  pending_rent_from: string | null;
}

export interface UserFeedbackRow {
  id: string;
  user_id: string;
  email: string | null;
  body: string;
  word_count: number;
  target: string;
  campaign_id: string | null;
  in_pool: boolean;
  created_at: string;
}

export interface UserPropertiesRow {
  id: string;
  user_id: string;
  name: string;
  prop_type: string;
  address: string | null;
  sqm: number;
  ownership: number;
  created_at: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  obj_value: number | null;
  enfia: number | null;
  insurance_company: string | null;
  insurance_amount: number | null;
  insurance_expiry: string | null;
  pea_class: string | null;
  year_built: number | null;
  atak: string | null;
  floor: string | null;
  heating: string | null;
  status: string | null;
  notes: string | null;
  target_rent: number | null;
  status_detail: string | null;
  postal_code: string | null;
  value: number | null;
  parking_spaces: number | null;
  storage_sqm: number | null;
  bedrooms: number | null;
  rental_mode: string | null;
  client_id: string | null;
  co_owners: Json | null;
  ama: string | null;
  ama_listed_confirmed_at: string | null;
}

/** Όνομα πίνακα → τύπος γραμμής, για γενικούς βοηθούς. */
export interface Tables {
  account_deletion_incidents: AccountDeletionIncidentsRow;
  accountant_clients: AccountantClientsRow;
  accountant_dossier: AccountantDossierRow;
  accountant_links: AccountantLinksRow;
  accountant_requests: AccountantRequestsRow;
  activity_log: ActivityLogRow;
  ai_budget: AiBudgetRow;
  ai_usage: AiUsageRow;
  airbnb_bookings: AirbnbBookingsRow;
  app_admins: AppAdminsRow;
  bank_connection_refs: BankConnectionRefsRow;
  bank_connections: BankConnectionsRow;
  bank_rates: BankRatesRow;
  bank_transactions: BankTransactionsRow;
  billing_profiles: BillingProfilesRow;
  bills: BillsRow;
  bills_history: BillsHistoryRow;
  bills_settings: BillsSettingsRow;
  book_closings: BookClosingsRow;
  calendar_events: CalendarEventsRow;
  calendar_feed_tokens: CalendarFeedTokensRow;
  category_hints: CategoryHintsRow;
  checkin_links: CheckinLinksRow;
  checklist_items: ChecklistItemsRow;
  client_documents: ClientDocumentsRow;
  client_notes: ClientNotesRow;
  client_stays: ClientStaysRow;
  clients: ClientsRow;
  contacts: ContactsRow;
  cron_secrets: CronSecretsRow;
  email_campaigns: EmailCampaignsRow;
  email_marketing_prefs: EmailMarketingPrefsRow;
  email_outbox: EmailOutboxRow;
  email_recipients: EmailRecipientsRow;
  energy_tariffs: EnergyTariffsRow;
  expenses: ExpensesRow;
  feedback_campaign_winners: FeedbackCampaignWinnersRow;
  guest_checkins: GuestCheckinsRow;
  ical_feeds: IcalFeedsRow;
  inbound_mailboxes: InboundMailboxesRow;
  inbound_messages: InboundMessagesRow;
  inventory: InventoryRow;
  inventory_handovers: InventoryHandoversRow;
  inventory_items: InventoryItemsRow;
  inventory_maintenance: InventoryMaintenanceRow;
  inventory_repairs: InventoryRepairsRow;
  invoice_counters: InvoiceCountersRow;
  invoices: InvoicesRow;
  issued_documents: IssuedDocumentsRow;
  loan_programs: LoanProgramsRow;
  loans: LoansRow;
  maintenance_requests: MaintenanceRequestsRow;
  maintenance_tasks: MaintenanceTasksRow;
  market_rates: MarketRatesRow;
  mobile_waitlist: MobileWaitlistRow;
  notification_log: NotificationLogRow;
  notification_preferences: NotificationPreferencesRow;
  onboarding_progress: OnboardingProgressRow;
  organization_members: OrganizationMembersRow;
  organizations: OrganizationsRow;
  portal_links: PortalLinksRow;
  portal_pin_attempts: PortalPinAttemptsRow;
  pricing_settings: PricingSettingsRow;
  product_updates: ProductUpdatesRow;
  property_data: PropertyDataRow;
  property_documents: PropertyDocumentsRow;
  property_settings: PropertySettingsRow;
  push_subscriptions: PushSubscriptionsRow;
  referral_codes: ReferralCodesRow;
  referral_partners: ReferralPartnersRow;
  referral_rewards: ReferralRewardsRow;
  referrals: ReferralsRow;
  rent_comparables: RentComparablesRow;
  rent_config: RentConfigRow;
  rent_payments: RentPaymentsRow;
  report_branding: ReportBrandingRow;
  send_quota: SendQuotaRow;
  tenant_comm_log: TenantCommLogRow;
  tenant_damages: TenantDamagesRow;
  tenants: TenantsRow;
  user_feedback: UserFeedbackRow;
  user_properties: UserPropertiesRow;
}
