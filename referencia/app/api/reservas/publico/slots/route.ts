// GET /api/reservas/publico/slots?loja=<uuid>&data=YYYY-MM-DD&pessoas=N
// Horários do dia com estado livre / ultimas / lotado e lugares restantes.
import { NextResponse } from "next/server";
import { LIMITES, barrarSeExcedeu } from "@/lib/reservas/acesso";
import { createAdminClient, erroPublico, obterOuCriarConfig, ocupacaoDoDia } from "@/lib/reservas/banco";
import { agoraNoFuso, slotsDoDia } from "@/lib/reservas/regras";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const barrado = barrarSeExcedeu(request, "reserva-consulta", LIMITES.consulta);
  if (barrado) return barrado;

  const url = new URL(request.url);
  const lojaId = url.searchParams.get("loja") ?? "";
  const data = url.searchParams.get("data") ?? "";
  const pessoas = Math.max(1, Number(url.searchParams.get("pessoas")) || 1);
  if (!UUID_RE.test(lojaId) || !DATA_RE.test(data)) {
    return NextResponse.json({ error: "parâmetros inválidos" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const config = await obterOuCriarConfig(admin, lojaId);
    if (!config.ativo) return NextResponse.json({ slots: [] });
    const ocupacao = await ocupacaoDoDia(admin, lojaId, data);
    return NextResponse.json({ slots: slotsDoDia(config, ocupacao, data, pessoas, agoraNoFuso()) });
  } catch (error) {
    return NextResponse.json({ error: erroPublico("slots", error) }, { status: 500 });
  }
}
