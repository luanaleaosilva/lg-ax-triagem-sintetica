'use strict';

/**
 * Detecção de ocorrências duplicadas entre canais.
 *
 * A base tem um campo `id_origem` que às vezes aponta pra ocorrência
 * "original" quando a mesma reclamação chegou por dois canais — mas ele só
 * está preenchido em ~75 casos. Cruzando por número de série + data
 * próxima, achamos mais ~40 pares que são claramente a mesma ocorrência
 * (mesma série, mesmo dia ou dia seguinte, canal diferente) sem
 * `id_origem` preenchido.
 *
 * Este módulo marca as duplicatas (explícitas + heurísticas) pra que elas
 * não sejam contadas duas vezes nas métricas de volume por modelo/sintoma.
 */

function diffDias(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/** Recebe a lista de ocorrências já normalizadas e marca `duplicata`/`duplicataDe`. */
function marcaDuplicatas(ocorrencias) {
  const porId = new Map(ocorrencias.map((o) => [o.id, o]));
  ocorrencias.forEach((o) => {
    o.duplicata = false;
    o.duplicataDe = null;
  });

  // 1) duplicatas explícitas via id_origem
  const jaMarcadas = new Set();
  for (const o of ocorrencias) {
    if (o.idOrigem && porId.has(o.idOrigem)) {
      o.duplicata = true;
      o.duplicataDe = o.idOrigem;
      jaMarcadas.add(o.id);
      jaMarcadas.add(o.idOrigem);
    }
  }

  // 2) duplicatas heurísticas: mesma série, abertura no mesmo dia ou dia
  //    seguinte, canal diferente, nenhuma das duas já marcada.
  const porSerie = new Map();
  for (const o of ocorrencias) {
    if (!o.serie) continue;
    if (!porSerie.has(o.serie)) porSerie.set(o.serie, []);
    porSerie.get(o.serie).push(o);
  }

  for (const grupo of porSerie.values()) {
    if (grupo.length < 2) continue;
    grupo.sort((a, b) => (a.dataAberturaDt || 0) - (b.dataAberturaDt || 0));
    for (let i = 0; i < grupo.length - 1; i++) {
      const a = grupo[i];
      const b = grupo[i + 1];
      if (jaMarcadas.has(a.id) || jaMarcadas.has(b.id)) continue;
      if (!a.dataAberturaDt || !b.dataAberturaDt) continue;
      const gap = diffDias(a.dataAberturaDt, b.dataAberturaDt);
      if (gap <= 1 && a.canalNorm !== b.canalNorm) {
        b.duplicata = true;
        b.duplicataDe = a.id;
        jaMarcadas.add(a.id);
        jaMarcadas.add(b.id);
      }
    }
  }

  return ocorrencias;
}

module.exports = { marcaDuplicatas };
