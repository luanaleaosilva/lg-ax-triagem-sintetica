'use strict';

/**
 * Detecção de possível falha sistêmica e geração do alerta curto pro Teams.
 *
 * Regra determinística, de propósito. O que decide se algo vira alerta tem
 * que ser explicável em uma frase pra quem opera — "esse modelo teve 8x
 * mais ocorrências que o normal" é defensável; "o modelo achou anômalo"
 * não é.
 */

const MIN_OCORRENCIAS_MES = 5; // piso absoluto: ignora combinações de baixo volume
const FATOR_CRESCIMENTO = 2.0; // limiar de crescimento vs. média dos meses anteriores
const LIMITE_CARACTERES_ALERTA = 900;

function moda(valores) {
  const contagem = new Map();
  let melhor = null;
  let melhorN = -1;
  for (const v of valores) {
    const n = (contagem.get(v) || 0) + 1;
    contagem.set(v, n);
    if (n > melhorN) {
      melhor = v;
      melhorN = n;
    }
  }
  return melhor;
}

/**
 * ocorrencias: lista já normalizada, deduplicada e com sintomaEfetivo/custo.
 * Cada item precisa de: linha, modeloNorm, modelo, mes ("YYYY-MM"),
 * custoPecaBrl (number|null), sintomaEfetivo, descricaoCliente, duplicata.
 */
function detectaSpikes(ocorrencias) {
  const ativos = ocorrencias.filter((o) => !o.duplicata);
  const meses = [...new Set(ativos.map((o) => o.mes).filter(Boolean))].sort();
  if (meses.length < 2) return [];
  const ultimoMes = meses[meses.length - 1];

  const grupos = new Map(); // chave "linha||modeloNorm" -> ocorrencias[]
  for (const o of ativos) {
    if (!o.modeloNorm) continue;
    const chave = `${o.linha}||${o.modeloNorm}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(o);
  }

  const achados = [];
  for (const [chave, grupo] of grupos) {
    const [linha, modeloNorm] = chave.split('||');
    const porMes = new Map(meses.map((m) => [m, 0]));
    for (const o of grupo) porMes.set(o.mes, (porMes.get(o.mes) || 0) + 1);

    const contagemRecente = porMes.get(ultimoMes);
    const baseline = meses.slice(0, -1).map((m) => porMes.get(m));
    const mediaBase = baseline.length ? baseline.reduce((a, b) => a + b, 0) / baseline.length : 0;

    if (contagemRecente < MIN_OCORRENCIAS_MES) continue;
    const fator = mediaBase > 0 ? contagemRecente / mediaBase : Infinity;
    if (fator < FATOR_CRESCIMENTO) continue;

    const recentes = grupo.filter((o) => o.mes === ultimoMes);
    const contagemSintomas = new Map();
    for (const o of recentes) {
      contagemSintomas.set(o.sintomaEfetivo, (contagemSintomas.get(o.sintomaEfetivo) || 0) + 1);
    }
    const topSintomas = [...contagemSintomas.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const custos = recentes.map((o) => o.custoPecaBrl).filter((c) => c != null);
    const custoTotal = custos.reduce((a, b) => a + b, 0);
    const custoCobertura = recentes.length ? custos.length / recentes.length : 0;

    const exemplos = [
      ...new Set(recentes.map((o) => o.descricaoCliente).filter(Boolean)),
    ].slice(0, 2);

    achados.push({
      linha,
      modeloNorm,
      modeloExibicao: moda(recentes.map((o) => o.modelo)) || modeloNorm,
      mes: ultimoMes,
      contagemRecente,
      mediaBase: Math.round(mediaBase * 10) / 10,
      fatorCrescimento: fator === Infinity ? null : Math.round(fator * 10) / 10,
      topSintomas,
      custoTotalBrl: Math.round(custoTotal * 100) / 100,
      custoCoberturaPct: Math.round(custoCobertura * 100),
      exemplosDescricao: exemplos,
    });
  }

  achados.sort((a, b) => (b.fatorCrescimento ?? 999) - (a.fatorCrescimento ?? 999));
  return achados;
}

function formataAlertaTeams(achado) {
  const sintomas = achado.topSintomas.map(([k, v]) => `${k} (${v})`).join(', ');
  const fatorTxt = achado.fatorCrescimento != null ? `${achado.fatorCrescimento}x` : 'sem histórico anterior';
  const exemplosTxt = achado.exemplosDescricao.map((e) => `– "${e}"`).join('\n');
  const coberturaNota =
    achado.custoCoberturaPct >= 90
      ? ''
      : ` (custo disponível em só ${achado.custoCoberturaPct}% dos casos — número real é maior)`;

  let texto = `⚠️ Possível falha sistêmica — ${achado.linha} ${achado.modeloExibicao}
${achado.mes}: ${achado.contagemRecente} ocorrências (média dos meses anteriores: ${achado.mediaBase}) — crescimento de ${fatorTxt}
Sintomas mais reportados no período: ${sintomas}
Custo de peça já registrado: R$ ${achado.custoTotalBrl.toFixed(2)}${coberturaNota}
Exemplos de relato:
${exemplosTxt}
Sugestão: avaliar com Qualidade se é falha de lote/produto antes do próximo ciclo de reposição.
— Triagem automática AX Center`;

  if (texto.length > LIMITE_CARACTERES_ALERTA) {
    texto = texto.slice(0, LIMITE_CARACTERES_ALERTA - 3) + '...';
  }
  return texto;
}

module.exports = { detectaSpikes, formataAlertaTeams };
