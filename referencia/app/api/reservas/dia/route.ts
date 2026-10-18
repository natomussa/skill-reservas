// GET /api/reservas/dia?data=YYYY-MM-DD: painel da recepção: reservas do dia + totais.
import { NextResponse } from "next/server";
import { exigir } from "@/lib/reservas/acesso";
import { createAdminClient, obterOuCriarConfig } from "@/lib/reservas/banco";
import { agoraNoFuso, horaParaMin, reservaCaiu } from "@/lib/reservas/regras";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const s = await exigir("ver");
  if (s instanceof NextResponse) return s;

  const agora = agoraNoFuso();
  const data = new URL(request.url).searchParams.get("data") ?? agora.hojeIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: "data inválida" }, { status: 400 });

  try {
    const admin = createAdminClient();
    const config = await obterOuCriarConfig(admin, s.lojaId);
    const { data: rows, error } = await admin
      .from("reservas")
      .select("*")
      .eq("loja_id", s.lojaId)
      .eq("data", data)
      .order("horario")
      .order("criado_em");
    if (error) throw error;

    // "caiu" é derivado na leitura: confirmada que passou do horário + tolerância
    const reservas = (rows ?? []).map((r) => ({ ...r, caiu: reservaCaiu(r, agora, config.tolerancia_min) }));
    const ativas = reservas.filter((r) => (r.status === "confirmada" && !r.caiu) || r.status === "sentou");

    const porHora = new Map<string, number>();
    for (const r of ativas) porHora.set(r.horario, (porHora.get(r.horario) ?? 0) + Number(r.pessoas));
    let pico: string | null = null;
    for (const [hora, qtd] of porHora) {
      const qPico = pico ? porHora.get(pico)! : -1;
      if (qtd > qPico || (qtd === qPico && horaParaMin(hora) < horaParaMin(pico!))) pico = hora;
    }

    return NextResponse.json({
      data,
      hoje: agora.hojeIso,
      reservas,
      totais: { reservas: ativas.length, pessoas: ativas.reduce((t, r) => t + Number(r.pessoas), 0), pico },
      config: {
        ativo: config.ativo,
        max_pessoas: config.max_pessoas,
        tolerancia_min: config.tolerancia_min,
        whatsapp: config.whatsapp,
      },
    });
  } catch (error) {
    console.error("[reservas] dia:", error);
    return NextResponse.json({ error: "erro ao carregar o dia" }, { status: 500 });
  }
}
