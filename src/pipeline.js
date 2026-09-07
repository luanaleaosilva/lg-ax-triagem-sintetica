'use strict';

/**
 * Pipeline de triagem: carrega a base, normaliza, deduplica, resolve
 * sintoma (declarado ou via IA) e detecta possíveis falhas sistêmicas.
 *
 * Uso:
 *   node src/pipeline.js
 *
 * Variáveis de ambiente:
 *   ANTHROPIC_API_KEY   opcional. Se ausente, a etapa de IA é pulada e o
 *                       pipeline roda só com o código de sintoma declarado
 *                       (cobertura menor, mas nada quebra).
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const {
  parseData,
  mesRef,
  normalizaCanal,
  normalizaStatus,
  normalizaModelo,
  agrupaParceiros,
} = require('./normalize');
const { marcaDuplicatas } = require('./dedup');
const { classificaComLLM, codigosPermitidos } = require('./classify');
const { detectaSpikes, formataAlertaTeams } = require('./detect');

const RAIZ = path.resolve(__dirname, '..');

function carregaTabelaSintomas() {
  const texto = fs.readFileSync(path.join(RAIZ, 'dossie', 'tabela-sintomas.csv'), 'utf-8');
  return parse(texto, { columns: true, skip_empty_lines: true });
}

function carregaOcorrencias() {
  const texto = fs.readFileSync(path.join(RAIZ, 'dados', 'ocorrencias.csv'), 'utf-8');
  return parse(texto, { columns: true, skip_empty_lines: true });
}

function normalizaTudo(linhas) {
  const ocorrencias = linhas.map((row) => ({
    id: row.id,
    idOrigem: row.id_origem || null,
    linha: row.linha,
    modelo: row.modelo,
    modeloNorm: normalizaModelo(row.modelo),
    serie: row.serie,
    parceiro: row.parceiro,
    descricaoCliente: row.descricao_cliente || null,
    codigoSintoma: row.codigo_sintoma || null,
    canalNorm: normalizaCanal(row.canal),
    statusNorm: normalizaStatus(row.status),
    dataAberturaDt: parseData(row.data_abertura),
    custoPecaBrl: row.custo_peca_brl ? Number(row.custo_peca_brl) : null,
  }));

  const canonParceiro = agrupaParceiros(ocorrencias.map((o) => o.parceiro));
  ocorrencias.forEach((o) => {
    o.parceiroNorm = canonParceiro.get(o.parceiro) || o.parceiro;
    o.mes = mesRef(o.dataAberturaDt);
  });

  return ocorrencias;
}

/** Preenche `sintomaEfetivo`/`sintomaFonte` (declarado | ia | sem_dado | sem_ia). */
async function resolveSintomas(ocorrencias, tabelaSintomas, usarIa) {
  const codigosValidos = new Set(tabelaSintomas.map((r) => r.codigo));
  let nIaOk = 0;
  let nIaFalhou = 0;

  for (const o of ocorrencias) {
    if (o.codigoSintoma && codigosValidos.has(o.codigoSintoma)) {
      o.sintomaEfetivo = o.codigoSintoma;
      o.sintomaFonte = 'declarado';
      continue;
    }

    if (!o.descricaoCliente || o.descricaoCliente.trim().length < 5) {
      o.sintomaEfetivo = 'SEM_DESCRICAO_SUFICIENTE';
      o.sintomaFonte = 'sem_dado';
      continue;
    }

    if (!usarIa) {
      o.sintomaEfetivo = 'NAO_CLASSIFICADO';
      o.sintomaFonte = 'sem_ia';
      continue;
    }

    try {
      const { codigo } = await classificaComLLM(o.descricaoCliente, o.linha, tabelaSintomas);
      o.sintomaEfetivo = codigo;
      o.sintomaFonte = 'ia';
      nIaOk++;
    } catch {
      o.sintomaEfetivo = 'NAO_CLASSIFICADO';
      o.sintomaFonte = 'sem_ia';
      nIaFalhou++;
    }
  }

  return { nIaOk, nIaFalhou };
}

async function roda({ usarIa = true } = {}) {
  const tabelaSintomas = carregaTabelaSintomas();
  let ocorrencias = normalizaTudo(carregaOcorrencias());
  ocorrencias = marcaDuplicatas(ocorrencias);

  const nDupExplicita = ocorrencias.filter((o) => o.duplicata && o.idOrigem).length;
  const nDupHeuristica = ocorrencias.filter((o) => o.duplicata && !o.idOrigem).length;
  console.log(
    `[dedup] ${nDupExplicita} duplicatas explícitas (id_origem) + ${nDupHeuristica} detectadas por heurística (mesma série, mesmo dia/dia seguinte, canal diferente)`
  );

  const temKey = !!process.env.ANTHROPIC_API_KEY;
  if (usarIa && !temKey) {
    console.log('[ia] ANTHROPIC_API_KEY não configurada — rodando sem classificação por IA.');
    usarIa = false;
  }

  const { nIaOk, nIaFalhou } = await resolveSintomas(ocorrencias, tabelaSintomas, usarIa);
  if (usarIa) console.log(`[ia] ${nIaOk} descrições classificadas via IA, ${nIaFalhou} falharam`);

  const achados = detectaSpikes(ocorrencias);
  console.log(
    `\n[deteccao] ${achados.length} combinação(ões) linha+modelo com crescimento suspeito no último mês\n`
  );

  const outDir = path.join(RAIZ, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const caminho = path.join(outDir, 'alertas.md');
  const partes = [];
  for (const achado of achados) {
    const texto = formataAlertaTeams(achado);
    console.log(texto);
    console.log('-'.repeat(60));
    partes.push(texto);
  }
  fs.writeFileSync(caminho, partes.join('\n\n---\n\n') + (partes.length ? '\n' : ''));

  console.log(`\nAlertas salvos em ${caminho}`);
  return { ocorrencias, achados };
}

if (require.main === module) {
  roda().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { roda };
