/**
 * Confirmação automática no WhatsApp do cliente. Opcional: sem env, não faz nada
 * e a reserva funciona igual (a tela de sucesso mostra o código e o link).
 *
 * Dois caminhos, pela env:
 * 1. WHATSAPP_WEBHOOK_URL (+ WHATSAPP_WEBHOOK_TOKEN opcional, vira Bearer):
 *    POST {telefone, mensagem}. Encaixa Z-API, Evolution, Make, Zapier, n8n.
 * 2. WHATSAPP_CLOUD_TOKEN + WHATSAPP_CLOUD_PHONE_ID: API oficial da Meta com
 *    template aprovado (WHATSAPP_CLOUD_TEMPLATE, padrão "reserva_confirmada",
 *    pt_BR, 5 variáveis: nome, casa, data e hora, pessoas, código).
 *
 * Nunca derruba a reserva: erro de envio só vai pro log.
 */
import { telefoneE164Brasil } from "./regras";

export type DadosConfirmacao = {
  telefone: string;
  nome: string;
  lojaNome: string;
  dataLegivel: string; // "ter, 14 de jul"
  horario: string;
  pessoas: number;
  codigo: string;
  linkGerenciar: string;
};

const pax = (n: number) => (n === 1 ? "1 pessoa" : `${n} pessoas`);

export function mensagemConfirmacao(d: DadosConfirmacao): string {
  return (
    `Oi, ${d.nome}! Sua reserva na ${d.lojaNome} está confirmada: ` +
    `${d.dataLegivel} às ${d.horario}, ${pax(d.pessoas)}. Código ${d.codigo}. ` +
    `Pra alterar ou cancelar: ${d.linkGerenciar} Até lá!`
  );
}

async function viaWebhook(d: DadosConfirmacao, url: string): Promise<boolean> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.WHATSAPP_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${process.env.WHATSAPP_WEBHOOK_TOKEN}`;
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      telefone: telefoneE164Brasil(d.telefone),
      mensagem: mensagemConfirmacao(d),
      contexto: "reserva_confirmada",
      codigo: d.codigo,
    }),
  });
  if (!resp.ok) console.error("[reservas] webhook whatsapp falhou", resp.status);
  return resp.ok;
}

async function viaMetaCloud(d: DadosConfirmacao, token: string, phoneId: string): Promise<boolean> {
  const texto = (text: string) => ({ type: "text", text });
  const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefoneE164Brasil(d.telefone),
      type: "template",
      template: {
        name: process.env.WHATSAPP_CLOUD_TEMPLATE || "reserva_confirmada",
        language: { code: "pt_BR" },
        components: [{
          type: "body",
          parameters: [
            texto(d.nome), texto(d.lojaNome), texto(`${d.dataLegivel} às ${d.horario}`),
            texto(pax(d.pessoas)), texto(d.codigo),
          ],
        }],
      },
    }),
  });
  if (!resp.ok) console.error("[reservas] meta cloud whatsapp falhou", resp.status, (await resp.text()).slice(0, 300));
  return resp.ok;
}

/** true = algum canal enviou. */
export async function enviarConfirmacaoWhatsApp(d: DadosConfirmacao): Promise<boolean> {
  try {
    const { WHATSAPP_WEBHOOK_URL: url, WHATSAPP_CLOUD_TOKEN: token, WHATSAPP_CLOUD_PHONE_ID: phoneId } = process.env;
    if (url) return await viaWebhook(d, url);
    if (token && phoneId) return await viaMetaCloud(d, token, phoneId);
    return false;
  } catch (error) {
    console.error("[reservas] erro ao enviar whatsapp", error instanceof Error ? error.message : error);
    return false;
  }
}
