# Telas

Três telas. As duas públicas são mobile-first (360px), sem login e sem o menu do sistema.
Use o design system do projeto que recebe o módulo; aqui fica o comportamento, não o visual.

## 1. `/reservar/[lojaId]` (pública): o cliente reserva sozinho

Topo com o nome da casa e uma frase de boas-vindas (`config.mensagem` se houver; senão
"Escolha o dia e o horário que a mesa fica por nossa conta.").

**Passo "escolha"** num cartão só, de cima pra baixo:
- **Pessoas**: botões 1 até `max_pessoas` e um botão "mais de N". Escolher "mais" leva ao passo "whatsapp".
- **Data**: calendário do mês com setas de mês anterior/próximo. Busca
  `GET /publico/disponibilidade?loja&mes&pessoas`. Dia com `temVaga: false` aparece riscado e
  não clica. Trocar pessoas refaz a busca.
- **Horário**: depois de escolher o dia, `GET /publico/slots?loja&data&pessoas`. Cada horário
  mostra o estado: livre, "últimas" (destaque de atenção) ou lotado (desabilitado).
- Botão "Continuar" só acende com pessoas + dia + horário.

**Passo "dados"**: Seu nome (obrigatório, nome e sobrenome), WhatsApp com DDD (obrigatório),
data de nascimento (opcional), observação (opcional, placeholder "Aniversário, cadeirinha, janela...").
Resumo da escolha no topo e botão Voltar. "Confirmar reserva" faz `POST /publico`.
- 409 "acabou de lotar": volta pro passo escolha, recarrega horários, mostra o erro.
- 409 "acima do teto": vai pro passo whatsapp.
- 429: mostra "Muitas tentativas..." e não limpa o formulário.

**Passo "sucesso"**: código grande (`MESA-XXXXXXXX`), data/hora/pessoas, aviso da tolerância
("a mesa fica guardada até 30 min depois do horário"), botão "Gerenciar reserva" pro link do
passo 2, e, se `zapAutomatico` for false e a casa tiver WhatsApp, botão pra mandar a confirmação
pra casa por `wa.me`.

**Passo "whatsapp"**: grupo maior que o teto. Texto curto e botão abrindo
`linkWhatsapp(config.whatsapp, "Olá! Quero reservar uma mesa pra um grupo grande.")`.
Sem WhatsApp cadastrado: "Fale direto com a casa".

**Estados da página**: carregando; loja não existe (404 amigável); `config.ativo = false`
("Reservas online fechadas no momento" + WhatsApp se houver); erro 500 ("tente de novo em instantes").

## 2. `/reservar/[lojaId]/r/[codigo]` (pública): ver, alterar, cancelar

`GET /publico/minha?codigo`. Mostra casa, data, horário, pessoas, status.
- **Alterar**: o mesmo seletor pessoas/data/horário do passo escolha; "Salvar alteração" faz `PATCH`.
- **Cancelar**: pede confirmação ("Sim, cancelar") e faz `DELETE`.
- Reserva cancelada, sentada ou "não veio": só leitura, com botão "Fazer nova reserva".
- Código inexistente: "Reserva não encontrada".

## 3. `/recepcao` (interna, com login): painel da porta

Gate na página com `pode(cargo, "ver")`; sem permissão redireciona. Quatro abas.

**Reservas (do dia)**: seletor de data com dia anterior / próximo / hoje. Três números no topo:
reservas, pessoas, horário de pico (`GET /dia`). Lista por horário: nome, pessoas, horário,
observação, telefone com atalho de WhatsApp, e o status em etiqueta (Confirmada, Sentou,
Não veio, Cancelada, e **Caiu** quando `caiu: true`). Ações de um toque:
- **Sentou** abre o seletor de mesa (grade 1..`total_mesas`, ocupadas desabilitadas com o nome
  de quem está) e faz `PATCH /status {status:"sentou", mesa}`.
- **Levantou** (em quem sentou e ainda não levantou) libera a mesa.
- **Não veio**, **Cancelar**, e **Desfazer** (volta pra confirmada).
Botão **Copiar link** copia `/reservar/[lojaId]` pra casa colar na bio, no Google, no WhatsApp.
Mapa de mesas (`GET /mesas`) visível na aba: livres x ocupadas.

**Espera (fila)**: formulário de 2 campos visíveis (nome, pessoas) e um opcional (WhatsApp,
"pra avisar quando liberar"); "Adicionar à espera" faz `POST /fila`. Lista por ordem de chegada
com "esperando há X min" (calcular com o `agora` do servidor), total de grupos e pessoas.
Ações: **Chamar** (com atalho de WhatsApp "sua mesa está pronta"), **Sentou** (seletor de mesa),
**Desistiu**, **Voltar pra espera**. Finalizados de hoje aparecem recolhidos no fim.
Atualizar a lista a cada ~30s enquanto a aba estiver aberta.

**Clientes** (só `pode(cargo, "crm")`): busca por nome ou telefone, lista com reservas,
visitas, primeira e última vez, selo de aniversariante do mês. Botão Exportar gera CSV no
navegador (nome, telefone, nascimento, reservas, visitas, última).

**Configurações** (ícone de engrenagem; editável só com `podeEditar`): ligar/desligar reservas
online, teto de pessoas, WhatsApp da casa, tolerância (min), antecedência (min), total de mesas,
dias da semana (7 botões), lista de horários com capacidade (adicionar, remover, editar),
mensagem de boas-vindas. "Salvar config" faz `PUT /config` e mostra o erro de validação que voltar.

Um botão de ajuda ("Como usar a recepção") abre um modal com os passos na ordem da noite:
compartilhe o link, reservas do dia, espera, clientes e aniversários, configurações.
