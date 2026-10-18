// /api/reservas/config: GET lê (quem vê o painel), PUT salva (líderes; a Hostess opera, não configura).
import { NextResponse } from "next/server";
import { exigir } from "@/lib/reservas/acesso";
import { createAdminClient, obterOuCriarConfig } from "@/lib/reservas/banco";
import { horaParaMin, type SlotConfig } from "@/lib/reservas/regras";

export const dynamic = "force-dynamic";

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const erro = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
const inteiroEntre = (v: unknown, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export async function GET() {
  const s = await exigir("ver");
  if (s instanceof NextResponse) return s;
  try {
    const config = await obterOuCriarConfig(createAdminClient(), s.lojaId);
    return NextResponse.json({ config, loja_id: s.lojaId, podeEditar: s.podeConfigurar });
  } catch (error) {
    console.error("[reservas] config GET:", error);
    return NextResponse.json({ error: "erro ao carregar a configuração" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const s = await exigir("configurar");
  if (s instanceof NextResponse) return s;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return erro("corpo inválido");
  }

  const maxPessoas = inteiroEntre(body.max_pessoas, 1, 50);
  if (maxPessoas === null) return erro("teto de pessoas inválido");
  const tolerancia = inteiroEntre(body.tolerancia_min, 0, 240);
  const antecedencia = inteiroEntre(body.antecedencia_min, 0, 1440);
  if (tolerancia === null || antecedencia === null) return erro("tempos inválidos");
  const totalMesas = inteiroEntre(body.total_mesas, 1, 500);
  if (totalMesas === null) return erro("total de mesas inválido");

  const dias = Array.isArray(body.dias_semana)
    ? [...new Set((body.dias_semana as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))]
    : [];
  if (dias.length === 0) return erro("escolha pelo menos um dia da semana");

  const slots: SlotConfig[] = (Array.isArray(body.slots) ? (body.slots as SlotConfig[]) : [])
    .filter((x) => x && HORA_RE.test(x.hora ?? "") && Number(x.capacidade) > 0)
    .map((x) => ({ hora: x.hora, capacidade: Math.floor(Number(x.capacidade)) }))
    .sort((a, b) => horaParaMin(a.hora) - horaParaMin(b.hora));
  if (slots.length === 0) return erro("cadastre pelo menos um horário");
  const repetido = slots.find((x, i) => i > 0 && x.hora === slots[i - 1].hora);
  if (repetido) return erro(`horário repetido: ${repetido.hora}`);

  try {
    const admin = createAdminClient();
    await obterOuCriarConfig(admin, s.lojaId); // garante a linha
    const { error } = await admin
      .from("reservas_config")
      .update({
        ativo: Boolean(body.ativo),
        max_pessoas: maxPessoas,
        whatsapp: String(body.whatsapp ?? "").trim() || null,
        tolerancia_min: tolerancia,
        antecedencia_min: antecedencia,
        dias_semana: dias,
        total_mesas: totalMesas,
        slots,
        mensagem: String(body.mensagem ?? "").trim().slice(0, 300) || null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("loja_id", s.lojaId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reservas] config PUT:", error);
    return NextResponse.json({ error: "erro ao salvar a configuração" }, { status: 500 });
  }
}
