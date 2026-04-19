import Link from "next/link";
import { notFound } from "next/navigation";
import { getInventory } from "@/lib/inventory";

export const dynamic = "force-dynamic";
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export default async function CarDetailPage({ params }: Props) {
  const { slug } = await params;
  const { vehicles } = await getInventory();
  const vehicle = vehicles.find((v) => v.slug === slug);
  if (!vehicle) notFound();

  const specEntries = vehicle.specs ? Object.entries(vehicle.specs) : [];

  return (
    <main style={{ padding: "32px 16px", maxWidth: 960, margin: "0 auto" }}>
      <Link href="/seminuevos" style={{ fontSize: 14, color: "#2563eb" }}>
        ← Inventario
      </Link>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginTop: 12 }}>
        {vehicle.brand} {vehicle.model} {vehicle.year}
      </h1>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
        {vehicle.price}
      </div>
      {vehicle.image ? (
        <img
          src={vehicle.image}
          alt={`${vehicle.brand} ${vehicle.model}`}
          style={{ width: "100%", borderRadius: 8, marginBottom: 16 }}
        />
      ) : null}
      {vehicle.description ? <p style={{ fontSize: 16, lineHeight: 1.6 }}>{vehicle.description}</p> : null}
      {vehicle.features && vehicle.features.length > 0 ? (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 24 }}>Características</h2>
          <ul>
            {vehicle.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      ) : null}
      {specEntries.length > 0 ? (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 24 }}>Especificaciones</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {specEntries.map(([key, value]) => (
                <tr key={key} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "8px 0", color: "#6b7280" }}>{key}</td>
                  <td style={{ padding: "8px 0", fontWeight: 500 }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {vehicle.location ? <p style={{ marginTop: 24, color: "#6b7280" }}>Ubicación: {vehicle.location}</p> : null}
      {vehicle.status === "sold" ? (
        <p style={{ marginTop: 16, color: "#b91c1c", fontWeight: 600 }}>Unidad vendida.</p>
      ) : vehicle.status === "reserved" ? (
        <p style={{ marginTop: 16, color: "#d97706", fontWeight: 600 }}>Unidad reservada.</p>
      ) : null}
    </main>
  );
}
