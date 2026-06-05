"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Property, PropertyData, RentalInfo } from "@/lib/types";

interface Props {
  property: Property;
  userId: string;
}

function MetricCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-5 ${
        highlight
          ? "bg-gold/5 border-gold/30"
          : "bg-elevated border-frame"
      }`}
    >
      <p
        className="text-xs text-ink-muted uppercase tracking-wider mb-2"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </p>
      <p
        className={`text-xl font-semibold ${highlight ? "text-gold" : "text-ink"}`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </p>
      {sub && (
        <p
          className="text-xs text-ink-muted mt-1"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

export default function TabRentalROI({ property, userId }: Props) {
  const [propData, setPropData] = useState<PropertyData | null>(null);
  const [dataId, setDataId] = useState<string | null>(null);
  const [rental, setRental] = useState<RentalInfo>({ isRented: false });
  const [value, setValue] = useState<number | undefined>();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    isRented: false,
    monthlyRent: "",
    tenantName: "",
    leaseStart: "",
    leaseEnd: "",
  });

  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("property_data")
      .select("*")
      .eq("user_id", userId)
      .filter("data->>property_id", "eq", property.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const pd = data as PropertyData;
          setPropData(pd);
          setDataId(pd.id);
          const r = pd.data?.rental ?? { isRented: false };
          setRental(r);
          setValue(pd.data?.value);
          setForm({
            isRented: r.isRented,
            monthlyRent: r.monthlyRent?.toString() ?? "",
            tenantName: r.tenantName ?? "",
            leaseStart: r.leaseStart ?? "",
            leaseEnd: r.leaseEnd ?? "",
          });
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, userId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const newRental: RentalInfo = {
      isRented: form.isRented,
      monthlyRent: form.monthlyRent ? Number(form.monthlyRent) : undefined,
      tenantName: form.tenantName || undefined,
      leaseStart: form.leaseStart || undefined,
      leaseEnd: form.leaseEnd || undefined,
    };

    if (dataId) {
      await supabase
        .from("property_data")
        .update({ data: { ...(propData?.data ?? {}), rental: newRental } })
        .eq("id", dataId);
    } else {
      const { data: newRow } = await supabase
        .from("property_data")
        .insert({
          user_id: userId,
          data: {
            property_id: property.id,
            expenses: [],
            bills: [],
            rental: newRental,
            events: [],
          },
        })
        .select()
        .single();
      if (newRow) {
        setPropData(newRow as PropertyData);
        setDataId(newRow.id);
      }
    }
    setRental(newRental);
    setSaving(false);
    setEditing(false);
  }

  const annualRent = rental.monthlyRent ? rental.monthlyRent * 12 : null;
  const grossROI =
    annualRent && value ? ((annualRent / value) * 100).toFixed(2) : null;
  const ownedAnnualRent =
    annualRent ? (annualRent * property.ownership) / 100 : null;

  const labelClass = "text-xs text-ink-muted uppercase tracking-wider block mb-1.5";
  const inputClass =
    "w-full bg-elevated border border-frame rounded-lg px-3.5 py-2.5 text-ink text-sm focus:outline-none focus:border-gold transition-colors";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink">Ενοίκιο & ROI</h2>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs border border-frame text-ink-muted hover:text-gold hover:border-gold px-3 py-1.5 rounded-lg transition-colors"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {editing ? "Ακύρωση" : "Επεξεργασία"}
        </button>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border ${
            rental.isRented
              ? "text-success border-success/30 bg-success/10"
              : "text-ink-muted border-frame bg-elevated"
          }`}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${rental.isRented ? "bg-success" : "bg-ink-dim"}`}
          />
          {rental.isRented ? "Ενοικιαζόμενο" : "Μη ενοικιαζόμενο"}
        </span>
      </div>

      {editing ? (
        <form
          onSubmit={handleSave}
          className="bg-surface border border-frame rounded-xl p-5 space-y-4"
        >
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isRented}
              onChange={(e) =>
                setForm((f) => ({ ...f, isRented: e.target.checked }))
              }
              className="w-4 h-4 accent-gold"
            />
            <span
              className="text-sm text-ink"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Το ακίνητο είναι ενοικιαζόμενο
            </span>
          </label>

          {form.isRented && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className={labelClass}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Μηνιαίο Ενοίκιο (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.monthlyRent}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, monthlyRent: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="800"
                  />
                </div>
                <div>
                  <label
                    className={labelClass}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Όνομα Ενοικιαστή
                  </label>
                  <input
                    value={form.tenantName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tenantName: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="Προαιρετικό"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className={labelClass}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Έναρξη Μίσθωσης
                  </label>
                  <input
                    type="date"
                    value={form.leaseStart}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leaseStart: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    className={labelClass}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Λήξη Μίσθωσης
                  </label>
                  <input
                    type="date"
                    value={form.leaseEnd}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leaseEnd: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 border border-frame text-ink-muted hover:text-ink text-sm py-2 rounded-lg transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gold hover:bg-gold-light text-canvas text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {saving ? "Αποθήκευση…" : "Αποθήκευση"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard
              label="Μηνιαίο Ενοίκιο"
              value={
                rental.monthlyRent
                  ? `€${rental.monthlyRent.toLocaleString("el-GR")}`
                  : "—"
              }
            />
            <MetricCard
              label="Ετήσιο Εισόδημα"
              value={
                annualRent
                  ? `€${annualRent.toLocaleString("el-GR")}`
                  : "—"
              }
              sub={
                ownedAnnualRent && property.ownership < 100
                  ? `Δικό σας: €${Math.round(ownedAnnualRent).toLocaleString("el-GR")}`
                  : undefined
              }
            />
            <MetricCard
              label="Μικτή Απόδοση"
              value={grossROI ? `${grossROI}%` : "—"}
              sub={!value ? "Ορίστε αξία στο Overview" : undefined}
              highlight={!!grossROI}
            />
          </div>

          {rental.isRented && (
            <div className="bg-surface border border-frame rounded-xl p-5 space-y-3">
              <h3
                className="text-xs text-ink-muted uppercase tracking-wider"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Στοιχεία Μίσθωσης
              </h3>
              {rental.tenantName && (
                <div className="flex justify-between">
                  <span
                    className="text-xs text-ink-muted"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Ενοικιαστής
                  </span>
                  <span
                    className="text-sm text-ink"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {rental.tenantName}
                  </span>
                </div>
              )}
              {rental.leaseStart && (
                <div className="flex justify-between">
                  <span
                    className="text-xs text-ink-muted"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Έναρξη
                  </span>
                  <span
                    className="text-sm text-ink"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {rental.leaseStart}
                  </span>
                </div>
              )}
              {rental.leaseEnd && (
                <div className="flex justify-between">
                  <span
                    className="text-xs text-ink-muted"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Λήξη
                  </span>
                  <span
                    className="text-sm text-ink"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {rental.leaseEnd}
                  </span>
                </div>
              )}
            </div>
          )}

          {!rental.isRented && (
            <div className="bg-surface border border-frame rounded-xl p-6 text-center">
              <p
                className="text-ink-muted text-sm mb-3"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Το ακίνητο δεν είναι αυτή τη στιγμή ενοικιαζόμενο
              </p>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-gold hover:text-gold-light transition-colors"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Ρύθμιση ενοικίασης →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
