"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Property, PropertyData } from "@/lib/types";
import { T, Card, SecHdr, KPIGrid, type KPIItem } from "@/components/Theme";

interface Props {
  property: Property;
  userId: string;
}

function InfoRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "12px 0",
        borderBottom: last ? "none" : "1px solid var(--border-subtle)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontFamily: T.font.mono,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "var(--text-primary)",
          textAlign: "right",
          maxWidth: "60%",
          fontFamily: T.font.mono,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function TabOverview({ property, userId }: Props) {
  const [propData, setPropData] = useState<PropertyData | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("property_data")
      .select("*")
      .eq("user_id", userId)
      .filter("data->>property_id", "eq", property.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPropData(data as PropertyData);
      });
  }, [property.id, userId]);

  const value = propData?.data?.value;
  const ownedValue =
    value ? (value * property.ownership) / 100 : null;
  const expenses = propData?.data?.expenses ?? [];
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const kpis: KPIItem[] = [
    { label: "Εμβαδόν", value: `${property.sqm} τ.μ.` },
    { label: "Ιδιοκτησία", value: `${property.ownership}%` },
    value
      ? {
          label: "Αξία",
          value: `€${value.toLocaleString("el-GR")}`,
          sub: ownedValue
            ? `Δικό σας: €${Math.round(ownedValue).toLocaleString("el-GR")}`
            : undefined,
        }
      : { label: "Αξία", value: "—", sub: "Δεν έχει οριστεί" },
    {
      label: "Δαπάνες",
      value: `€${totalExpenses.toLocaleString("el-GR")}`,
      sub: "Συνολικά",
    },
  ];

  const infoRows: { label: string; value: string }[] = [
    { label: "Τύπος", value: property.prop_type },
    { label: "Διεύθυνση", value: property.address || "Δεν έχει οριστεί" },
    { label: "Εμβαδόν", value: `${property.sqm} τ.μ.` },
    { label: "Ποσοστό ιδιοκτησίας", value: `${property.ownership}%` },
    ...(value
      ? [
          {
            label: "Εκτιμώμενη αξία",
            value: `€${value.toLocaleString("el-GR")}`,
          },
        ]
      : []),
  ];

  return (
    <div>
      {/* Property title */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: T.font.sans,
            fontWeight: 800,
            fontSize: 28,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {property.name}
        </h1>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            marginTop: 4,
            letterSpacing: "0.06em",
            fontFamily: T.font.mono,
          }}
        >
          {property.prop_type}
          {property.address ? ` · ${property.address}` : ""}
        </p>
      </div>

      {/* Stats grid */}
      <KPIGrid items={kpis} columns={4} />

      {/* Details */}
      <Card>
        <SecHdr label="Στοιχεία Ακινήτου" />
        {infoRows.map((r, i) => (
          <InfoRow
            key={r.label}
            label={r.label}
            value={r.value}
            last={i === infoRows.length - 1}
          />
        ))}
      </Card>

      {/* Ownership bar */}
      <Card>
        <SecHdr label="Ποσοστό Ιδιοκτησίας" />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              flex: 1,
              height: 8,
              background: "var(--bg-elevated)",
              borderRadius: T.radius.pill,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "var(--accent)",
                borderRadius: T.radius.pill,
                transition: "all 0.25s cubic-bezier(0.2,0,0,1)",
                width: `${property.ownership}%`,
              }}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              color: "var(--accent)",
              fontWeight: 600,
              width: 48,
              textAlign: "right",
              fontFamily: T.font.mono,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {property.ownership}%
          </span>
        </div>
        {property.ownership < 100 && (
          <p
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              marginTop: 8,
              fontFamily: T.font.mono,
            }}
          >
            Υπόλοιπο {100 - property.ownership}% ανήκει σε άλλους ιδιοκτήτες
          </p>
        )}
      </Card>
    </div>
  );
}
