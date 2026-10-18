// /api/reservas/publico/minha: cliente vê (GET), altera (PATCH) e cancela (DELETE) pelo código, sem login.
// O código é a única credencial: rate limit em tudo e nunca devolver telefone.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIMITES, barrarSeExcedeu } from "@/lib/reservas/acesso";
import { createAdminClient, erroPublico, obterOuCriarConfig, ocupacaoDoDia } from "@/lib/reservas/banco";
import { agoraNoFuso, ehCodigoReservaValido, slotEstourou, slotsDoDia } from "@/lib/reservas/regras";

export const dynamic = "force-dynamic";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;

async function acharReserva(admin: SupabaseClient, codigo: string) {
  const { data, error } = await admin
    .from("reservas")
    .select("id, loja_id, codigo, data, horario, pessoas, nome, observacao, status, lojas(nome)")
    .eq("codigo", codigo)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const naoAchou = () => NextResponse.json({ error: "reserva não encontrada" }, { status: 404 });
const codigoDe = (v: unknown) => String(v ?? "").toUpperCase().trim();

export async function GET(request: Request) {
  const barrado = barrarSeExcedeu(request, "reserva-consulta", LIMITES.consulta);
  if (barrado) return barrado;

  const codigo = codigoDe(new URL(request.url).searchParams.get("codigo"));
  if (!ehCodigoReservaValido(codigo)) return NextResponse.json({ error: "código inválido" }, { status: 400 });

  try {
    const admin = createAdminClient();
    const r = await acharReserva(admin, codigo);
    if (!r) return naoAchou();
    const config = await obterOuCriarConfig(admin, r.loja_id);
    return NextResponse.json({
      reserva: {
        codigo: r.codigo, data: r.data, horario: r.horario, pessoas: r.pessoas,
        nome: r.nome, observacao: r.observacao, status: r.status, loja_id: r.loja_id,
        loja_nome: (r.lojas as { nome?: string } | null)?.nome ?? "",
      },
      config: { max_pessoas: config.max_pessoas, tolerancia_min: config.tolerancia_min, whatsapp: config.whatsapp },
    });
  } catch (error) {
    return NextResponse.json({ error: erroPublico("ver reserva", error) }, { status: 500 });
  }
}

/** Altera data/horário/pessoas revalidando a lotação. */
export async function PATCH(request: Request) {
  const barrado = barrarSeExcedeu(request, "reserva-alterar", LIMITES.alterar);
  if (barrado) return barrado;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const codigo = codigoDe(body.codigo);
  const data = String(body.data ?? "");
  const horario = String(body.horario ?? "");
  const pessoas = Math.floor(Number(body.pessoas) || 0);
  if (!ehCodigoReservaValido(codigo) || !DATA_RE.test(data) || !HORA_RE.test(horario) || pessoas < 1) {
    return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const r = await acharReserva(admin, codigo);
    if (!r) return naoAchou();
    if (r.status !== "confirmada") {
      return NextResponse.json({ error: "essa reserva não pode mais ser alterada; faça uma nova" }, { status: 409 });
    }

    const config = await obterOuCriarConfig(admin, r.loja_id);
    if (!config.ativo) {
      return NextResponse.json({ error: "as reservas online estão fechadas no momento" }, { status: 409 });
    }
    if (pessoas > config.max_pessoas) {
      return NextResponse.json({ error: "acima do teto", whatsapp: config.whatsapp }, { status: 409 });
    }

    const ocupacao = await ocupacaoDoDia(admin, r.loja_id, data);
    // a própria reserva não disputa lugar consigo mesma
    if (r.data === data) ocupacao.set(r.horario, Math.max(0, (ocupacao.get(r.horario) ?? 0) - r.pessoas));
    const slot = slotsDoDia(config, ocupacao, data, pessoas, agoraNoFuso()).find((s) => s.hora === horario);
    if (!slot || slot.estado === "lotado") {
      return NextResponse.json({ error: "esse horário não tem vaga pra esse grupo, escolha outro" }, { status: 409 });
    }

    const salvar = (v: { data: string; horario: string; pessoas: number }) =>
      admin.from("reservas").update({ ...v, atualizado_em: new Date().toISOString() }).eq("id", r.id);
    const { error } = await salvar({ data, horario, pessoas });
    if (error) throw error;

    // corrida: estourou depois de gravar, volta pro que era
    if (slotEstourou(config, await ocupacaoDoDia(admin, r.loja_id, data), horario)) {
      await salvar({ data: r.data, horario: r.horario, pessoas: r.pessoas });
      return NextResponse.json({ error: "esse horário acabou de lotar, escolha outro" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: erroPublico("alterar reserva", error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const barrado = barrarSeExcedeu(request, "reserva-alterar", LIMITES.alterar);
  if (barrado) return barrado;

  const codigo = codigoDe(new URL(request.url).searchParams.get("codigo"));
  if (!ehCodigoReservaValido(codigo)) return NextResponse.json({ error: "código inválido" }, { status: 400 });

  try {
    const admin = createAdminClient();
    const r = await acharReserva(admin, codigo);
    if (!r) return naoAchou();
    const { error } = await admin
      .from("reservas")
      .update({ status: "cancelada", atualizado_em: new Date().toISOString() })
      .eq("id", r.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: erroPublico("cancelar reserva", error) }, { status: 500 });
  }
}
