/**
 * Quem pode o quê + freio das rotas públicas.
 * As duas peças dependem do projeto que recebe o módulo: ADAPTAR antes de usar.
 */
import { NextResponse } from "next/server";

/**
 * Cargos que operam a recepção. Exemplo de restaurante; troque pelos papéis do projeto.
 * Regra que vale manter: quem opera a porta (Hostess) não mexe na configuração.
 */
const CARGOS_RECEPCAO = ["Hostess", "Maître", "Chefe de Fila", "Supervisor", "Subgerente", "Gerente"];

export type Nivel = "ver" | "configurar" | "crm";

export function pode(cargo: string | null | undefined, nivel: Nivel): boolean {
  if (!cargo) return false;
  if (nivel === "crm") return cargo === "Gerente"; // telefone de cliente em lista: só a gerência
  if (!CARGOS_RECEPCAO.includes(cargo)) return false;
  return nivel === "ver" || cargo !== "Hostess";
}

type Sessao = { lojaId: string; cargo: string | null; admin?: boolean };

/**
 * ADAPTAR: ler a sessão do projeto (Supabase Auth, NextAuth, Clerk...) e devolver
 * a loja e o cargo de quem está logado. A loja SEMPRE vem da sessão, nunca do body/query.
 */
async function lerSessao(): Promise<Sessao | null> {
  throw new Error("adaptar lerSessao() à autenticação do projeto");
}

/** Para rota interna: devolve a loja da sessão ou a resposta 401/403 pronta. */
export async function exigir(nivel: Nivel): Promise<{ lojaId: string; podeConfigurar: boolean } | NextResponse> {
  const s = await lerSessao();
  if (!s?.lojaId) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!s.admin && !pode(s.cargo, nivel)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });
  return { lojaId: s.lojaId, podeConfigurar: Boolean(s.admin) || pode(s.cargo, "configurar") };
}

/**
 * Limite por IP nas rotas públicas. Sem isso um robô lota a agenda da casa e
 * queima crédito de WhatsApp na confirmação.
 * ponytail: memória do processo; em serverless com várias instâncias cada uma conta
 * sozinha. Se precisar de teto global, troque por Upstash/Redis ou contador no Postgres.
 */
const batidas = new Map<string, number[]>();

export const LIMITES = {
  consulta: { limite: 60, janelaSeg: 60 },
  criar: { limite: 5, janelaSeg: 600 },
  alterar: { limite: 10, janelaSeg: 600 },
} as const;

export function barrarSeExcedeu(
  request: Request, chave: string, { limite, janelaSeg }: { limite: number; janelaSeg: number }
): NextResponse | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const k = `${chave}:${ip}`;
  const agora = Date.now();
  const recentes = (batidas.get(k) ?? []).filter((t) => agora - t < janelaSeg * 1000);
  recentes.push(agora);
  batidas.set(k, recentes);
  if (recentes.length <= limite) return null;
  return NextResponse.json(
    { error: "Muitas tentativas. Espere um pouco e tente de novo." },
    { status: 429, headers: { "Retry-After": String(janelaSeg) } }
  );
}
