'use strict';

/**
 * Classificação de sintoma via IA — a única parte do pipeline que usa LLM.
 *
 * Por quê aqui e não em outro lugar: o campo `codigo_sintoma` vem em branco
 * em ~43% das ocorrências, e quando vem preenchido às vezes contradiz o
 * texto livre (ver SOLUCAO.md, seção d). O texto livre do parceiro é a
 * única fonte de verdade nesses casos, e ele varia demais ("não gela",
 * "compressor liga e desliga", "perda de refrigeração") pra um dicionário
 * de palavras-chave dar conta com confiança. Isso é exatamente o tipo de
 * problema que IA resolve bem e regra determinística resolve mal.
 *
 * O classificador NÃO inventa categoria nova: escolhe entre os códigos da
 * tabela de sintomas vigente, restritos à linha do produto. Isso mantém a
 * saída auditável e compatível com o que a operação já usa.
 */

const SYSTEM_PROMPT = `Você classifica ocorrências de assistência técnica em um código de sintoma.
Responda APENAS com um JSON: {"codigo": "<CODIGO>", "confianca": "alta|media|baixa"}.
Escolha "codigo" exclusivamente entre os códigos permitidos fornecidos.
Se a descrição não permitir decidir com segurança entre os códigos permitidos, responda
{"codigo": "NAO_CLASSIFICADO", "confianca": "baixa"}.
Não invente código fora da lista. Não explique, não escreva nada além do JSON.`;

function userPrompt(linha, codigos, descricao) {
  return `Linha de produto: ${linha}
Códigos permitidos para esta linha: ${codigos.join(', ')}
Descrição do cliente/parceiro (texto livre, pode ter erros de digitação): "${descricao}"

Classifique.`;
}

function codigosPermitidos(tabelaSintomas, linha) {
  return tabelaSintomas
    .filter((row) => row.linhas_aplicaveis.split(';').map((s) => s.trim()).includes(linha))
    .map((row) => row.codigo);
}

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada');
  }
  // import tardio: só é necessário quando a IA está ativa
  const Anthropic = require('@anthropic-ai/sdk');
  _client = new Anthropic();
  return _client;
}

/** Chama a API da Anthropic pra classificar uma descrição. Retorna {codigo, confianca}. */
async function classificaComLLM(descricao, linha, tabelaSintomas, model = 'claude-sonnet-5') {
  const codigos = codigosPermitidos(tabelaSintomas, linha);
  if (codigos.length === 0) return { codigo: 'NAO_CLASSIFICADO', confianca: 'baixa' };

  const client = getClient();
  const resposta = await client.messages.create({
    model,
    max_tokens: 60,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt(linha, codigos, descricao) }],
  });

  const texto = resposta.content[0].text.trim();
  let codigo = 'NAO_CLASSIFICADO';
  let confianca = 'baixa';
  try {
    const obj = JSON.parse(texto);
    codigo = obj.codigo || codigo;
    confianca = obj.confianca || confianca;
  } catch {
    // resposta fora do formato esperado -> mantém NAO_CLASSIFICADO
  }

  if (!codigos.includes(codigo)) {
    codigo = 'NAO_CLASSIFICADO';
    confianca = 'baixa';
  }
  return { codigo, confianca };
}

module.exports = { classificaComLLM, codigosPermitidos };
