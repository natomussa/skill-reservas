/** Reservas: leitura e escrita no banco (Supabase, service role). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SLOTS_PADRAO, STATUS_OCUPA, agoraNoFuso, normalizarConfig, slotsDoDia,
  type ReservasConfig,
} from "./regras";

/** Client do servidor. A service role ignora RLS: NUNCA importe isto em componente de client. */
export function createAdminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/**
 * Config da loja; cria a padrão (DESLIGADA) se não existir.
 *
 * Por que nasce desligada: as rotas públicas recebem qualquer UUID de loja. Se a config
 * nascesse ligada, toda loja do sistema passaria a aceitar reserva no primeiro acesso,
 * inclusive as que nunca quiseram, e o cliente sairia com um código achando que tem mesa.
 */
export async function obterOuCriarConfig(admin: SupabaseClient, lojaId: string): Promise<ReservasConfig> {
  const { data, error } = await admin.from("reservas_config").select("*").eq("loja_id", lojaId).maybeSingle();
  if (error) throw error;
  if (data) return normalizarConfig(data);

  const { data: criada, error: errCriar } = await admin
    .from("reservas_config")
    .insert({ loja_id: lojaId, ativo: false, slots: SLOTS_PADRAO })
    .select("*")
    .single();
  if (criada) return normalizarConfig(criada);

  // corrida com outro request que criou primeiro: relê
  const { data: relida } = await admin.from("reservas_config").select("*").eq("loja_id", lojaId).maybeSingle();
  if (!relida) throw errCriar;
  return normalizarConfig(relida);
}

/** Soma de pessoas por horário num dia (só status que ocupam lugar). */
export async function ocupacaoDoDia(admin: SupabaseClient, lojaId: string, dataIso: string) {
  const { data, error } = await admin
    .from("reservas")
    .select("horario, pessoas")
    .eq("loja_id", lojaId)
    .eq("data", dataIso)
    .in("status", STATUS_OCUPA);
  if (error) throw error;
  const mapa = new Map<string, number>();
  for (const r of data ?? []) mapa.set(r.horario, (mapa.get(r.horario) ?? 0) + Number(r.pessoas));
  return mapa;
}

/** Dias de um mês (yyyy-mm) com pelo menos um horário que cabe o grupo. Uma query só. */
export async function diasDoMes(
  admin: SupabaseClient, lojaId: string, config: ReservasConfig, mes: string, pessoas: number
) {
  const agora = agoraNoFuso();
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate();

  const { data, error } = await admin
    .from("reservas")
    .select("data, horario, pessoas")
    .eq("loja_id", lojaId)
    .gte("data", `${mes}-01`)
    .lte("data", `${mes}-${String(ultimoDia).padStart(2, "0")}`)
    .in("status", STATUS_OCUPA);
  if (error) throw error;

  const porDia = new Map<string, Map<string, number>>();
  for (const r of data ?? []) {
    const porHora = porDia.get(r.data) ?? new Map<string, number>();
    porHora.set(r.horario, (porHora.get(r.horario) ?? 0) + Number(r.pessoas));
    porDia.set(r.data, porHora);
  }

  return Array.from({ length: ultimoDia }, (_, i) => {
    const dia = `${mes}-${String(i + 1).padStart(2, "0")}`;
    const slots = slotsDoDia(config, porDia.get(dia) ?? new Map(), dia, pessoas, agora);
    return { dia, temVaga: slots.some((s) => s.estado !== "lotado") };
  });
}

/** Erro em rota PÚBLICA: loga o motivo real e devolve texto genérico (não vaza schema). */
export function erroPublico(contexto: string, error: unknown): string {
  console.error(`[reservas] ${contexto}:`, error instanceof Error ? error.message : error);
  return "Não foi possível concluir agora. Tente de novo em instantes.";
}
