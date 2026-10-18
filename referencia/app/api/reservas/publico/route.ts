// POST /api/reservas/publico: cliente cria a reserva sem login. Confirmação automática com lotação.
import { NextResponse } from "next/server";
import { LIMITES, barrarSeExcedeu } from "@/lib/reservas/acesso";
import { createAdminClient, erroPublico, obterOuCriarConfig, ocupacaoDoDia } from "@/lib/reservas/banco";
import {
  agoraNoFuso, formatarDataCurta, gerarCodigoReserva, slotEstourou, slotsDoDia,
} from "@/lib/reservas/regras";
import { enviarConfirmacaoWhatsApp } from "@/lib/reservas/whatsapp";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;

export async function POST(request: Request) {
  // rota aberta que grava no banco e dispara WhatsApp: freia antes de tudo
  const barrado = barrarSeExcedeu(request, "reserva-criar", LIMITES.criar);
  if (barrado) return barrado;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const lojaId = String(body.loja ?? "");
  const data = String(body.data ?? "");
  const horario = String(body.horario ?? "");
  const pessoas = Math.floor(Number(body.pessoas) || 0);
  const nome = String(body.nome ?? "").trim().slice(0, 80);
  const telefone = String(body.telefone ?? "").trim().slice(0, 24);
  const observacao = String(body.observacao ?? "").trim().slice(0, 240) || null;
  const nascimento = String(body.nascimento ?? "").trim() || null;

  if (!UUID_RE.test(lojaId) || !DATA_RE.test(data) || !HORA_RE.test(horario) || pessoas < 1) {
    return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  }
  if (nome.length < 2) return NextResponse.json({ error: "informe seu nome" }, { status: 400 });
  if (telefone.replace(/\D/g, "").length < 10) {
    return NextResponse.json({ error: "informe um WhatsApp válido com DDD" }, { status: 400 });
  }
  if (nascimento && (!DATA_RE.test(nascimento) || Number(nascimento.slice(0, 4)) < 1900 || nascimento >= data)) {
    return NextResponse.json({ error: "data de nascimento inválida" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const config = await obterOuCriarConfig(admin, lojaId);

    if (!config.ativo) {
      return NextResponse.json({ error: "as reservas online estão fechadas no momento" }, { status: 409 });
    }
    if (pessoas > config.max_pessoas) {
      // front leva o cliente pro WhatsApp da casa
      return NextResponse.json({ error: "acima do teto", whatsapp: config.whatsapp }, { status: 409 });
    }

    const slot = slotsDoDia(config, await ocupacaoDoDia(admin, lojaId, data), data, pessoas, agoraNoFuso())
      .find((s) => s.hora === horario);
    if (!slot) {
      return NextResponse.json({ error: "esse horário não está mais disponível, escolha outro" }, { status: 409 });
    }
    if (slot.estado === "lotado") {
      return NextResponse.json({ error: "esse horário acabou de lotar, escolha outro" }, { status: 409 });
    }

    // código único: em colisão (raríssima) tenta de novo
    let reserva: { id: string; codigo: string } | null = null;
    for (let tentativa = 0; tentativa < 4 && !reserva; tentativa += 1) {
      const { data: criada, error } = await admin
        .from("reservas")
        .insert({ loja_id: lojaId, codigo: gerarCodigoReserva(), data, horario, pessoas, nome, telefone, observacao, nascimento })
        .select("id, codigo")
        .single();
      if (criada) reserva = criada;
      else if (error?.code !== "23505") throw error; // só repete em violação de unique
    }
    if (!reserva) throw new Error("não gerou código único");

    // corrida entre dois clientes no último lugar: rechecagem depois do insert, estourou desfaz
    if (slotEstourou(config, await ocupacaoDoDia(admin, lojaId, data), horario)) {
      await admin.from("reservas").delete().eq("id", reserva.id);
      return NextResponse.json({ error: "esse horário acabou de lotar, escolha outro" }, { status: 409 });
    }

    const { data: loja } = await admin.from("lojas").select("nome").eq("id", lojaId).maybeSingle();
    const zapAutomatico = await enviarConfirmacaoWhatsApp({
      telefone, nome, horario, pessoas,
      lojaNome: loja?.nome ?? "casa",
      dataLegivel: formatarDataCurta(data),
      codigo: reserva.codigo,
      linkGerenciar: `${new URL(request.url).origin}/reservar/${lojaId}/r/${reserva.codigo}`,
    });

    return NextResponse.json({
      ok: true,
      codigo: reserva.codigo,
      tolerancia_min: config.tolerancia_min,
      zapAutomatico,
      whatsappCasa: config.whatsapp,
    });
  } catch (error) {
    return NextResponse.json({ error: erroPublico("criar reserva", error) }, { status: 500 });
  }
}
