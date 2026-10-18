/**
 * Reservas: tipos e regras PURAS (sem banco, sem rede).
 * Tudo aqui é testável isolado: `node --test referencia/lib/regras.test.ts`.
 */

export type SlotConfig = {
  hora: string; // "19:00"
  capacidade: number; // pessoas por horário
};

export type ReservasConfig = {
  ativo: boolean;
  max_pessoas: number; // teto da reserva online; acima disso vai pro WhatsApp da casa
  whatsapp: string | null;
  tolerancia_min: number; // reserva "cai" depois de horário + tolerância
  antecedencia_min: number; // não deixa reservar pra daqui a menos que isso
  dias_semana: number[]; // 0 = domingo ... 6 = sábado
  total_mesas: number; // mesas numeradas 1..N
  slots: SlotConfig[];
  mensagem: string | null;
};

export type ReservaStatus = "confirmada" | "sentou" | "nao_veio" | "cancelada";
export type FilaStatus = "esperando" | "chamado" | "sentou" | "desistiu";
export type EstadoSlot = "livre" | "ultimas" | "lotado";
export type SlotDia = { hora: string; estado: EstadoSlot; restante: number };
export type Agora = { hojeIso: string; minutos: number };

export const STATUS_LABEL: Record<ReservaStatus, string> = {
  confirmada: "Confirmada",
  sentou: "Sentou",
  nao_veio: "Não veio",
  cancelada: "Cancelada",
};

/** Status que ocupam lugar na lotação do horário. */
export const STATUS_OCUPA: ReservaStatus[] = ["confirmada", "sentou"];

/** Fuso da casa. Troque se o estabelecimento não estiver no horário de Brasília. */
export const FUSO = "America/Sao_Paulo";

/** Config de quem nunca configurou: almoço + jantar até 19h. Nasce DESLIGADA (ver SKILL.md). */
export const SLOTS_PADRAO: SlotConfig[] = [
  "12:00", "12:30", "13:00", "13:30", "14:00", "18:00", "18:30", "19:00",
].map((hora) => ({ hora, capacidade: 20 }));

export function horaParaMin(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Dia da semana (0=dom) de uma data ISO, imune ao fuso do servidor. */
export function diaSemanaDeIso(dataIso: string): number {
  return new Date(`${dataIso}T12:00:00Z`).getUTCDay();
}

/** Data e minuto de agora no fuso da casa (o servidor costuma rodar em UTC). */
export function agoraNoFuso(agora = new Date(), fuso = FUSO): Agora {
  const hojeIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
  const hm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(agora);
  return { hojeIso, minutos: horaParaMin(hm) };
}

/**
 * Meia-noite do dia da casa, em UTC (pra filtrar timestamptz "de hoje").
 * ponytail: offset fixo -03:00 (Brasil sem horário de verão desde 2019). Outro fuso, troque aqui.
 */
export function inicioDoDiaUtc(hojeIso: string): string {
  return new Date(`${hojeIso}T00:00:00-03:00`).toISOString();
}

/**
 * Reserva confirmada "caiu"? (passou do horário + tolerância sem sentar).
 * Derivado na leitura, nunca gravado no banco.
 */
export function reservaCaiu(
  r: { status: ReservaStatus; data: string; horario: string },
  agora: Agora,
  toleranciaMin: number
): boolean {
  if (r.status !== "confirmada") return false;
  if (r.data > agora.hojeIso) return false;
  if (r.data < agora.hojeIso) return true;
  return agora.minutos > horaParaMin(r.horario) + toleranciaMin;
}

/** livre / ultimas (sobra <= 20% ou <= 2 lugares) / lotado (não cabe o grupo). */
export function estadoDoSlot(restante: number, capacidade: number, pessoas: number): EstadoSlot {
  if (restante < pessoas || restante <= 0) return "lotado";
  const limiteUltimas = Math.max(2, Math.ceil(capacidade * 0.2));
  return restante <= limiteUltimas ? "ultimas" : "livre";
}

/**
 * Horários de um dia com estado, já tirando os que ferem a antecedência quando o dia é hoje.
 * Dia fora dos dias da casa, ou no passado = [].
 * `ocupacao` = soma de pessoas por horário (só status que ocupam).
 */
export function slotsDoDia(
  config: ReservasConfig,
  ocupacao: Map<string, number>,
  dataIso: string,
  pessoas: number,
  agora: Agora
): SlotDia[] {
  if (!config.dias_semana.includes(diaSemanaDeIso(dataIso))) return [];
  if (dataIso < agora.hojeIso) return [];
  return config.slots
    .filter((s) => dataIso !== agora.hojeIso || horaParaMin(s.hora) >= agora.minutos + config.antecedencia_min)
    .map((s) => {
      const restante = Math.max(0, s.capacidade - (ocupacao.get(s.hora) ?? 0));
      return { hora: s.hora, restante, estado: estadoDoSlot(restante, s.capacidade, pessoas) };
    });
}

/** Horário estourou a capacidade? Usado na rechecagem pós-insert (corrida entre dois clientes). */
export function slotEstourou(config: ReservasConfig, ocupacao: Map<string, number>, hora: string): boolean {
  const slot = config.slots.find((s) => s.hora === hora);
  return !slot || (ocupacao.get(hora) ?? 0) > slot.capacidade;
}

/** Normaliza a linha do banco (jsonb e números podem vir tortos). */
export function normalizarConfig(row: Record<string, unknown>): ReservasConfig {
  const slots = Array.isArray(row.slots)
    ? (row.slots as SlotConfig[])
        .filter((s) => s && typeof s.hora === "string" && Number(s.capacidade) > 0)
        .map((s) => ({ hora: s.hora, capacidade: Number(s.capacidade) }))
        .sort((a, b) => horaParaMin(a.hora) - horaParaMin(b.hora))
    : [];
  return {
    ativo: Boolean(row.ativo),
    max_pessoas: Number(row.max_pessoas) || 6,
    whatsapp: (row.whatsapp as string | null) ?? null,
    tolerancia_min: Number(row.tolerancia_min) || 30,
    antecedencia_min: Number(row.antecedencia_min) || 30,
    dias_semana: Array.isArray(row.dias_semana) ? (row.dias_semana as number[]) : [0, 1, 2, 3, 4, 5, 6],
    total_mesas: Number(row.total_mesas) || 20,
    slots,
    mensagem: (row.mensagem as string | null) ?? null,
  };
}

// Sem 0/O, 1/I/L: o cliente lê o código em voz alta no balcão.
const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODIGO_RE = /^MESA-[0-9A-Z]{8}$/;

/**
 * Código da reserva. É a ÚNICA credencial do cliente pra ver/alterar/cancelar sem login,
 * então: 8 caracteres (31^8 ≈ 8,5e11) de fonte criptográfica. Nunca Math.random, nunca 4 letras.
 * Gerador e validador ficam juntos de propósito: separados, um muda e o outro não.
 */
export function gerarCodigoReserva(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let sufixo = "";
  for (const b of bytes) sufixo += ALFABETO_CODIGO[b % ALFABETO_CODIGO.length];
  return `MESA-${sufixo}`;
}

export function ehCodigoReservaValido(codigo: string): boolean {
  return CODIGO_RE.test(codigo);
}

export function formatarDataCurta(dataIso: string): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${dias[d.getUTCDay()]}, ${d.getUTCDate()} de ${meses[d.getUTCMonth()]}`;
}

/** Telefone BR digitado de qualquer jeito pra E.164 sem "+" (55 + DDD + número). */
export function telefoneE164Brasil(telefone: string): string {
  const so = telefone.replace(/\D/g, "");
  return so.length <= 11 ? `55${so}` : so;
}

export function linkWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${telefoneE164Brasil(numero)}?text=${encodeURIComponent(texto)}`;
}
