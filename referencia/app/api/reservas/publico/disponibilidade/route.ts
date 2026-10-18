// GET /api/reservas/publico/disponibilidade?loja=<uuid>&mes=YYYY-MM&pessoas=N
// Nome da casa + config resumida + dias do mês com vaga pro grupo.
import { NextResponse } from "next/server";
import { LIMITES, barrarSeExcedeu } from "@/lib/reservas/acesso";
import { createAdminClient, diasDoMes, erroPublico, obterOuCriarConfig } from "@/lib/reservas/banco";
import { agoraNoFuso } from "@/lib/reservas/regras";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES_RE = /^\d{4}-\d{2}$/;

export async function GET(request: Request) {
  const barrado = barrarSeExcedeu(request, "reserva-consulta", LIMITES.consulta);
  if (barrado) return barrado;

  const url = new URL(request.url);
  const hoje = agoraNoFuso().hojeIso;
  const lojaId = url.searchParams.get("loja") ?? "";
  const mes = url.searchParams.get("mes") ?? hoje.slice(0, 7);
  const pessoas = Math.max(1, Number(url.searchParams.get("pessoas")) || 1);
  if (!UUID_RE.test(lojaId) || !MES_RE.test(mes)) {
    return NextResponse.json({ error: "parâmetros inválidos" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: loja } = await admin.from("lojas").select("nome").eq("id", lojaId).maybeSingle();
    if (!loja) return NextResponse.json({ error: "loja não encontrada" }, { status: 404 });

    const config = await obterOuCriarConfig(admin, lojaId);
    return NextResponse.json({
      loja: { nome: loja.nome },
      config: {
        ativo: config.ativo,
        max_pessoas: config.max_pessoas,
        whatsapp: config.whatsapp,
        tolerancia_min: config.tolerancia_min,
        mensagem: config.mensagem,
      },
      mes,
      hoje,
      dias: config.ativo ? await diasDoMes(admin, lojaId, config, mes, pessoas) : [],
    });
  } catch (error) {
    return NextResponse.json({ error: erroPublico("disponibilidade", error) }, { status: 500 });
  }
}
