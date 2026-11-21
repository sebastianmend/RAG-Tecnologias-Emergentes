import assert from "node:assert";
import { inicioSemana, finSemana, lunesObjetivo, semanaDeFecha, inferirSemana1, SEMANA1_DEFECTO, RECESO_DEFECTO } from "../lib/calendar";

const s1 = SEMANA1_DEFECTO, r = RECESO_DEFECTO;
assert.equal(inicioSemana(8, s1, r), "2026-11-23");
assert.equal(inicioSemana(9, s1, r), "2026-11-30");
assert.equal(inicioSemana(12, s1, r), "2026-12-21");
assert.equal(finSemana(12, s1, r), "2027-01-03");
assert.equal(inicioSemana(13, s1, r), "2027-01-04");
assert.equal(inicioSemana(15, s1, r), "2027-01-18");
assert.equal(inicioSemana(16, s1, r), "2027-01-25");
assert.equal(lunesObjetivo("2026-11-21"), "2026-11-23"); // sábado
assert.equal(lunesObjetivo("2026-11-20"), "2026-11-23"); // viernes
assert.equal(lunesObjetivo("2026-11-18"), "2026-11-16"); // miércoles
assert.equal(semanaDeFecha("2026-12-28", s1, r), 12);
assert.equal(semanaDeFecha("2026-11-23", s1, r), 8);
assert.equal(inferirSemana1([{ semana: 8, desde: "2026-11-23" }, { semana: 15, desde: "2027-01-18" }]), s1);
console.log("calendar OK");
