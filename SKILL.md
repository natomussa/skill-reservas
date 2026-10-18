---
name: reservas
description: Implanta um sistema de reservas de mesa para restaurante, bar ou casa noturna (estilo GetIn) no projeto atual. Página pública onde o cliente reserva sozinho com lotação por horário, link pra alterar/cancelar sem login, confirmação por WhatsApp, e painel da recepção com reservas do dia, fila de espera, mapa de mesas, CRM de clientes e configuração. Use quando pedirem "sistema de reservas", "reserva de mesa", "página pra cliente reservar", "fila de espera", "painel da hostess" ou "recepção do restaurante".
---

# Reservas de mesa

Módulo testado em produção numa casa operando. A pasta `referencia/` tem o código de
referência em Next.js (App Router) + Supabase. Você vai **adaptar** ao projeto, não colar às cegas.

## Antes de escrever código

1. Leia o projeto: framework, banco, como faz auth/sessão, onde mora o client do banco no
   servidor, como nomeia a tabela de estabelecimentos, design system, como roda migration.
2. Pergunte ao usuário só o que o código não responde (uma pergunta por vez, com opção recomendada):
   - Qual tabela representa a casa? (a referência usa `lojas(id, nome)`). Uma casa ou várias?
   - Quais cargos operam a porta e quais configuram? (padrão: Hostess opera; Maître, Chefe de
     Fila, Supervisor, Subgerente, Gerente configuram; CRM só gerência.)
   - Fuso da casa, se não for Brasília.
   - Quer confirmação automática no WhatsApp agora? (é opcional; sem env, nada é enviado.)
   - Quais partes: tudo, ou só página pública + reservas do dia primeiro?
3. Se o stack não for Next + Supabase, mantenha `regras.ts` intacto (é TypeScript puro) e
   reescreva banco/rotas no idioma do projeto, mantendo os mesmos contratos de API.

## Ordem de implantação

Faça e confira cada passo antes do próximo.

1. **Banco**: `referencia/schema.sql` vira uma migration do projeto (troque `lojas` se precisar).
2. **Regras puras**: copie `referencia/lib/regras.ts` e o teste. Rode
   `node --test lib/reservas/regras.test.ts` (Node 23.6+) e só siga com tudo verde. Se o
   type-check do projeto reclamar do `.ts` no import do teste, tire `**/*.test.ts` do `tsconfig`.
3. **Servidor**: `banco.ts`, `whatsapp.ts` e `acesso.ts`. Em `acesso.ts`, implemente
   `lerSessao()` com a auth do projeto e ajuste `CARGOS_RECEPCAO`. Se o projeto já tem
   rate limit, use o dele no lugar do `barrarSeExcedeu` em memória.
4. **APIs**: as rotas de `referencia/app/api/reservas/`. As de `publico/` não podem exigir
   login; libere esse caminho no middleware de auth se houver.
5. **Telas**: siga `referencia/telas.md` com os componentes do próprio projeto.
6. **Verificação ponta a ponta** (abaixo).

## Regras de negócio (não mudar sem o usuário pedir)

- Confirmação **automática** respeitando a lotação de cada horário. Sem aprovação manual.
- Lotação é por **pessoas por horário** (`slots[].capacidade`), não por mesa. Mesa é usada
  só na operação (quem sentou onde).
- Teto online (`max_pessoas`, padrão 6). Grupo maior vai pro WhatsApp da casa.
- Antecedência mínima (padrão 30 min) só vale pro dia de hoje.
- Estado do horário: `lotado` se o grupo não cabe; `ultimas` se sobra <= 20% ou <= 2 lugares.
- Tolerância (padrão 30 min): confirmada que passou do horário + tolerância aparece como
  **Caiu**. É derivado na leitura, nunca gravado.
- Ocupam lugar: `confirmada` e `sentou`. `nao_veio` e `cancelada` liberam.
- "Levantou" não é status: a reserva continua `sentou` e ganha `levantou_em` (libera a mesa
  no mapa sem perder a visita no CRM).
- CRM não tem tabela: deriva de reservas + fila agrupando por telefone.
- Config nasce **desligada** e é criada no primeiro acesso. A casa liga quando quiser.

## Segurança (não cortar)

- O **código da reserva é a única credencial** do cliente. 8 caracteres de
  `crypto.getRandomValues`, nunca `Math.random`, nunca menos de 8. Gerador e validador juntos.
- Rotas públicas com rate limit por IP (criar 5/10min, alterar 10/10min, consultar 60/min).
  Sem isso um robô lota a agenda e gasta crédito de WhatsApp.
- Rota pública nunca devolve telefone de cliente nem mensagem crua do banco (`erroPublico`).
- Toda rota interna tira `loja_id` da **sessão**, nunca do body ou da query, e todo update
  filtra `.eq("loja_id", lojaDaSessao)`.
- Service role só no servidor. RLS ligada sem policy pública em `reservas`.
- Corrida no último lugar: depois do insert/update, reconte (`slotEstourou`) e desfaça se estourou.
- Validar tudo no servidor (UUID, data, hora, faixas numéricas, tamanho de texto), mesmo que a tela já valide.

## Verificação

Rode o projeto e confira, de preferência no navegador em largura de celular:
1. Config desligada: página pública mostra "reservas fechadas". Ligue pela aba Configurações.
2. Reserve pelo link público e veja aparecer no painel do dia com os totais certos.
3. Abra o link de gerenciar, altere o horário, depois cancele: o painel acompanha.
4. Escolha mais pessoas que o teto: cai no WhatsApp.
5. Lote um horário (capacidade baixa) e confirme que ele aparece lotado e que um POST direto devolve 409.
6. Sentou com mesa, Levantou, Não veio, e um passante na fila até sentar: mapa de mesas fecha a conta.
7. Logado com um cargo sem permissão: rotas internas devolvem 403.
