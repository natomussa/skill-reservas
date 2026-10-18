// PATCH /api/reservas/status {id, status, mesa?}: recepção muda o estado de uma reserva.
// "levantou" não é status gravado: mantém "sentou" e marca levantou_em (mesa liberada).
import { NextResponse } from "next/server";
import { exigir } from "@/lib/reservas/acesso";
import { createAdminClient } from "@/lib/reservas/banco";

export const dynamic = "force-dynamic";

const STATUS_VALIDOS = ["confirmada", "sentou", "nao_veio", "cancelada", "levantou"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const patch =
    status === "levantou" ? { levantou_em: agora, atualizado_em: agora }
    : status === "sentou" ? { status, mesa, levantou_em: null, atualizado_em: agora }
    : { status, mesa: null, levantou_em: null, atualizado_em: agora };

  const { data, error } = await createAdminClient()
    .from("reservas")
    .update(patch)
    .eq("id", id)
    .eq("loja_id", s.lojaId) // trava na loja da sessão: id de outra loja vira 404
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[reservas] status:", error);
    return NextResponse.json({ error: "erro ao salvar" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "reserva não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
