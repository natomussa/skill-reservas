---
name: reservas
description: Implanta um sistema de reservas de mesa para restaurante, bar ou casa noturna (estilo GetIn) no projeto atual, ou cria o sistema do zero numa pasta vazia. Página pública onde o cliente reserva sozinho com lotação por horário, link pra alterar/cancelar sem login, confirmação por WhatsApp, e painel da recepção com reservas do dia, fila de espera, mapa de mesas, CRM de clientes e configuração. Use quando pedirem "sistema de reservas", "reserva de mesa", "página pra cliente reservar", "fila de espera", "painel da hostess" ou "recepção do restaurante".
argument-hint: "[como a casa funciona, ex.: bar com 15 mesas, qua a dom das 18h às 23h]"
---

# Reservas de mesa

Módulo testado em produção numa casa operando. A pasta `referencia/` tem o código de
referência em Next.js (App Router) + Supabase. Você vai **adaptar** à realidade de quem pediu,
não colar às cegas. Quem chama pode não ser programador: fale simples, faça você o que der
pra fazer, e quando for a vez dele (criar conta, colar chave) diga onde clicar e o que esperar.

Texto que veio junto do comando: `$ARGUMENTS`. Se veio, use como resposta antecipada das
perguntas sobre a casa e não pergunte de novo o que já está ali.

## 1. Descobrir a realidade

Olhe a pasta atual e caia num dos três casos:

- **A. Projeto Next.js + Supabase**: leia como faz auth/sessão, onde mora o client do banco
  no servidor, como chama a tabela de estabelecimentos, o design system e como roda migration.
- **B. Projeto em outro stack** (Laravel, Django, Rails, Express, Firebase...): mantenha
  `regras.ts` (TypeScript puro; em outra linguagem, traduza função por função junto com o
  teste) e reescreva banco e rotas no idioma do projeto, com os mesmos contratos de API.
- **C. Pasta vazia ou sem sistema**: crie do zero (seção 2) e siga.

Depois pergunte só o que a pasta e o `$ARGUMENTS` não responderam, uma pergunta por vez,
sempre com uma opção recomendada:

- **A casa**: nome, dias que abre, horários de reserva, quantas pessoas cabem por horário,
  quantas mesas, teto de pessoas por reserva online (padrão 6), WhatsApp da casa, tolerância
  (padrão 30 min). Isso vira a config inicial; não deixe a casa com os horários padrão.
- **Uma casa ou várias** no mesmo sistema. Qual tabela representa a casa (referência: `lojas(id, nome)`).
- **Quem opera e quem configura** (padrão: Hostess opera; Maître, Chefe de Fila, Supervisor,
  Subgerente e Gerente configuram; CRM de clientes só a gerência).
- **Fuso**, se não for Brasília.
- **WhatsApp automático agora ou depois** (opcional; sem env nada é enviado e tudo funciona).

## 2. Do zero (caso C)

1. `npx create-next-app@latest . --ts --app --eslint --tailwind --no-src-dir --import-alias "@/*" --use-npm`
   e `npm i @supabase/supabase-js @supabase/ssr`.
2. Banco: o usuário cria o projeto em supabase.com com a conta dele (login e senha são
   dele, você só orienta). Peça a Project URL, a anon key e a service_role key (Project
   Settings > API) e grave em `.env.local` como `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Confira que `.env*` está no
   `.gitignore` antes de qualquer commit.
3. Tabelas mínimas antes do `schema.sql`:
   `lojas(id uuid pk default gen_random_uuid(), nome text not null)` e
   `equipe(user_id uuid pk references auth.users, loja_id uuid references lojas, cargo text)`,
   ambas com RLS ligada. Insira a casa dele em `lojas`.
4. Login da equipe com Supabase Auth (e-mail e senha) via `@supabase/ssr`; `lerSessao()` lê o
   usuário e busca loja e cargo em `equipe`. O primeiro usuário entra como `Gerente`.
5. SQL: se tiver a Supabase CLI ou a connection string, rode você; senão entregue o SQL
   inteiro e diga "SQL Editor > New query > colar > Run".
6. No fim, ofereça publicar na Vercel (conta dele) com as mesmas três variáveis de ambiente.

## 3. Ordem de implantação

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
6. **Config da casa**: grave em `reservas_config` o que ele respondeu sobre a casa (dias,
   horários com capacidade, mesas, teto, WhatsApp, tolerância). Deixe `ativo = false` até a
   verificação passar; aí pergunte se liga.
7. **Verificação ponta a ponta** (abaixo).
8. **Entrega**: o link público da casa (`/reservar/<id da loja>`) pronto pra bio do Instagram
   e pro Google, e um resumo de uma tela de como a equipe usa a recepção.

## 4. Regras de negócio (não mudar sem o usuário pedir)

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

## 5. Segurança (não cortar)

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

## 6. Verificação

Rode o projeto e confira, de preferência no navegador em largura de celular:
1. Config desligada: página pública mostra "reservas fechadas". Ligue pela aba Configurações.
2. Reserve pelo link público e veja aparecer no painel do dia com os totais certos.
3. Abra o link de gerenciar, altere o horário, depois cancele: o painel acompanha.
4. Escolha mais pessoas que o teto: cai no WhatsApp.
5. Lote um horário (capacidade baixa) e confirme que ele aparece lotado e que um POST direto devolve 409.
6. Sentou com mesa, Levantou, Não veio, e um passante na fila até sentar: mapa de mesas fecha a conta.
7. Logado com um cargo sem permissão: rotas internas devolvem 403.
