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

## Instalar

```bash
git clone https://github.com/natomussa/skill-reservas.git ~/.claude/skills/reservas
```

Depois, dentro do seu projeto no Claude Code, peça: **"implanta o sistema de reservas"**.
O Claude lê o projeto, faz poucas perguntas (qual tabela é a casa, quais cargos operam a
porta, se quer WhatsApp agora) e implanta em etapas, testando cada uma.

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
