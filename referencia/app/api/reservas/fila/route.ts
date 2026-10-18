// /api/reservas/fila: fila de espera do passante (chegou sem reserva).
// GET lista, POST adiciona, PATCH muda status. "levantou" mantém "sentou" e marca levantou_em.
import { NextResponse } from "next/server";
import { exigir } from "@/lib/reservas/acesso";
import { createAdminClient } from "@/lib/reservas/banco";
import { agoraNoFuso, inicioDoDiaUtc } from "@/lib/reservas/regras";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_VALIDOS = ["esperando", "chamado", "sentou", "desistiu", "levantou"];

function falhou(contexto: string, error: unknown) {
  console.error(`[reservas] fila ${contexto}:`, error);
  return NextResponse.json({ error: "erro na fila de espera" }, { status: 500 });
}

/** Abertos (esperando + chamados) por ordem de chegada; finalizados de hoje no fim. */
export async function GET() {
  const s = await exigir("ver");
  if (s instanceof NextResponse) return s;

  try {
    const admin = createAdminClient();
    const [abertos, fechados] = await Promise.all([
      admin.from("fila_espera").select("*").eq("loja_id", s.lojaId)
        .in("status", ["esperando", "chamado"]).order("criado_em"),
      admin.from("fila_espera").select("*").eq("loja_id", s.lojaId)
        .in("status", ["sentou", "desistiu"]).gte("criado_em", inicioDoDiaUtc(agoraNoFuso().hojeIso))
        .order("atualizado_em", { ascending: false }).limit(50),
    ]);
    if (abertos.error) throw abertos.error;
    if (fechados.error) throw fechados.error;

    const esperando = (abertos.data ?? []).filter((f) => f.status === "esperando");
    return NextResponse.json({
      abertos: abertos.data ?? [],
      fechados: fechados.data ?? [],
      totais: { grupos: esperando.length, pessoas: esperando.reduce((t, f) => t + Number(f.pessoas), 0) },
      agora: new Date().toISOString(), // front calcula "esperando há X min" com o relógio do servidor
    });
  } catch (error) {
    return falhou("GET", error);
  }
}

export async function POST(request: Request) {
  const s = await exigir("ver");
  if (s instanceof NextResponse) return s;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const nome = String(body.nome ?? "").trim().slice(0, 80);
  const pessoas = Math.floor(Number(body.pessoas) || 0);
  if (nome.length < 2) return NextResponse.json({ error: "informe o nome" }, { status: 400 });
  if (pessoas < 1 || pessoas > 50) return NextResponse.json({ error: "quantidade de pessoas inválida" }, { status: 400 });

  try {
    const { data, error } = await createAdminClient()
      .from("fila_espera")
      .insert({
        loja_id: s.lojaId,
        nome,
        pessoas,
        telefone: String(body.telefone ?? "").trim().slice(0, 24) || null,
        observacao: String(body.observacao ?? "").trim().slice(0, 240) || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    return falhou("POST", error);
  }
}

export async function PATCH(request: Request) {
  const s = await exigir("ver");
  if (s instanceof NextResponse) return s;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  const mesa = Number.isInteger(Number(body.mesa)) && Number(body.mesa) > 0 ? Number(body.mesa) : null;
  if (!UUID_RE.test(id) || !STATUS_VALIDOS.includes(status)) {
    return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  }

  const agora = new Date().toISOString();
  let patch: Record<string, unknown>;
  if (status === "levantou") patch = { levantou_em: agora, atualizado_em: agora };
  else if (status === "sentou") patch = { status, mesa, levantou_em: null, atualizado_em: agora };
  else {
    patch = { status, mesa: null, levantou_em: null, atualizado_em: agora };
    if (status === "chamado") patch.chamado_em = agora;
    if (status === "esperando") patch.chamado_em = null;
  }

  try {
    const { data, error } = await createAdminClient()
      .from("fila_espera")
      .update(patch)
      .eq("id", id)
      .eq("loja_id", s.lojaId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return falhou("PATCH", error);
  }
}
