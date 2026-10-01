// Compara el resultado de banco.mjs con la verdad anotada (verdad.json).
// Uso: node medir.mjs resultado.json
import fs from 'fs';

const verdad = JSON.parse(fs.readFileSync(new URL('./verdad.json', import.meta.url)));
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const aciertos = { origen: 0, destino: 0, minutos: 0, completas: 0 };
let confiados = 0;
let dudosos = 0;
const fallos = [];
for (const [id, v] of Object.entries(verdad)) {
  const x = r[id];
  if (!x) {
    fallos.push(`${id}: falta en el resultado (¿no está la captura en muestras-ocr?)`);
    continue;
  }
  let bien = true;
  for (const campo of ['origen', 'destino', 'minutos']) {
    if (x[campo] === v[campo]) {
      aciertos[campo] += 1;
      continue;
    }
    bien = false;
    // Un error "confiado" es el peor: se propone sin marcarlo para revisar.
    const confiado =
      campo === 'minutos' ? x.minutos !== null && x.confianza.minutos === 1 : x[campo] !== null && x.confianza[campo] >= 0.9;
    if (confiado) confiados += 1;
    fallos.push(`${id} ${campo}: leído ${x[campo]} / real ${v[campo]}${confiado ? '  ← CONFIADO' : ''}`);
  }
  if (x.minutos !== null && x.confianza.minutos < 1) dudosos += 1;
  if (bien) aciertos.completas += 1;
}
const n = Object.keys(verdad).length;
console.log(`origen ${aciertos.origen}/${n} · destino ${aciertos.destino}/${n} · tiempo ${aciertos.minutos}/${n} · completas ${aciertos.completas}/${n}`);
console.log(`errores confiados: ${confiados} · tiempos marcados para revisar: ${dudosos}`);
for (const f of fallos) console.log(`  ${f}`);
