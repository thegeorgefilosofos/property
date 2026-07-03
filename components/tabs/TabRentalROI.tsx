"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Property, PropertyData, RentalInfo } from "@/lib/types";
import { T, Card, KPIGrid, EmptyState, type KPIItem } from "@/components/Theme";

interface Props {
  property: Property;
  userId: string;
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

  const labelStyle: CSSProperties = {
    fontSize: 11,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 6,
    fontFamily: T.font.mono,
  };
  const inputStyle: CSSProperties = {
    width: "100%",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: T.radius.inner,
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: 12,
    fontFamily: T.font.mono,
    outline: "none",
  };

  const kpis: KPIItem[] = [
    {
      label: "Μηνιαίο Ενοίκιο",
      value: rental.monthlyRent
        ? `€${rental.monthlyRent.toLocaleString("el-GR")}`
        : "—",
    },
    {
      label: "Ετήσιο Εισόδημα",
      value: annualRent ? `€${annualRent.toLocaleString("el-GR")}` : "—",
      sub:
        ownedAnnualRent && property.ownership < 100
          ? `Δικό σας: €${Math.round(ownedAnnualRent).toLocaleString("el-GR")}`
          : undefined,
    },
    {
      label: "Μικτή Απόδοση",
      value: grossROI ? `${grossROI}%` : "—",
      sub: !value ? "Ορίστε αξία στο Overview" : undefined,
      tone: grossROI ? "accent" : undefined,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h2
          style={{
            fontFamily: T.font.sans,
            fontWeight: 800,
            fontSize: 22,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Ενοίκιο & ROI
        </h2>
        <button
          onClick={() => setEditing((v) => !v)}
          style={{
            fontSize: 11,
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
            padding: "6px 12px",
            borderRadius: T.radius.inner,
            background: "transparent",
            cursor: "pointer",
            fontFamily: T.font.mono,
          }}
        >
          {editing ? "Ακύρωση" : "Επεξεργασία"}
        </button>
      </div>

      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            padding: "4px 12px",
            borderRadius: T.radius.pill,
            border: `1px solid ${
              rental.isRented ? "var(--positive-border)" : "var(--border-subtle)"
            }`,
            background: rental.isRented
              ? "var(--positive-soft)"
              : "var(--bg-elevated)",
            color: rental.isRented ? "var(--positive)" : "var(--text-secondary)",
            fontFamily: T.font.mono,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: rental.isRented
                ? "var(--positive)"
                : "var(--text-tertiary)",
            }}
          />
          {rental.isRented ? "Ενοικιαζόμενο" : "Μη ενοικιαζόμενο"}
        </span>
      </div>

      {editing ? (
        <form
          onSubmit={handleSave}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: T.radius.card,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
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
              checked={form.isRented}
              onChange={(e) =>
                setForm((f) => ({ ...f, isRented: e.target.checked }))
              }
              style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
            />
            <span
              style={{
                fontSize: 12,
                color: "var(--text-primary)",
                fontFamily: T.font.mono,
              }}
            >
              Το ακίνητο είναι ενοικιαζόμενο
            </span>
          </label>

          {form.isRented && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div>
                  <label style={labelStyle}>Μηνιαίο Ενοίκιο (€)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.monthlyRent}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, monthlyRent: e.target.value }))
                    }
                    style={inputStyle}
                    placeholder="800"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Όνομα Ενοικιαστή</label>
                  <input
                    value={form.tenantName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tenantName: e.target.value }))
                    }
                    style={inputStyle}
                    placeholder="Προαιρετικό"
                  />
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div>
                  <label style={labelStyle}>Έναρξη Μίσθωσης</label>
                  <input
                    type="date"
                    value={form.leaseStart}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leaseStart: e.target.value }))
                    }
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Λήξη Μίσθωσης</label>
                  <input
                    type="date"
                    value={form.leaseEnd}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leaseEnd: e.target.value }))
                    }
                    style={inputStyle}
                  />
                </div>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                flex: 1,
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                fontSize: 12,
                padding: "8px 0",
                borderRadius: T.radius.inner,
                background: "transparent",
                cursor: "pointer",
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
                fontFamily: T.font.mono,
              }}
            >
              {saving ? "Αποθήκευση…" : "Αποθήκευση"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* Metrics */}
          <KPIGrid items={kpis} columns={3} />

          {rental.isRented && (
            <div
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: T.radius.card,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <h3
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  margin: 0,
                  fontFamily: T.font.mono,
                }}
              >
                Στοιχεία Μίσθωσης
              </h3>
              {rental.tenantName && (
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      fontFamily: T.font.mono,
                    }}
                  >
                    Ενοικιαστής
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-primary)",
                      fontFamily: T.font.mono,
                    }}
                  >
                    {rental.tenantName}
                  </span>
                </div>
              )}
              {rental.leaseStart && (
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      fontFamily: T.font.mono,
                    }}
                  >
                    Έναρξη
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-primary)",
                      fontFamily: T.font.mono,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {rental.leaseStart}
                  </span>
                </div>
              )}
              {rental.leaseEnd && (
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      fontFamily: T.font.mono,
                    }}
                  >
                    Λήξη
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-primary)",
                      fontFamily: T.font.mono,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {rental.leaseEnd}
                  </span>
                </div>
              )}
            </div>
          )}

          {!rental.isRented && (
            <Card>
              <EmptyState
                title="Το ακίνητο δεν είναι αυτή τη στιγμή ενοικιαζόμενο"
                action={
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      fontSize: 11,
                      color: "var(--accent)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: T.font.mono,
                    }}
                  >
                    Ρύθμιση ενοικίασης →
                  </button>
                }
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
