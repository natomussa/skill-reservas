// Rodar: node --test referencia/lib/regras.test.ts  (Node 23.6+; no 22 use --experimental-strip-types)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agoraNoFuso, ehCodigoReservaValido, inicioDoDiaUtc, estadoDoSlot, gerarCodigoReserva, normalizarConfig,
  reservaCaiu, slotEstourou, slotsDoDia, telefoneE164Brasil, SLOTS_PADRAO,
} from "./regras.ts";

const config = normalizarConfig({
  ativo: true, max_pessoas: 6, tolerancia_min: 30, antecedencia_min: 30,
  dias_semana: [2, 3, 4, 5, 6], total_mesas: 10, slots: SLOTS_PADRAO,
});
// 2026-10-20 é terça (2); 2026-10-19 é segunda (1)
const agora = { hojeIso: "2026-10-20", minutos: 12 * 60 + 10 };

test("estado do horário", () => {
  assert.equal(estadoDoSlot(20, 20, 2), "livre");
  assert.equal(estadoDoSlot(4, 20, 2), "ultimas");
  assert.equal(estadoDoSlot(3, 20, 4), "lotado");
  assert.equal(estadoDoSlot(0, 20, 1), "lotado");
});

test("dia fechado e dia passado não têm horário", () => {
  assert.deepEqual(slotsDoDia(config, new Map(), "2026-10-19", 2, agora), []);
  assert.deepEqual(slotsDoDia(config, new Map(), "2026-10-13", 2, agora), []);
});

test("hoje respeita antecedência e desconta ocupação", () => {
  const slots = slotsDoDia(config, new Map([["13:00", 18]]), "2026-10-20", 2, agora);
  assert.equal(slots[0].hora, "13:00"); // 12:00 e 12:30 já passaram da antecedência
  assert.equal(slots[0].restante, 2);
  assert.equal(slots[0].estado, "ultimas");
});

test("rechecagem pós-insert pega estouro", () => {
  assert.equal(slotEstourou(config, new Map([["19:00", 21]]), "19:00"), true);
  assert.equal(slotEstourou(config, new Map([["19:00", 20]]), "19:00"), false);
});

test("reserva cai depois da tolerância", () => {
  const r = { status: "confirmada" as const, data: "2026-10-20", horario: "19:00" };
  assert.equal(reservaCaiu(r, { hojeIso: "2026-10-20", minutos: 19 * 60 + 30 }, 30), false);
  assert.equal(reservaCaiu(r, { hojeIso: "2026-10-20", minutos: 19 * 60 + 31 }, 30), true);
  assert.equal(reservaCaiu({ ...r, status: "sentou" }, { hojeIso: "2026-10-21", minutos: 0 }, 30), false);
});

test("código: formato, validação e sem repetição", () => {
  const codigos = new Set(Array.from({ length: 500 }, gerarCodigoReserva));
  assert.equal(codigos.size, 500);
  for (const c of codigos) assert.ok(ehCodigoReservaValido(c), c);
  assert.equal(ehCodigoReservaValido("MESA-AB12"), false);
});

test("fuso e telefone", () => {
  // 02:00 UTC ainda é o dia anterior em Brasília
  assert.equal(agoraNoFuso(new Date("2026-10-21T02:00:00Z")).hojeIso, "2026-10-20");
  assert.equal(inicioDoDiaUtc("2026-10-20"), "2026-10-20T03:00:00.000Z");
  assert.equal(telefoneE164Brasil("(51) 99999-0000"), "5551999990000");
});
