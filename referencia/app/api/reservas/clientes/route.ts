// GET /api/reservas/clientes: CRM da casa, derivado (sem tabela própria):
// reservas + passantes com telefone, agrupados por telefone. Só gerência.
import { NextResponse } from "next/server";
import { exigir } from "@/lib/reservas/acesso";
import { createAdminClient } from "@/lib/reservas/banco";
import { agoraNoFuso } from "@/lib/reservas/regras";

export const dynamic = "force-dynamic";

type Cliente = {
  nome: string;
  telefone: string;
  nascimento: string | null;
  reservas: number; // não canceladas
  visitas: number; // sentou
  primeira: string;
  ultima: string;
};

export async function GET() {
  const s = await exigir("crm");
  if (s instanceof NextResponse) return s;

  try {
    const admin = createAdminClient();
    const [reservas, fila] = await Promise.all([
      admin.from("reservas").select("nome, telefone, nascimento, data, status")
        .eq("loja_id", s.lojaId).order("criado_em", { ascending: false }).limit(3000),
      admin.from("fila_espera").select("nome, telefone, status, criado_em")
        .eq("loja_id", s.lojaId).not("telefone", "is", null).order("criado_em", { ascending: false }).limit(2000),
    ]);
    if (reservas.error) throw reservas.error;
    if (fila.error) throw fila.error;

    const porTelefone = new Map<string, Cliente>();
    const somar = (r: { nome: string; telefone: string; nascimento?: string | null; dia: string; reserva: boolean; sentou: boolean; cancelada: boolean }) => {
      const chave = r.telefone.replace(/\D/g, "");
      if (chave.length < 8) return;
      const c = porTelefone.get(chave);
      if (!c) {
        // vem da mais recente pra mais antiga: o primeiro nome visto é o mais novo
        porTelefone.set(chave, {
          nome: r.nome, telefone: r.telefone, nascimento: r.nascimento ?? null,
          reservas: r.reserva && !r.cancelada ? 1 : 0, visitas: r.sentou ? 1 : 0,
          primeira: r.dia, ultima: r.dia,
        });
        return;
      }
      if (!c.nascimento && r.nascimento) c.nascimento = r.nascimento;
      if (r.reserva && !r.cancelada) c.reservas += 1;
      if (r.sentou) c.visitas += 1;
      if (r.dia < c.primeira) c.primeira = r.dia;
      if (r.dia > c.ultima) c.ultima = r.dia;
    };

    for (const r of reservas.data ?? []) {
      somar({ ...r, dia: r.data, reserva: true, sentou: r.status === "sentou", cancelada: r.status === "cancelada" });
    }
    for (const f of fila.data ?? []) {
      somar({ nome: f.nome, telefone: f.telefone!, dia: String(f.criado_em).slice(0, 10), reserva: false, sentou: f.status === "sentou", cancelada: false });
    }

    const mes = agoraNoFuso().hojeIso.slice(5, 7);
    const clientes = [...porTelefone.values()]
      .filter((c) => c.reservas > 0 || c.visitas > 0)
      .map((c) => ({ ...c, aniversarianteDoMes: c.nascimento?.slice(5, 7) === mes }))
      .sort((a, b) => (a.ultima < b.ultima ? 1 : -1));

    return NextResponse.json({ clientes, total: clientes.length });
  } catch (error) {
    console.error("[reservas] clientes:", error);
    return NextResponse.json({ error: "erro ao carregar clientes" }, { status: 500 });
  }
}
