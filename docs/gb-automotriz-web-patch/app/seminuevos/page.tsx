import Link from "next/link";
import { getInventory } from "@/lib/inventory";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function SeminuevosPage() {
  const { vehicles, updatedAt } = await getInventory();
  const available = vehicles.filter((v) => (v.status ?? "available") !== "sold");

  return (
    <main style={{ padding: "32px 16px", maxWidth: 1120, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Seminuevos</h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Inventario actualizado: {new Date(updatedAt).toLocaleString("es-MX")}
      </p>

      {available.length === 0 ? (
        <div style={{ padding: 32, border: "1px dashed #e5e7eb", borderRadius: 8, color: "#6b7280" }}>
          Aún no hay unidades publicadas. Vuelve pronto.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {available.map((v) => (
            <Link
              key={v.slug}
              href={`/cars/${v.slug}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                overflow: "hidden",
                background: "#fff",
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {v.image ? (
                <img
                  src={v.image}
                  alt={`${v.brand} ${v.model}`}
                  style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover" }}
                />
              ) : (
                <div style={{ width: "100%", aspectRatio: "4/3", background: "#f3f4f6" }} />
              )}
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase" }}>{v.brand}</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  {v.model} {v.year}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{v.price}</div>
                {v.location ? <div style={{ fontSize: 12, color: "#6b7280" }}>{v.location}</div> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
