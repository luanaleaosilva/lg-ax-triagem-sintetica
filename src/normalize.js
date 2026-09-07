'use strict';

/**
 * Normalização determinística dos campos da base de ocorrências.
 *
 * Cada campo vem torto de um jeito diferente dependendo do canal de origem
 * (portal, e-mail, planilha). Aqui só resolvemos o que entra nas contas do
 * pipeline de detecção de falha sistêmica: data, canal, status, parceiro e
 * modelo. Não tentamos "consertar" todos os campos da base.
 */

const CANAL_MAP = {
  formulario: 'formulario',
  form: 'formulario',
  'e-mail': 'email',
  email: 'email',
  'planilha parceiro': 'planilha_parceiro',
  planilha_parceiro: 'planilha_parceiro',
};

const STATUS_MAP = {
  aberta: 'aberta',
  'em atendimento': 'em_atendimento',
  em_atendimento: 'em_atendimento',
  'aguardando peca': 'aguardando_peca',
  aguardando_peca: 'aguardando_peca',
  fechada: 'fechada',
  fechado: 'fechada',
  reaberta: 'reaberta',
};

const SUFIXOS_RE = /\b(LTDA\.?|S\.?A\.?|ME|EIRELI|EQUIP|EQUIPAMENTOS)\b/gi;

/** Aceita DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, com ou sem horário. */
function parseData(valor) {
  if (!valor) return null;
  const s = String(valor).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function mesRef(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizaCanal(valor) {
  if (!valor) return null;
  const chave = String(valor).trim().toLowerCase();
  return CANAL_MAP[chave] || chave;
}

function normalizaStatus(valor) {
  if (!valor) return null;
  const chave = String(valor).trim().toLowerCase();
  return STATUS_MAP[chave] || chave;
}

function normalizaModelo(valor) {
  if (!valor) return null;
  return String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function chaveParceiro(nome) {
  let s = nome.toUpperCase().replace(SUFIXOS_RE, '');
  s = s.replace(/[^A-Z0-9 ]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** Distância de Levenshtein simples (sem dependência externa). */
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function similaridade(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Agrupa strings de parceiro que provavelmente são a mesma empresa.
 * Heurística: normaliza sufixo jurídico/pontuação e junta variações
 * similares por distância de texto (equivalente ao difflib do Python).
 * Não é fuzzy-matching robusto de verdade — dá conta de ~37 strings
 * distintas, não mais que isso. Retorna Map<nomeOriginal, nomeCanonico>.
 */
function agrupaParceiros(nomesOriginais) {
  const valores = [...new Set(nomesOriginais.filter(Boolean))];
  const chaves = new Map(valores.map((v) => [v, chaveParceiro(v)]));
  const chavesUnicas = [...new Set(chaves.values())].sort();

  const grupos = [];
  const usadas = new Set();
  for (const chave of chavesUnicas) {
    if (usadas.has(chave)) continue;
    const grupoChaves = new Set([chave]);
    for (const outra of chavesUnicas) {
      if (!usadas.has(outra) && outra !== chave && similaridade(chave, outra) >= 0.72) {
        grupoChaves.add(outra);
      }
    }
    grupoChaves.forEach((c) => usadas.add(c));
    const membros = valores.filter((v) => grupoChaves.has(chaves.get(v)));
    grupos.push(membros);
  }

  const canonico = new Map();
  for (const membros of grupos) {
    const nomeCanonico = membros.reduce((a, b) => (b.length > a.length ? b : a));
    membros.forEach((m) => canonico.set(m, nomeCanonico));
  }
  return canonico;
}

module.exports = {
  parseData,
  mesRef,
  normalizaCanal,
  normalizaStatus,
  normalizaModelo,
  agrupaParceiros,
};
