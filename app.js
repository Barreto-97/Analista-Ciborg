/* =============================================
   ANALISTA ADUANEIRO v2 — app.js
   Multi-doc, Grouping, Cross-validation, Reports
   ============================================= */

// ─── STATE ───────────────────────────────────
const state = {
  files: [],          // { id, file, filename, type, lote, seq, text }
  history: JSON.parse(localStorage.getItem('aa_history') || '[]'),
  currentResult: null,
};

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const saved = sessionStorage.getItem('aa_apikey');
  if (saved) document.getElementById('topbar-apikey').value = saved;
  renderHistorico();
  renderIndicadores();
});

// ─── VIEW SWITCHING ───────────────────────────
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name));
}
function backToHome() {
  switchView('home');
}

// ─── API KEY ──────────────────────────────────
function toggleTopbarKey() {
  const inp = document.getElementById('topbar-apikey');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
function getApiKey() {
  const key = document.getElementById('topbar-apikey').value.trim();
  if (key) sessionStorage.setItem('aa_apikey', key);
  return key;
}

// ─── FILE PARSING: NAME → TYPE / LOTE / SEQ ──
//
// Pattern: <type>-<lote>[-<seq>].pdf
//   inv-1-1.pdf  → type=inv,  lote=1, seq=1
//   pack-2-3.pdf → type=pack, lote=2, seq=3
//   hbl-1.pdf    → type=hbl,  lote=1, seq=1
//
function parseFilename(filename) {
  const base = filename.replace(/\.pdf$/i, '').toLowerCase().trim();
  const invRe  = /^inv(?:oice)?[-_](\d+)(?:[-_](\d+))?/;
  const packRe = /^pack(?:ing)?(?:[-_]list)?[-_](\d+)(?:[-_](\d+))?/;
  const hblRe  = /^hbl?(?:[-_](\d+))?(?:[-_](\d+))?/;

  let m;
  if ((m = invRe.exec(base)))  return { type: 'inv',  lote: m[1] || '1', seq: m[2] || '1' };
  if ((m = packRe.exec(base))) return { type: 'pack', lote: m[1] || '1', seq: m[2] || '1' };
  if ((m = hblRe.exec(base)))  return { type: 'hbl',  lote: m[1] || '1', seq: m[2] || '1' };
  return null;
}

// ─── FILE UPLOAD ──────────────────────────────
function triggerUpload() {
  document.getElementById('file-upload').click();
}
function handleFilesSelected(e) {
  addFiles(Array.from(e.target.files));
  e.target.value = '';
}
function dragOver(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.add('drag-over');
}
function dragLeave() {
  document.getElementById('dropzone').classList.remove('drag-over');
}
function dropFiles(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
  if (!files.length) return showToast('Apenas arquivos PDF são aceitos.', 'error');
  addFiles(files);
}
function addFiles(newFiles) {
  newFiles.forEach(file => {
    if (state.files.find(f => f.filename === file.name)) return; // dedupe
    const parsed = parseFilename(file.name);
    state.files.push({
      id: Date.now() + Math.random(),
      file,
      filename: file.name,
      type: parsed?.type || 'unk',
      lote: parsed?.lote || '?',
      seq:  parsed?.seq  || '1',
      text: null,
    });
  });
  renderFileList();
}
function removeFile(id) {
  state.files = state.files.filter(f => f.id !== id);
  renderFileList();
}
function clearAllFiles() {
  state.files = [];
  renderFileList();
}

// ─── RENDER FILE LIST ─────────────────────────
function renderFileList() {
  const section = document.getElementById('file-list-section');
  if (!state.files.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  // Group by lote
  const groups = {};
  const unrecognized = [];
  state.files.forEach(f => {
    if (f.type === 'unk') { unrecognized.push(f); return; }
    if (!groups[f.lote]) groups[f.lote] = [];
    groups[f.lote].push(f);
  });

  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  Object.keys(groups).sort().forEach(lote => {
    const docs = groups[lote];
    const hasInv  = docs.some(d => d.type === 'inv');
    const hasPack = docs.some(d => d.type === 'pack');
    const hasHbl  = docs.some(d => d.type === 'hbl');
    const typeTags = [
      hasInv  ? '<span class="chip inv" style="font-size:0.65rem;padding:1px 7px">Invoice</span>' : '',
      hasPack ? '<span class="chip pack" style="font-size:0.65rem;padding:1px 7px">Packing</span>' : '',
      hasHbl  ? '<span class="chip hbl" style="font-size:0.65rem;padding:1px 7px">HBL</span>' : '',
    ].filter(Boolean).join('');

    const block = document.createElement('div');
    block.className = 'group-block';
    block.innerHTML = `
      <div class="group-header">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" stroke-width="2"/></svg>
        Lote ${lote}
        <div style="display:flex;gap:5px;margin-left:6px">${typeTags}</div>
        <span class="group-badge">${docs.length} arquivo${docs.length > 1 ? 's' : ''}</span>
      </div>
      <div class="file-rows">
        ${docs.map(f => fileRowHTML(f)).join('')}
      </div>`;
    container.appendChild(block);
  });

  // Unrecognized
  const unrecSec = document.getElementById('unrecognized-section');
  if (unrecognized.length) {
    unrecSec.style.display = 'block';
    document.getElementById('unrecognized-list').innerHTML =
      unrecognized.map(f => fileRowHTML(f)).join('');
  } else {
    unrecSec.style.display = 'none';
  }
}

function fileRowHTML(f) {
  const typeCls = f.type === 'unk' ? 'unk' : f.type;
  const typeLabel = { inv:'INV', pack:'PACK', hbl:'HBL', unk:'?' }[f.type] || '?';
  return `
    <div class="file-row">
      <span class="file-type-badge ${typeCls}">${typeLabel}</span>
      <span class="file-row-name">${escHtml(f.filename)}</span>
      <span class="file-row-size">${formatBytes(f.file.size)}</span>
      <button class="file-row-remove" onclick="removeFile(${f.id})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
      </button>
    </div>`;
}

// ─── PROCESSING PIPELINE ─────────────────────
async function startProcessing() {
  const apiKey = getApiKey();
  if (!apiKey) return showToast('Insira sua chave API Anthropic no campo do topo.', 'error');

  const recognized = state.files.filter(f => f.type !== 'unk');
  if (!recognized.length) return showToast('Adicione pelo menos um arquivo com nomenclatura correta.', 'error');

  const invFiles = recognized.filter(f => f.type === 'inv');
  if (!invFiles.length) return showToast('É necessário pelo menos uma Invoice (inv-X-X.pdf) para análise.', 'error');

  // Group by lote
  const lotes = {};
  recognized.forEach(f => {
    if (!lotes[f.lote]) lotes[f.lote] = { inv:[], pack:[], hbl:[] };
    lotes[f.lote][f.type].push(f);
  });

  const totalSteps = recognized.length + Object.keys(lotes).length;
  let step = 0;

  showLoading('Extraindo texto dos PDFs...');
  setProgress(0);

  // Step 1: Extract PDF text from all files
  for (const f of recognized) {
    setLoadingStep(`Extraindo: ${f.filename}`);
    try { f.text = await extractPDFText(f.file); }
    catch(e) { f.text = ''; console.warn('PDF extraction failed:', f.filename, e); }
    step++;
    setProgress(Math.round((step / totalSteps) * 60));
  }

  // Step 2: Analyze each lote
  const allLoteResults = [];
  const loteKeys = Object.keys(lotes).sort();

  for (const lote of loteKeys) {
    const loteData = lotes[lote];
    setLoadingStep(`Analisando lote ${lote} com IA...`);
    try {
      const result = await analyzeLote(lote, loteData, apiKey);
      allLoteResults.push(result);
    } catch(e) {
      console.error('Lote analysis failed:', lote, e);
      allLoteResults.push({ lote, error: e.message });
    }
    step++;
    setProgress(60 + Math.round(((allLoteResults.length) / loteKeys.length) * 38));
  }

  setProgress(100);
  setLoadingStep('Gerando relatório...');

  await sleep(400);
  hideLoading();

  // Build result
  const result = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    lotes: allLoteResults,
    totalDocs: recognized.length,
    label: `${recognized.length} docs · ${loteKeys.length} lote(s)`,
  };

  state.currentResult = result;

  // Save to history
  state.history.unshift({
    id: result.id,
    date: result.date,
    label: result.label,
    totalDocs: result.totalDocs,
    lotes: loteKeys,
    divergencias: countDivergencias(result),
    conformidades: countConformidades(result),
  });
  saveHistory();
  renderHistorico();
  renderIndicadores();
  renderResult(result);
  switchView('resultado');
}

// ─── ANALYZE ONE LOTE ─────────────────────────
async function analyzeLote(lote, loteData, apiKey) {
  const { inv, pack, hbl } = loteData;

  // Concatenate texts
  const invText  = inv.map(f  => `=== ${f.filename} ===\n${f.text}`).join('\n\n');
  const packText = pack.map(f => `=== ${f.filename} ===\n${f.text}`).join('\n\n');
  const hblText  = hbl.map(f  => `=== ${f.filename} ===\n${f.text}`).join('\n\n');

  const hasInv  = inv.length  > 0;
  const hasPack = pack.length > 0;
  const hasHbl  = hbl.length  > 0;

  const prompt = buildPrompt({ lote, invText, packText, hblText, hasInv, hasPack, hasHbl });
  const raw = await callClaude(prompt, apiKey);

  let parsed;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error('Resposta da IA não é JSON válido.');
  }

  return { lote, hasInv, hasPack, hasHbl, ...parsed };
}

// ─── PROMPT BUILDER ───────────────────────────
function buildPrompt({ lote, invText, packText, hblText, hasInv, hasPack, hasHbl }) {
  const sections = [];
  if (hasInv)  sections.push(`COMMERCIAL INVOICE(S) — LOTE ${lote}:\n${invText.slice(0, 10000)}`);
  if (hasPack) sections.push(`PACKING LIST(S) — LOTE ${lote}:\n${packText.slice(0, 6000)}`);
  if (hasHbl)  sections.push(`BILL OF LADING — LOTE ${lote}:\n${hblText.slice(0, 5000)}`);

  return `Você é um especialista em conferência documental aduaneira brasileira.

Analise os documentos do LOTE ${lote} abaixo e retorne APENAS um JSON válido (sem markdown, sem texto extra).

${sections.join('\n\n---\n\n')}

Retorne este JSON (preencha todos os campos, use null quando não houver informação):
{
  "invoice": {
    "exportador": "",
    "exportador_endereco": "",
    "fabricante": "",
    "fabricante_endereco": "",
    "importador": "",
    "importador_endereco": "",
    "numero": "",
    "data": "",
    "moeda": "",
    "valorTotal_declarado": 0,
    "valorTotal_calculado": 0,
    "divergencia_valor": false,
    "incoterm": "",
    "incoterm_local": "",
    "condicao_pagamento": "",
    "pais_origem": "",
    "pais_aquisicao": "",
    "pais_procedencia": "",
    "frete": null,
    "seguro": null,
    "pesoBruto_declarado": null,
    "pesoBruto_calculado": null,
    "pesoLiquido_declarado": null,
    "pesoLiquido_calculado": null,
    "divergencia_pesoBruto": false,
    "divergencia_pesoLiquido": false
  },
  "itens": [
    {
      "num": 1,
      "codigo": "",
      "descricao": "",
      "qty": 0,
      "unidade": "",
      "precoUnit": 0,
      "total_declarado": 0,
      "total_calculado": 0,
      "divergencia_calculo": false,
      "pesoLiquido": null,
      "pesoBruto": null,
      "hsncm": ""
    }
  ],
  "packingList": {
    "exportador": null,
    "exportador_ok": null,
    "pesoLiquido": null,
    "pesoBruto": null,
    "pesoLiquido_ok": null,
    "pesoBruto_ok": null,
    "qtd_volumes": null,
    "observacoes": ""
  },
  "hbl": {
    "shipper": null,
    "shipper_ok": null,
    "pesoBruto": null,
    "pesoBruto_ok": null,
    "descricao_carga": null,
    "descricao_compativel": null,
    "hsncm_prefixo": null,
    "hsncm_ok": null,
    "observacoes": ""
  },
  "validacoes": [
    {
      "id": "inv_valor_total",
      "categoria": "Invoice",
      "descricao": "Valor total declarado vs calculado (soma dos itens)",
      "status": "ok",
      "valor_declarado": null,
      "valor_calculado": null,
      "observacao": ""
    }
  ],
  "excecoes": [
    {
      "documento": "",
      "campo": "",
      "valor_encontrado": "",
      "valor_esperado": "",
      "observacao": ""
    }
  ]
}

REGRAS para "validacoes" — inclua TODAS as validações abaixo (use status: "na" se não aplicável):

SEMPRE incluir (se houver Invoice):
- inv_exportador: Exportador — nome e endereço presentes
- inv_invoice_num: Número da Invoice presente
- inv_data: Data da Invoice presente
- inv_incoterm: Incoterm informado
- inv_incoterm_local: Local do Incoterm informado
- inv_moeda: Moeda da transação
- inv_pais_origem: País de origem das mercadorias
- inv_cond_pagamento: Condição de pagamento
- inv_frete: Valor do frete informado
- inv_seguro: Valor do seguro informado
- inv_valor_total: Valor total declarado vs calculado
- inv_peso_liquido: Peso líquido total declarado vs calculado
- inv_peso_bruto: Peso bruto total declarado vs calculado
- inv_items_calculo: Erros de cálculo em itens (qty × precoUnit = total)
- inv_hsncm: NCM/HS Code presente nos itens

Se houver Packing List:
- cross_exportador_pack: Exportador Invoice vs Packing List
- cross_peso_liq_pack: Peso líquido Invoice vs Packing List
- cross_peso_bruto_pack: Peso bruto Invoice vs Packing List

Se houver HBL:
- cross_shipper_hbl: Exportador Invoice vs Shipper HBL
- cross_peso_bruto_hbl: Peso bruto Invoice (ou Packing) vs HBL
- cross_hsncm_hbl: NCM/HS prefixo (4 dígitos) Invoice vs HBL
- cross_descricao_hbl: Descrição mercadoria Invoice vs HBL (cruzamento semântico)

Para cada validação use status:
- "ok"   = conforme
- "nok"  = divergência encontrada
- "warn" = informação ausente ou incompleta
- "na"   = não aplicável (documento não enviado)

Para "excecoes": listar APENAS itens com status "nok". Deixar array vazio [] se não houver divergências.`;
}

// ─── CLAUDE API ───────────────────────────────
async function callClaude(prompt, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ─── RENDER RESULT ────────────────────────────
function renderResult(result) {
  const { lotes } = result;

  // Count totals
  let totalOk = 0, totalNok = 0, totalWarn = 0;
  lotes.forEach(l => {
    if (l.error) return;
    (l.validacoes || []).forEach(v => {
      if (v.status === 'ok')   totalOk++;
      else if (v.status === 'nok')  totalNok++;
      else if (v.status === 'warn') totalWarn++;
    });
  });

  document.getElementById('result-title').textContent = 'Resultado da Conferência';
  document.getElementById('result-subtitle').textContent =
    `${result.totalDocs} documento(s) analisado(s) · ${lotes.length} lote(s)`;

  // Summary bar
  document.getElementById('result-summary-bar').innerHTML = `
    <div class="summary-badge ok">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${totalOk} Conforme${totalOk !== 1 ? 's' : ''}
    </div>
    ${totalNok > 0 ? `<div class="summary-badge div">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
      ${totalNok} Divergência${totalNok !== 1 ? 's' : ''}
    </div>` : ''}
    ${totalWarn > 0 ? `<div class="summary-badge warn">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2"/><path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      ${totalWarn} Atenção
    </div>` : ''}
    <div class="summary-badge neutral">${lotes.length} lote(s)</div>`;

  // Tabs — one per lote + "Exceções" tab
  const tabBar = document.getElementById('result-tabs');
  const content = document.getElementById('result-content');

  let tabsHTML = lotes.map((l, i) =>
    `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="lote-${l.lote}" onclick="switchResultTab('lote-${l.lote}')">
      Lote ${l.lote}
      ${!l.error && countNok(l) > 0 ? `<span style="margin-left:5px;background:var(--red-bg);color:var(--red);border-radius:20px;padding:1px 7px;font-size:0.65rem;font-weight:700">${countNok(l)}</span>` : ''}
    </button>`
  ).join('');
  tabsHTML += `<button class="tab-btn" data-tab="excecoes" onclick="switchResultTab('excecoes')">
    Relatório de Exceções
    ${totalNok > 0 ? `<span style="margin-left:5px;background:var(--red-bg);color:var(--red);border-radius:20px;padding:1px 7px;font-size:0.65rem;font-weight:700">${totalNok}</span>` : ''}
  </button>`;
  tabsHTML += `<button class="tab-btn" data-tab="completo" onclick="switchResultTab('completo')">Relatório Completo</button>`;
  tabBar.innerHTML = tabsHTML;

  // Tab contents
  let contentHTML = lotes.map((l, i) =>
    `<div id="tab-lote-${l.lote}" class="tab-content${i === 0 ? ' active' : ''}">
      ${l.error ? `<div class="validation-row nok"><div class="v-icon nok">✗</div><div class="v-body"><div class="v-label">Erro ao processar lote ${l.lote}</div><div class="v-detail">${escHtml(l.error)}</div></div></div>` : renderLoteTab(l)}
    </div>`
  ).join('');

  // Exceptions tab
  const allExcecoes = [];
  lotes.forEach(l => {
    if (l.error || !l.excecoes) return;
    l.excecoes.forEach(e => allExcecoes.push({ ...e, lote: l.lote }));
  });
  contentHTML += `<div id="tab-excecoes" class="tab-content">${renderExceptionReport(allExcecoes)}</div>`;

  // Full report tab
  contentHTML += `<div id="tab-completo" class="tab-content">${renderFullReport(lotes)}</div>`;

  content.innerHTML = contentHTML;
}

function switchResultTab(name) {
  document.querySelectorAll('#result-tabs .tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('#result-content .tab-content').forEach(c =>
    c.classList.toggle('active', c.id === 'tab-' + name));
}

// ─── RENDER LOTE TAB ──────────────────────────
function renderLoteTab(l) {
  let html = '';

  // Resumo da Invoice
  if (l.invoice) {
    const inv = l.invoice;
    html += `<div class="result-section">
      <div class="result-section-title">📄 Dados da Invoice</div>
      <div class="resumo-grid">
        ${resumoCard('Invoice Nº', inv.numero)}
        ${resumoCard('Data', inv.data)}
        ${resumoCard('Exportador', inv.exportador)}
        ${resumoCard('Importador', inv.importador)}
        ${resumoCard('Incoterm', inv.incoterm ? `${inv.incoterm}${inv.incoterm_local ? ' / '+inv.incoterm_local : ''}` : null)}
        ${resumoCard('Moeda', inv.moeda)}
        ${resumoCard('Valor Total', inv.valorTotal_declarado ? `${inv.moeda || ''} ${fmtNum(inv.valorTotal_declarado)}` : null)}
        ${resumoCard('País de Origem', inv.pais_origem)}
        ${resumoCard('País de Aquisição', inv.pais_aquisicao)}
        ${resumoCard('Cond. Pagamento', inv.condicao_pagamento)}
        ${resumoCard('Frete', inv.frete != null ? fmtNum(inv.frete) : null)}
        ${resumoCard('Seguro', inv.seguro != null ? fmtNum(inv.seguro) : null)}
      </div>
    </div>`;
  }

  // Itens
  if (l.itens?.length) {
    html += `<div class="result-section">
      <div class="result-section-title">📦 Itens da Invoice (${l.itens.length})</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Código</th><th>Descrição</th>
            <th>Qty</th><th>Un.</th>
            <th>P. Unit.</th><th>Total Decl.</th><th>Total Calc.</th>
            <th>HS/NCM</th><th>Peso Líq.</th>
          </tr></thead>
          <tbody>
            ${l.itens.map(item => `<tr>
              <td>${item.num}</td>
              <td>${escHtml(item.codigo||'—')}</td>
              <td>${escHtml(item.descricao||'—')}</td>
              <td>${fmtNum(item.qty)}</td>
              <td>${escHtml(item.unidade||'—')}</td>
              <td>${fmtNum(item.precoUnit)}</td>
              <td class="${item.divergencia_calculo ? 'cell-error' : ''}">${fmtNum(item.total_declarado)}</td>
              <td class="${item.divergencia_calculo ? 'cell-warn' : ''}">${fmtNum(item.total_calculado)}</td>
              <td>${escHtml(item.hsncm||'—')}</td>
              <td>${escHtml(item.pesoLiquido||'—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  // Validações
  if (l.validacoes?.length) {
    const inv_vals  = l.validacoes.filter(v => v.categoria === 'Invoice' || v.id?.startsWith('inv_'));
    const cross_vals = l.validacoes.filter(v => v.id?.startsWith('cross_'));

    if (inv_vals.length) {
      html += `<div class="result-section">
        <div class="result-section-title">✅ Validações da Invoice</div>
        <div class="validation-list">${inv_vals.map(renderValidationRow).join('')}</div>
      </div>`;
    }
    if (cross_vals.length) {
      html += `<div class="result-section">
        <div class="result-section-title">🔗 Cruzamentos Documentais</div>
        <div class="validation-list">${cross_vals.map(renderValidationRow).join('')}</div>
      </div>`;
    }
  }

  return html || '<div class="no-data">Nenhum dado extraído.</div>';
}

function resumoCard(label, value) {
  return `<div class="resumo-card">
    <span class="resumo-label">${label}</span>
    <span class="resumo-value">${escHtml(value) || '<span style="color:var(--text-muted)">—</span>'}</span>
  </div>`;
}

function renderValidationRow(v) {
  const icons = {
    ok:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    nok:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    warn: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2"/><path d="M12 9v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    na:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  };
  const labels = { ok: 'CONFORME', nok: 'DIVERGÊNCIA', warn: 'ATENÇÃO', na: 'N/A' };
  const s = v.status || 'na';

  let valBoxes = '';
  if (v.valor_declarado != null || v.valor_calculado != null) {
    valBoxes = `<div class="v-values">
      ${v.valor_declarado != null ? `<div class="v-value-box${s==='nok'?' diff':''}"><span class="label">Declarado</span><span class="val">${escHtml(String(v.valor_declarado))}</span></div>` : ''}
      ${v.valor_calculado != null ? `<div class="v-value-box"><span class="label">Calculado</span><span class="val">${escHtml(String(v.valor_calculado))}</span></div>` : ''}
    </div>`;
  }

  return `<div class="validation-row ${s}">
    <div class="v-icon ${s}">${icons[s] || icons.na}</div>
    <div class="v-body">
      <div class="v-label">${escHtml(v.descricao)}</div>
      ${v.observacao ? `<div class="v-detail">${escHtml(v.observacao)}</div>` : ''}
      ${valBoxes}
    </div>
    <div class="v-status ${s}">${labels[s] || 'N/A'}</div>
  </div>`;
}

// ─── EXCEPTION REPORT ─────────────────────────
function renderExceptionReport(excecoes) {
  if (!excecoes.length) {
    return `<div style="text-align:center;padding:60px 20px">
      <div style="font-size:2rem;margin-bottom:12px">✅</div>
      <h3 style="color:var(--green);margin-bottom:8px">Nenhuma divergência encontrada</h3>
      <p style="color:var(--text-muted);font-size:0.82rem">Todos os documentos analisados estão conformes.</p>
    </div>`;
  }
  return `<div class="exception-list">
    ${excecoes.map(e => `
      <div class="exception-card">
        <div class="exc-header">
          <span class="exc-doc-badge">Lote ${e.lote} · ${escHtml(e.documento)}</span>
          <span class="exc-field">${escHtml(e.campo)}</span>
        </div>
        <div class="exc-values">
          <div class="exc-val-box found">
            <span class="label">Valor encontrado</span>
            <span class="val">${escHtml(e.valor_encontrado || '—')}</span>
          </div>
          <div class="exc-val-box">
            <span class="label">Valor esperado</span>
            <span class="val">${escHtml(e.valor_esperado || '—')}</span>
          </div>
        </div>
        <div class="exc-obs">${escHtml(e.observacao)}</div>
      </div>`).join('')}
  </div>`;
}

// ─── FULL REPORT ──────────────────────────────
function renderFullReport(lotes) {
  let html = '';
  lotes.forEach(l => {
    if (l.error) {
      html += `<div class="result-section"><div class="result-section-title">Lote ${l.lote} — ERRO</div><p style="color:var(--red)">${escHtml(l.error)}</p></div>`;
      return;
    }
    html += `<div class="result-section">
      <div class="result-section-title">📁 Lote ${l.lote} — Todas as Validações</div>
      <div class="validation-list">
        ${(l.validacoes || []).map(renderValidationRow).join('')}
      </div>
    </div>`;
  });
  return html || '<div class="no-data">Sem dados.</div>';
}

// ─── EXPORT EXCEL ─────────────────────────────
function exportExcelReport() {
  const result = state.currentResult;
  if (!result) return;

  const wb = XLSX.utils.book_new();

  result.lotes.forEach(l => {
    if (l.error) return;
    const loteLabel = `Lote ${l.lote}`;

    // Resumo sheet
    const resumo = [
      ['Campo', 'Valor'],
      ['Invoice Nº', l.invoice?.numero],
      ['Data', l.invoice?.data],
      ['Exportador', l.invoice?.exportador],
      ['Importador', l.invoice?.importador],
      ['Incoterm', l.invoice?.incoterm],
      ['Local Incoterm', l.invoice?.incoterm_local],
      ['Moeda', l.invoice?.moeda],
      ['Valor Total Declarado', l.invoice?.valorTotal_declarado],
      ['Valor Total Calculado', l.invoice?.valorTotal_calculado],
      ['País de Origem', l.invoice?.pais_origem],
      ['Condição Pagamento', l.invoice?.condicao_pagamento],
      ['Frete', l.invoice?.frete],
      ['Seguro', l.invoice?.seguro],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), `L${l.lote} Resumo`);

    // Itens sheet
    const itensH = ['#','Código','Descrição','Qty','Un.','P.Unit.','Total Decl.','Total Calc.','Divergência','HS/NCM','Peso Líq.'];
    const itensR = (l.itens || []).map(i => [
      i.num, i.codigo, i.descricao, i.qty, i.unidade,
      i.precoUnit, i.total_declarado, i.total_calculado,
      i.divergencia_calculo ? 'SIM' : 'NÃO',
      i.hsncm, i.pesoLiquido,
    ]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([itensH, ...itensR]), `L${l.lote} Itens`);

    // Validações sheet
    const valH = ['ID','Categoria','Descrição','Status','Declarado','Calculado','Observação'];
    const valR = (l.validacoes || []).map(v => [
      v.id, v.categoria, v.descricao,
      { ok:'CONFORME', nok:'DIVERGÊNCIA', warn:'ATENÇÃO', na:'N/A' }[v.status] || v.status,
      v.valor_declarado, v.valor_calculado, v.observacao,
    ]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([valH, ...valR]), `L${l.lote} Validações`);

    // Exceções sheet
    const excH = ['Documento','Campo','Valor Encontrado','Valor Esperado','Observação'];
    const excR = (l.excecoes || []).map(e => [e.documento, e.campo, e.valor_encontrado, e.valor_esperado, e.observacao]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([excH, ...excR]), `L${l.lote} Exceções`);
  });

  const ts = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Conferencia_Aduaneira_${ts}.xlsx`);
  showToast('Relatório Excel exportado!', 'success');
}

function printReport() {
  window.print();
}

// ─── HISTÓRICO ────────────────────────────────
function renderHistorico() {
  const list = document.getElementById('historico-list');
  const empty = document.getElementById('historico-empty');
  if (!state.history.length) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = state.history.map(h => `
    <div class="analysis-card">
      <div class="ac-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" stroke-width="2"/></svg>
      </div>
      <div class="ac-main">
        <div class="ac-title">${fmtDate(h.date)}</div>
        <div class="ac-meta">
          <span>${h.totalDocs} docs</span>
          <span>Lotes: ${h.lotes.join(', ')}</span>
          <span>${h.label}</span>
        </div>
      </div>
      <div class="ac-badges">
        ${h.divergencias > 0 ? `<span class="badge-nok">${h.divergencias} divergência${h.divergencias > 1 ? 's' : ''}</span>` : ''}
        ${h.conformidades > 0 ? `<span class="badge-ok">${h.conformidades} conforme${h.conformidades > 1 ? 's' : ''}</span>` : ''}
      </div>
    </div>`).join('');
}

// ─── INDICADORES ──────────────────────────────
function renderIndicadores() {
  const h = state.history;
  const totalConf = h.length;
  const totalDocs = h.reduce((s, i) => s + i.totalDocs, 0);
  const totalDiv  = h.reduce((s, i) => s + i.divergencias, 0);
  const totalOk   = h.reduce((s, i) => s + i.conformidades, 0);
  const taxa      = (totalOk + totalDiv) > 0
    ? Math.round((totalOk / (totalOk + totalDiv)) * 100) + '%' : '—';

  document.getElementById('kpi-conf').textContent = totalConf;
  document.getElementById('kpi-docs').textContent = totalDocs;
  document.getElementById('kpi-div').textContent  = totalDiv;
  document.getElementById('kpi-taxa').textContent = taxa;

  // Top divergências
  const freq = {};
  h.forEach(hi => {
    // We don't store detailed divergence labels in history — show field-level placeholder
  });
  document.getElementById('top-divergencias').innerHTML =
    totalDiv === 0
      ? '<div class="no-data">Nenhuma divergência registrada.</div>'
      : `<div class="finding-row"><span class="finding-rank">—</span><div class="finding-bar-wrap"><div class="finding-label">Total de divergências acumuladas</div><div class="finding-bar-bg"><div class="finding-bar-fill" style="width:100%"></div></div></div><span class="finding-count">${totalDiv}</span></div>`;
}

// ─── HELPERS ─────────────────────────────────
function countDivergencias(result) {
  let n = 0;
  result.lotes.forEach(l => {
    if (!l.error) (l.validacoes || []).forEach(v => { if (v.status === 'nok') n++; });
  });
  return n;
}
function countConformidades(result) {
  let n = 0;
  result.lotes.forEach(l => {
    if (!l.error) (l.validacoes || []).forEach(v => { if (v.status === 'ok') n++; });
  });
  return n;
}
function countNok(lote) {
  return (lote.validacoes || []).filter(v => v.status === 'nok').length;
}

function showLoading(msg) {
  document.getElementById('loading-overlay').style.display = 'flex';
  document.getElementById('loading-step').textContent = msg || '';
}
function setLoadingStep(s) { document.getElementById('loading-step').textContent = s; }
function setProgress(pct) { document.getElementById('loading-bar').style.width = pct + '%'; }
function hideLoading()  { document.getElementById('loading-overlay').style.display = 'none'; }

let _toast;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast' + (type ? ' ' + type : '');
  el.style.display = 'block';
  clearTimeout(_toast);
  _toast = setTimeout(() => { el.style.display = 'none'; }, 3800);
}

function saveHistory() {
  try { localStorage.setItem('aa_history', JSON.stringify(state.history.slice(0, 50))); }
  catch(e) { console.warn('localStorage full'); }
}

function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtNum(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return n != null ? String(n) : '—';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function extractPDFText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(it => it.str).join(' ') + '\n';
        }
        resolve(text);
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
}
