# Skill de reservas de mesa para Claude Code

Skill que implanta, no seu projeto, um sistema de reservas para restaurante, bar ou casa
noturna. Saiu de um módulo que já roda em produção numa casa operando.

**O que vem junto**

- Página pública onde o cliente reserva sozinho: pessoas, dia, horário, nome e WhatsApp.
  Confirmação automática respeitando a lotação de cada horário.
- Link com código pra o cliente alterar ou cancelar, sem login.
- Grupo acima do teto vai direto pro WhatsApp da casa.
- Confirmação automática no WhatsApp do cliente (opcional: webhook tipo Z-API/Evolution ou API oficial da Meta).
- Painel da recepção: reservas do dia com totais e horário de pico, sentou/não veio/caiu,
  fila de espera de quem chega sem reservar, mapa de mesas, CRM de clientes com
  aniversariantes do mês, e a configuração da casa (horários, capacidade, teto, tolerância).

O código de referência é Next.js (App Router) + Supabase. Em outro stack o Claude reaproveita
as regras (TypeScript puro, com teste) e reescreve banco e rotas mantendo os contratos.

## Usar (um comando)

Precisa do [Claude Code](https://claude.com/claude-code) instalado. Abra o terminal na pasta
do seu sistema, ou numa pasta nova e vazia se ainda não tem sistema, e cole:

```bash
(git -C ~/.claude/skills/reservas pull -q 2>/dev/null || git clone -q https://github.com/natomussa/skill-reservas.git ~/.claude/skills/reservas) && claude "/reservas"
```

O mesmo comando instala na primeira vez e atualiza nas próximas. O Claude olha a pasta e
segue sozinho:

- **Já tem sistema em Next.js + Supabase**: encaixa o módulo no que existe (login, cargos, visual).
- **Tem sistema em outra linguagem**: reescreve banco e rotas no idioma do projeto.
- **Pasta vazia**: cria o sistema do zero e te guia pra criar a conta no Supabase.

Depois de instalado, dá pra ir mais rápido contando como a casa funciona já no comando:

```bash
claude "/reservas bar com 12 mesas, abre de quarta a domingo, reservas das 18h às 21h de meia em meia hora, 30 pessoas por horário"
```

Ele só pergunta o que faltar, uma coisa por vez, e no fim entrega o link de reservas pronto
pra bio do Instagram e pro Google.

## Estrutura

```
SKILL.md                    instruções que o Claude segue
referencia/
  schema.sql                tabelas: reservas_config, reservas, fila_espera
  lib/regras.ts             regras puras (lotação, horários, tolerância, código)
  lib/regras.test.ts        node --test referencia/lib/regras.test.ts
  lib/banco.ts              leitura/escrita no Supabase
  lib/acesso.ts             permissões por cargo + rate limit (adaptar à sua auth)
  lib/whatsapp.ts           confirmação automática, opcional
  app/api/reservas/...      rotas públicas e internas
  telas.md                  comportamento das 3 telas
```
