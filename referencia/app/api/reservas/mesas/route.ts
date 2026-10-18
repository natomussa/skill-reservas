// GET /api/reservas/mesas: mapa de mesas AGORA: total configurado + ocupadas
// (quem sentou hoje e não levantou), vindo de reservas e da fila de espera.
import { NextResponse } from "next/server";
import { exigir } from "@/lib/reservas/acesso";
import { createAdminClient, obterOuCriarConfig } from "@/lib/reservas/banco";
import { agoraNoFuso, inicioDoDiaUtc } from "@/lib/reservas/regras";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await exigir("ver");
  if (s instanceof NextResponse) return s;

  try {
    const admin = createAdminClient();
    const config = await obterOuCriarConfig(admin, s.lojaId);
    const { hojeIso } = agoraNoFuso();

    const [daReserva, daFila] = await Promise.all([
      admin.from("reservas").select("id, nome, pessoas, mesa")
        .eq("loja_id", s.lojaId).eq("data", hojeIso).eq("status", "sentou")
        .not("mesa", "is", null).is("levantou_em", null),
      admin.from("fila_espera").select("id, nome, pessoas, mesa")
        .eq("loja_id", s.lojaId).eq("status", "sentou").gte("criado_em", inicioDoDiaUtc(hojeIso))
        .not("mesa", "is", null).is("levantou_em", null),
    ]);
    if (daReserva.error) throw daReserva.error;
    if (daFila.error) throw daFila.error;

    const ocupadas = [
      ...(daReserva.data ?? []).map((r) => ({ ...r, origem: "reserva" as const })),
      ...(daFila.data ?? []).map((f) => ({ ...f, origem: "fila" as const })),
    ].sort((a, b) => a.mesa - b.mesa);

    return NextResponse.json({
      total: config.total_mesas,
      ocupadas,
      livres: Math.max(0, config.total_mesas - new Set(ocupadas.map((o) => o.mesa)).size),
    });
  } catch (error) {
    console.error("[reservas] mesas:", error);
    return NextResponse.json({ error: "erro ao carregar as mesas" }, { status: 500 });
  }
}
