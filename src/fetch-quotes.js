#!/usr/bin/env node
'use strict';

/**
 * claude-quotes — busca frases curtas (finanças, vida empresarial, vida social,
 * estudo, sabedoria...) na internet, traduz para português (pt-BR) e gera
 * ../quotes.json no formato:
 *   [ { "text": "...", "author": "...", "category": "Finanças" }, ... ]
 *
 * Requer Node 18+ (usa fetch nativo). Sem dependências externas.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const OUT_FILE = path.join(__dirname, '..', 'quotes.json');
const TARGET = Number(process.env.QUOTES_TARGET || 120); // quantas frases gerar
const MAX_LEN = Number(process.env.QUOTES_MAXLEN || 90); // frases CURTAS (máx. de caracteres)
const TRANSLATE_DELAY = 350; // ms entre traduções (evita bloqueio)

// Palavras-chave que mantêm o material no tema (várias categorias de vida)
const KEYWORDS =
  /\b(philosoph|wisdom|wise|knowledg|educat|learn|stud(y|ies|ent)|teach|truth|reason|reflect|intellect|intelligen|book|read|scien|understand|ignoran|question|curious|disciplin|virtue|moral|ethic|thought|thinking|mind|doubt|wonder|school|money|wealth|rich|invest|save|fortune|economy|business|work|leader|success|goal|ambition|career|effort|opportunit|habit|time|life|character|courage|fear|friend|love|people|society|family|kind|trust|happ)\b/i;

// Remove apenas o que é claramente impróprio para uma statusline
const BLOCKLIST =
  /\b(sex|sexy|naked|nude|porn|orgasm|drunk|booze|celebrity|hollywood|instagram|selfie)\b/i;

// Categorização (pt-BR) por palavra-chave, em ordem de prioridade. Casado no texto EN.
const CATEGORIES = [
  ['Finanças', /\b(money|wealth|rich|riches|invest|saving|poverty|poor|gold|fortune|economy|debt|profit|coin|finance|budget)\b/i],
  ['Vida Empresarial', /\b(business|work|leader|success|career|company|ambition|achiev|effort|opportunit|productiv|goal|enterprise|boss|deal|hustle|management)\b/i],
  ['Vida Social', /\b(friend|love|people|society|family|relationship|kindness|together|community|trust|enemy|neighbor|social)\b/i],
  ['Estudo', /\b(learn|stud(y|ies|ent)|educat|book|read|school|teach|lesson)\b/i],
  ['Sabedoria', /\b(philosoph|wisdom|wise|truth|knowledge|mind|reason|virtue|ignoran|understand|doubt)\b/i],
];
const categorize = (t) => (CATEGORIES.find(([, re]) => re.test(t)) || ['Motivação'])[0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, { timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'claude-quotes/1.0 (+github actions)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// 1. Coleta de frases (várias fontes; falhas são toleradas)
// ---------------------------------------------------------------------------
function accept(text) {
  return typeof text === 'string' && text.length <= MAX_LEN && !BLOCKLIST.test(text);
}
function onTheme(text) {
  return accept(text) && KEYWORDS.test(text);
}

async function collectFromStoic() {
  // Filosofia estoica — tema garantido, várias chamadas para variar
  const out = [];
  try {
    for (let i = 0; i < 3; i++) {
      const data = await getJSON('https://stoic-quotes.com/api/quotes');
      for (const r of data || []) {
        if (accept(r.text)) {
          out.push({ text: r.text, author: r.author || 'Desconhecido', tags: ['filosofia'] });
        }
      }
      await sleep(200);
    }
    console.log(`  stoic-quotes: ${out.length}`);
  } catch (e) {
    console.warn(`  stoic-quotes falhou: ${e.message}`);
  }
  return out;
}

async function collectFromDummyJSON() {
  // Grande acervo de citações; filtramos por tema (filosofia/estudo)
  const out = [];
  try {
    const data = await getJSON('https://dummyjson.com/quotes?limit=0');
    for (const r of data.quotes || []) {
      if (onTheme(r.quote)) {
        out.push({ text: r.quote, author: r.author || 'Desconhecido', tags: ['estudo'] });
      }
    }
    console.log(`  dummyjson (no tema): ${out.length}`);
  } catch (e) {
    console.warn(`  dummyjson falhou: ${e.message}`);
  }
  return out;
}

async function collectFromZen() {
  // Frases inspiradoras; filtramos por tema
  const out = [];
  try {
    const data = await getJSON('https://zenquotes.io/api/quotes');
    for (const r of data || []) {
      if (onTheme(r.q)) {
        out.push({ text: r.q, author: r.a || 'Desconhecido', tags: ['sabedoria'] });
      }
    }
    console.log(`  zenquotes (no tema): ${out.length}`);
  } catch (e) {
    console.warn(`  zenquotes falhou: ${e.message}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Tradução EN -> PT-BR (dois provedores gratuitos, com fallback)
// ---------------------------------------------------------------------------
async function translateGoogle(text) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=' +
    encodeURIComponent(text);
  const data = await getJSON(url);
  // resposta: [ [ [ "traduzido", "original", ... ], ... ], ... ]
  const parts = (data?.[0] || []).map((seg) => seg[0]).filter(Boolean);
  const joined = parts.join('').trim();
  if (!joined) throw new Error('tradução vazia (google)');
  return joined;
}

async function translateMyMemory(text) {
  const url =
    'https://api.mymemory.translated.net/get?langpair=en|pt-BR&q=' + encodeURIComponent(text);
  const data = await getJSON(url);
  const t = data?.responseData?.translatedText?.trim();
  if (!t) throw new Error('tradução vazia (mymemory)');
  return t;
}

async function translate(text) {
  try {
    return await translateGoogle(text);
  } catch (_) {
    return await translateMyMemory(text); // se falhar, propaga o erro
  }
}

// ---------------------------------------------------------------------------
// 3. Pipeline
// ---------------------------------------------------------------------------
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = (it.text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function shuffle(arr) {
  // Fisher-Yates determinístico o suficiente para variar a seleção
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  console.log('1) Coletando frases...');
  const collected = dedupe([
    ...(await collectFromStoic()),
    ...(await collectFromDummyJSON()),
    ...(await collectFromZen()),
  ]).filter((q) => q.text && q.text.length <= MAX_LEN);

  console.log(`   total único coletado: ${collected.length}`);
  if (collected.length === 0) {
    console.error('Nenhuma frase coletada. Abortando sem sobrescrever quotes.json.');
    process.exit(1);
  }

  shuffle(collected);
  const subset = collected.slice(0, TARGET);

  console.log(`2) Traduzindo ${subset.length} frases para pt-BR...`);
  const result = [];
  for (let i = 0; i < subset.length; i++) {
    const q = subset[i];
    try {
      const text = await translate(q.text);
      result.push({ text, author: q.author || 'Desconhecido', category: categorize(q.text) });
      process.stdout.write(`\r   ${i + 1}/${subset.length} ok   `);
    } catch (e) {
      process.stdout.write(`\r   ${i + 1}/${subset.length} pulada (${e.message})\n`);
    }
    await sleep(TRANSLATE_DELAY);
  }
  console.log(`\n   traduzidas: ${result.length}`);

  if (result.length === 0) {
    console.error('Nenhuma tradução obtida. Abortando sem sobrescrever quotes.json.');
    process.exit(1);
  }

  // Ordena por autor só para um diff estável no git
  result.sort((a, b) => (a.author + a.text).localeCompare(b.author + b.text, 'pt-BR'));

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`3) Gravado ${result.length} frases em ${OUT_FILE}`);
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
