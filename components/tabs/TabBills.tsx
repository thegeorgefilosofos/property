"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BILL_TYPES,
  type Bill,
  type Property,
  type PropertyData,
} from "@/lib/types";
import { T, Card, SecHdr, Btn, EmptyState } from "@/components/Theme";

interface Props {
  property: Property;
  userId: string;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function TabBills({ property, userId }: Props) {
  const [propData, setPropData] = useState<PropertyData | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [dataId, setDataId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "ΔΕΗ",
    issuer: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    paid: false,
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
          setPropData(data as PropertyData);
          setDataId(data.id);
          setBills((data as PropertyData).data?.bills ?? []);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, userId]);

  async function saveBills(updated: Bill[]) {
    setSaving(true);
    if (dataId) {
      await supabase
        .from("property_data")
        .update({ data: { ...(propData?.data ?? {}), bills: updated } })
        .eq("id", dataId);
    } else {
      const { data: newRow } = await supabase
        .from("property_data")
        .insert({
          user_id: userId,
          data: {
            property_id: property.id,
            expenses: [],
            bills: updated,
            rental: { isRented: false },
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
    setSaving(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (isNaN(amount) || amount <= 0) return;
    const newBill: Bill = {
      id: genId(),
      type: form.type,
      issuer: form.issuer.trim() || form.type,
      amount,
      date: form.date,
      paid: form.paid,
    };
    const updated = [newBill, ...bills];
    setBills(updated);
    await saveBills(updated);
    setForm({
      type: "ΔΕΗ",
      issuer: "",
      amount: "",
      date: new Date().toISOString().split("T")[0],
      paid: false,
    });
    setShowForm(false);
  }

  async function togglePaid(id: string) {
    const updated = bills.map((b) =>
      b.id === id ? { ...b, paid: !b.paid } : b
    );
    setBills(updated);
    await saveBills(updated);
  }

  async function handleDelete(id: string) {
    const updated = bills.filter((b) => b.id !== id);
    setBills(updated);
    await saveBills(updated);
  }

  const pending = bills.filter((b) => !b.paid);
  const totalPending = pending.reduce((s, b) => s + b.amount, 0);

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 6,
    fontFamily: T.font.mono,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: T.radius.inner,
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: 12,
    fontFamily: T.font.sans,
    outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: T.font.sans,
              fontWeight: 800,
              fontSize: 22,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Λογαριασμοί
          </h2>
          {totalPending > 0 && (
            <p
              style={{
                fontSize: 11,
                color: "var(--negative)",
                marginTop: 2,
                fontFamily: T.font.mono,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {pending.length} εκκρεμείς · €
              {totalPending.toLocaleString("el-GR")}
            </p>
          )}
        </div>
        <Btn variant="primary" onClick={() => setShowForm((v) => !v)}>
          <svg
            style={{ width: 14, height: 14 }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Νέος Λογαριασμός
        </Btn>
      </div>

      {showForm && (
        <Card>
          <SecHdr label="Νέος Λογαριασμός" />
          <form
            onSubmit={handleAdd}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Τύπος</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {BILL_TYPES.map((t) => (
                    <option
                      key={t}
                      value={t}
                      style={{ background: "var(--bg-elevated)" }}
                    >
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Εκδότης</label>
                <input
                  value={form.issuer}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, issuer: e.target.value }))
                  }
                  style={inputStyle}
                  placeholder="Προαιρετικό"
                />
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                gap: 16,
              }}
            >
              <div>
                <label style={labelStyle}>Ποσό (€)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  style={inputStyle}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Ημερομηνία</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  style={inputStyle}
                />
              </div>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={form.paid}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paid: e.target.checked }))
                }
                style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  fontFamily: T.font.mono,
                }}
              >
                Έχει εξοφληθεί
              </span>
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  flex: 1,
                  border: "1px solid var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  padding: "8px 0",
                  borderRadius: T.radius.inner,
                  cursor: "pointer",
                  transition: "color 0.15s",
                  fontFamily: T.font.mono,
                }}
              >
                Ακύρωση
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  flex: 1,
                  background: "var(--accent)",
                  color: "var(--accent-text)",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "8px 0",
                  borderRadius: T.radius.inner,
                  border: "none",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.5 : 1,
                  transition: "all 0.15s",
                  fontFamily: T.font.mono,
                }}
              >
                {saving ? "Αποθήκευση…" : "Προσθήκη"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {bills.length === 0 ? (
        <Card>
          <EmptyState title="Δεν υπάρχουν καταχωρημένοι λογαριασμοί" />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {bills.map((bill) => (
            <div
              key={bill.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: T.radius.card,
                padding: "12px 16px",
                opacity: bill.paid ? 0.6 : 1,
                transition: "all 0.15s",
              }}
            >
              <button
                onClick={() => togglePaid(bill.id)}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: bill.paid
                    ? "1px solid var(--positive)"
                    : "1px solid var(--border-default)",
                  background: bill.paid ? "var(--positive)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {bill.paid && (
                  <svg
                    style={{ width: 12, height: 12, color: "var(--accent-text)" }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      background: "var(--bg-overlay)",
                      padding: "2px 8px",
                      borderRadius: 4,
                      color: "var(--text-secondary)",
                      fontFamily: T.font.mono,
                    }}
                  >
                    {bill.type}
                  </span>
                  {bill.issuer !== bill.type && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: T.font.mono,
                      }}
                    >
                      {bill.issuer}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    marginTop: 2,
                    fontFamily: T.font.mono,
                  }}
                >
                  {bill.date}
                </p>
              </div>

              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  color: bill.paid ? "var(--text-secondary)" : "var(--accent)",
                  fontFamily: T.font.mono,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                €{bill.amount.toLocaleString("el-GR")}
              </span>

              <button
                onClick={() => handleDelete(bill.id)}
                style={{
                  color: "var(--text-tertiary)",
                  marginLeft: 4,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  transition: "color 0.15s",
                  display: "flex",
                }}
              >
                <svg
                  style={{ width: 16, height: 16 }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
