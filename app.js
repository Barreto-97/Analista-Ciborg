/* =============================================
   ANALISTA ADUANEIRO — app.js (Gemini)
   Todas as chamadas passam pelo Cloudflare Worker
   que usa Google Gemini 2.0 Flash (gratuito).
   ============================================= */

const state = {
  files: [],
  history: JSON.parse(localStorage.getItem('aa_history') || '[]'),
  currentResult: null,
};

document.addEventListener('DOMContentLoaded', () => {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  checkWorkerStatus();
  renderHistorico();
  renderIndicadores();
});

// ─── WORKER STATUS ────────────────────────────
async function checkWorkerStatus() {
  const dot   = document.getElementById('worker-dot');
  const label = document.getElementById('worker-label');

  if (!CONFIG?.WORKER_URL || CONFIG.WORKER_URL.includes('SEU-WORKER')) {
    dot.className = 'worker-dot error';
    label.textContent = 'Worker não configurado';
    return;
  }
  dot.className = 'worker-dot pending';
  label.textContent = 'Verificando...';
  try {
    // Envia { ping: true } — o Worker responde sem chamar o Gemini
    const res = await fetch(CONFIG.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ping: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok === false || data.error) {
      dot.className = 'worker-dot error';
      label.textContent = data.message || 'Chave Gemini não configurada';
    } else {
      dot.className = 'worker-dot ok';
      label.textContent = 'IA conectada (gratuito)';
    }
  } catch {
    dot.className = 'worker-dot error';
    label.textContent = 'Worker inacessível';
  }
}

// ─── VIEW ─────────────────────────────────────
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name));
}
function backToHome() { switchView('home'); }

// ─── FILE PARSING ─────────────────────────────
function parseFilename(filename) {
  const base = filename.replace(/\.pdf$/i, '').toLowerCase().trim();
  const invRe  = /^inv(?:oice)?[-_](\d+)(?:[-_](\d+))?/;
  const packRe = /^pack(?:ing)?(?:[-_]list)?[-_](\d+)(?:[-_](\d+))?/;
  const hblRe  = /^hbl?(?:[-_](\d+))?(?:[-_](\d+))?/;
  let m;
  if ((m = invRe.exec(base)))  return { type:'inv',  lote: m[1]||'1', seq: m[2]||'1' };
  if ((m = packRe.exec(base))) return { type:'pack', lote: m[1]||'1', seq: m[2]||'1' };
  if ((m = hblRe.exec(base)))  return { type:'hbl',  lote: m[1]||'1', seq: m[2]||'1' };
  return null;
}

// ─── FILE UPLOAD ──────────────────────────────
function triggerUpload() { document.getElementById('file-upload').click(); }
function handleFilesSelected(e) { addFiles(Array.from(e.target.files)); e.target.value = ''; }
function dragOver(e) { e.preventDefault(); document.getElementById('dropzone').classList.add('drag-over'); }
function dragLeave()  { document.getElementById('dropzone').classList.remove('drag-over'); }
function dropFiles(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
  if (!files.length) return showToast('Apenas PDFs são aceitos.', 'error');
  addFiles(files);
}
function addFiles(newFiles) {
  newFiles.forEach(file => {
    if (state.files.find(f => f.filename === file.name)) return;
    const parsed = parseFilename(file.name);
    state.files.push({
      id: Date.now() + Math.random(),
      file, filename: file.name,
      type: parsed?.type || 'unk',
      lote: parsed?.lote || '?',
      seq:  parsed?.seq  || '1',
      text: null,
    });
  });
  renderFileList();
}
function removeFile(id) { state.files = state.files.filter(f => f.id !== id); renderFileList(); }
function clearAllFiles() { state.files = []; renderFileList(); }

// ─── RENDER FILE LIST ─────────────────────────
function renderFileList() {
  const section = document.getElementById('file-list-section');
  if (!state.files.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const groups = {}, unrecognized = [];
  state.files.forEach(f => {
    if (f.type === 'unk') { unrecognized.push(f); return; }
    if (!groups[f.lote]) groups[f.lote] = [];
    groups[f.lote].push(f);
  });

  const container = document.getElementById('groups-container');
  container.innerHTML = '';
  Object.keys(groups).sort().forEach(lote => {
    const docs = groups[lote];
    const tags = [
      docs.some(d=>d.type==='inv')  ? '<span class="chip inv"  style="font-size:.65rem;padding:1px 7px">Invoice</span>'  : '',
      docs.some(d=>d.type==='pack') ? '<span class="chip pack" style="font-size:.65rem;padding:1px 7px">Packing</span>' : '',
      docs.some(d=>d.type==='hbl')  ? '<span class="chip hbl"  style="font-size:.65rem;padding:1px 7px">HBL</span>'     : '',
    ].filter(Boolean).join('');
    const block = document.createElement('div');
    block.className = 'group-block';
    block.innerHTML = `
      <div class="group-header">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" stroke-width="2"/></svg>
        Lote ${lote}
        <div style="display:flex;gap:5px;margin-left:6px">${tags}</div>
        <span class="group-badge">${docs.length} arquivo${docs.length>1?'s':''}</span>
      </div>
      <div class="file-rows">${docs.map(fileRowHTML).join('')}</div>`;
    container.appendChild(block);
  });

  const unrecSec = document.getElementById('unrecognized-section');
  unrecSec.style.display = unrecognized.length ? 'block' : 'none';
  if (unrecognized.length)
    document.getElementById('unrecognized-list').innerHTML = unrecognized.map(fileRowHTML).join('');
}

function fileRowHTML(f) {
  const cls   = f.type === 'unk' ? 'unk' : f.type;
  const label = { inv:'INV', pack:'PACK', hbl:'HBL', unk:'?' }[f.type] || '?';
  return `<div class="file-row">
    <span class="file-type-badge ${cls}">${label}</span>
    <span class="file-row-name">${escHtml(f.filename)}</span>
    <span class="file-row-size">${formatBytes(f.file.size)}</span>
    <button class="file-row-remove" onclick="removeFile(${f.id})">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
    </button>
  </div>`;
}

// ─── PROCESSING ───────────────────────────────
async function startProcessing() {
  if (!CONFIG?.WORKER_URL || CONFIG.WORKER_URL.includes('SEU-WORKER'))
    return showToast('Configure o WORKER_URL no config.js.', 'error');

  const recognized = state.files.filter(f => f.type !== 'unk');
  if (!recognized.length) return showToast('Adicione arquivos com nomenclatura correta.', 'error');
  if (!recognized.some(f => f.type === 'inv')) return showToast('Necessário ao menos uma Invoice (inv-X-X.pdf).', 'error');

  const lotes = {};
  recognized.forEach(f => {
    if (!lotes[f.lote]) lotes[f.lote] = { inv:[], pack:[], hbl:[] };
    lotes[f.lote][f.type].push(f);
  });
  const loteKeys = Object.keys(lotes).sort();
  let step = 0;
  const total = recognized.length + loteKeys.length;

  showLoading('Extraindo texto dos PDFs...');
  setProgress(0);

  for (const f of recognized) {
    setLoadingStep(`Lendo: ${f.filename}`);
    try { f.text = await extractPDFText(f.file); } catch { f.text = ''; }
    setProgress(Math.round((++step / total) * 55));
  }

  const allResults = [];
  for (const lote of loteKeys) {
    setLoadingStep(`Analisando lote ${lote} com Gemini...`);
    try { allResults.push(await analyzeLote(lote, lotes[lote])); }
    catch(e) { allResults.push({ lote, error: e.message }); }
    // Pausa entre lotes para respeitar o limite de RPM do Gemini gratuito
    if (loteKeys.indexOf(lote) < loteKeys.length - 1) {
      setLoadingStep('Aguardando limite de requisições...');
      await sleep(8000);
    }
    setProgress(55 + Math.round((allResults.length / loteKeys.length) * 43));
  }

  setProgress(100);
  setLoadingStep('Gerando relatório...');
  await sleep(350);
  hideLoading();

  const result = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    lotes: allResults,
    totalDocs: recognized.length,
    label: `${recognized.length} docs · ${loteKeys.length} lote(s)`,
  };
  state.currentResult = result;

  state.history.unshift({
    id: result.id, date: result.date, label: result.label,
    totalDocs: result.totalDocs, lotes: loteKeys,
    divergencias: countDivergencias(result),
    conformidades: countConformidades(result),
  });
  saveHistory();
  renderHistorico();
  renderIndicadores();
  renderResult(result);
  switchView('resultado');
}

// ─── ANALYZE LOTE ─────────────────────────────
async function analyzeLote(lote, loteData) {
  const { inv, pack, hbl } = loteData;
  const invText  = inv.map(f  => `=== ${f.filename} ===\n${f.text}`).join('\n\n');
  const packText = pack.map(f => `=== ${f.filename} ===\n${f.text}`).join('\n\n');
  const hblText  = hbl.map(f  => `=== ${f.filename} ===\n${f.text}`).join('\n\n');

  const prompt = buildPrompt({
    lote, invText, packText, hblText,
    hasInv: inv.length > 0, hasPack: pack.length > 0, hasHbl: hbl.length > 0,
  });

  const raw = await callWorker(prompt);

  // Gemini com responseMimeType json retorna JSON limpo, mas por segurança:
  let parsed;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error('Resposta não é JSON válido. Tente novamente.');
  }
  return { lote, hasInv: inv.length>0, hasPack: pack.length>0, hasHbl: hbl.length>0, ...parsed };
}

// ─── CALL WORKER ──────────────────────────────
async function callWorker(prompt) {
  const res = await fetch(CONFIG.WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || '';
}

// ─── PROMPT ───────────────────────────────────
function buildPrompt({ lote, invText, packText, hblText, hasInv, hasPack, hasHbl }) {
  const sections = [];
  if (hasInv)  sections.push(`COMMERCIAL INVOICE(S) — LOTE ${lote}:\n${invText.slice(0, 4000)}`);
  if (hasPack) sections.push(`PACKING LIST(S) — LOTE ${lote}:\n${packText.slice(0, 2000)}`);
  if (hasHbl)  sections.push(`BILL OF LADING — LOTE ${lote}:\n${hblText.slice(0, 2000)}`);

  return `Você é um especialista em conferência documental aduaneira brasileira.

Analise os documentos do LOTE ${lote} e retorne APENAS um JSON válido (sem markdown, sem texto extra).

${sections.join('\n\n---\n\n')}

Retorne exatamente este JSON (use null para campos não encontrados):
{
  "invoice": {
    "exportador": "", "exportador_endereco": "",
    "fabricante": "", "fabricante_endereco": "",
    "importador": "", "importador_endereco": "",
    "numero": "", "data": "", "moeda": "",
    "valorTotal_declarado": 0, "valorTotal_calculado": 0,
    "incoterm": "", "incoterm_local": "",
    "condicao_pagamento": "",
    "pais_origem": "", "pais_aquisicao": "", "pais_procedencia": "",
    "frete": null, "seguro": null,
    "pesoBruto_declarado": null, "pesoBruto_calculado": null,
    "pesoLiquido_declarado": null, "pesoLiquido_calculado": null
  },
  "itens": [
    {
      "num": 1, "codigo": "", "descricao": "",
      "qty": 0, "unidade": "",
      "precoUnit": 0, "total_declarado": 0, "total_calculado": 0,
      "divergencia_calculo": false,
      "pesoLiquido": null, "pesoBruto": null, "hsncm": ""
    }
  ],
  "packingList": {
    "exportador": null, "exportador_ok": null,
    "pesoLiquido": null, "pesoBruto": null,
    "pesoLiquido_ok": null, "pesoBruto_ok": null,
    "qtd_volumes": null, "observacoes": ""
  },
  "hbl": {
    "shipper": null, "shipper_ok": null,
    "pesoBruto": null, "pesoBruto_ok": null,
    "descricao_carga": null, "descricao_compativel": null,
    "hsncm_prefixo": null, "hsncm_ok": null, "observacoes": ""
  },
  "validacoes": [
    {
      "id": "inv_exportador",
      "categoria": "Invoice",
      "descricao": "Exportador presente (nome + endereço)",
      "status": "ok",
      "valor_declarado": null,
      "valor_calculado": null,
      "observacao": ""
    }
  ],
  "excecoes": []
}

REGRAS para "validacoes" — inclua todas abaixo (status "na" se não aplicável):

Invoice (sempre):
- inv_exportador: Exportador presente (nome + endereço)
- inv_invoice_num: Número da Invoice presente
- inv_data: Data da Invoice presente
- inv_incoterm: Incoterm informado
- inv_incoterm_local: Local do Incoterm informado
- inv_moeda: Moeda da transação presente
- inv_pais_origem: País de origem presente
- inv_cond_pagamento: Condição de pagamento presente
- inv_frete: Valor do frete informado
- inv_seguro: Valor do seguro informado
- inv_valor_total: Valor total declarado vs soma dos itens
- inv_peso_liquido: Peso líquido declarado vs calculado
- inv_peso_bruto: Peso bruto declarado vs calculado
- inv_items_calculo: Erros de cálculo por item (qty × precoUnit ≠ total)
- inv_hsncm: NCM/HS Code presente nos itens

Com Packing List:
- cross_exportador_pack: Exportador Invoice vs Packing List
- cross_peso_liq_pack: Peso líquido Invoice vs Packing List
- cross_peso_bruto_pack: Peso bruto Invoice vs Packing List

Com HBL:
- cross_shipper_hbl: Exportador Invoice vs Shipper HBL
- cross_peso_bruto_hbl: Peso bruto Invoice vs HBL
- cross_hsncm_hbl: NCM/HS (4 primeiros dígitos) Invoice vs HBL
- cross_descricao_hbl: Descrição mercadoria Invoice vs HBL (análise semântica)

Status: "ok" = conforme | "nok" = divergência | "warn" = ausente/incompleto | "na" = não aplicável
"excecoes": apenas itens com status "nok" — campo, documento, valor_encontrado, valor_esperado, observacao.`;
}

// ─── RENDER ───────────────────────────────────
function renderResult(result) {
  const { lotes } = result;
  let totalOk=0, totalNok=0, totalWarn=0;
  lotes.forEach(l => { if(!l.error) (l.validacoes||[]).forEach(v=>{
    if(v.status==='ok') totalOk++;
    else if(v.status==='nok') totalNok++;
    else if(v.status==='warn') totalWarn++;
  }); });

  document.getElementById('result-subtitle').textContent =
    `${result.totalDocs} documento(s) · ${lotes.length} lote(s)`;

  document.getElementById('result-summary-bar').innerHTML = `
    <div class="summary-badge ok">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${totalOk} Conforme${totalOk!==1?'s':''}
    </div>
    ${totalNok>0?`<div class="summary-badge div"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>${totalNok} Divergência${totalNok!==1?'s':''}</div>`:''}
    ${totalWarn>0?`<div class="summary-badge warn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2"/><path d="M12 9v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>${totalWarn} Atenção</div>`:''}
    <div class="summary-badge neutral">${lotes.length} lote(s)</div>`;

  const tabBar = document.getElementById('result-tabs');
  let tabsHTML = lotes.map((l,i) => {
    const nok = !l.error ? countNok(l) : 0;
    return `<button class="tab-btn${i===0?' active':''}" data-tab="lote-${l.lote}" onclick="switchResultTab('lote-${l.lote}')">Lote ${l.lote}${nok>0?`<span style="margin-left:5px;background:var(--red-bg);color:var(--red);border-radius:20px;padding:1px 7px;font-size:.65rem;font-weight:700">${nok}</span>`:''}</button>`;
  }).join('');
  tabsHTML += `<button class="tab-btn" data-tab="excecoes" onclick="switchResultTab('excecoes')">Exceções${totalNok>0?`<span style="margin-left:5px;background:var(--red-bg);color:var(--red);border-radius:20px;padding:1px 7px;font-size:.65rem;font-weight:700">${totalNok}</span>`:''}</button>`;
  tabsHTML += `<button class="tab-btn" data-tab="completo" onclick="switchResultTab('completo')">Relatório Completo</button>`;
  tabBar.innerHTML = tabsHTML;

  let html = lotes.map((l,i) =>
    `<div id="tab-lote-${l.lote}" class="tab-content${i===0?' active':''}">${l.error?errorBlock(l):renderLoteTab(l)}</div>`
  ).join('');

  const allExc = [];
  lotes.forEach(l => { if(!l.error && l.excecoes) l.excecoes.forEach(e => allExc.push({...e,lote:l.lote})); });
  html += `<div id="tab-excecoes" class="tab-content">${renderExceptionReport(allExc)}</div>`;
  html += `<div id="tab-completo" class="tab-content">${renderFullReport(lotes)}</div>`;
  document.getElementById('result-content').innerHTML = html;
}

function switchResultTab(name) {
  document.querySelectorAll('#result-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('#result-content .tab-content').forEach(c => c.classList.toggle('active', c.id==='tab-'+name));
}

function errorBlock(l) {
  return `<div class="validation-row nok" style="margin-top:12px">
    <div class="v-icon nok"><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></div>
    <div class="v-body"><div class="v-label">Erro no lote ${l.lote}</div><div class="v-detail">${escHtml(l.error)}</div></div>
  </div>`;
}

function renderLoteTab(l) {
  let html = '';
  if (l.invoice) {
    const inv = l.invoice;
    html += `<div class="result-section">
      <div class="result-section-title">📄 Dados da Invoice</div>
      <div class="resumo-grid">
        ${rc('Invoice Nº',inv.numero)} ${rc('Data',inv.data)}
        ${rc('Exportador',inv.exportador)} ${rc('Fabricante',inv.fabricante)}
        ${rc('Importador',inv.importador)}
        ${rc('Incoterm',inv.incoterm?`${inv.incoterm}${inv.incoterm_local?' / '+inv.incoterm_local:''}`:null)}
        ${rc('Moeda',inv.moeda)}
        ${rc('Valor Total',inv.valorTotal_declarado?`${inv.moeda||''} ${fmtNum(inv.valorTotal_declarado)}`:null)}
        ${rc('País de Origem',inv.pais_origem)} ${rc('Cond. Pagamento',inv.condicao_pagamento)}
        ${rc('Frete',inv.frete!=null?fmtNum(inv.frete):null)}
        ${rc('Seguro',inv.seguro!=null?fmtNum(inv.seguro):null)}
        ${rc('Peso Bruto',inv.pesoBruto_declarado)} ${rc('Peso Líquido',inv.pesoLiquido_declarado)}
      </div>
    </div>`;
  }
  if (l.itens?.length) {
    html += `<div class="result-section">
      <div class="result-section-title">📦 Itens (${l.itens.length})</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>Qty</th><th>Un.</th><th>P.Unit.</th><th>Total Decl.</th><th>Total Calc.</th><th>HS/NCM</th><th>Peso Líq.</th></tr></thead>
        <tbody>${l.itens.map(i=>`<tr>
          <td>${i.num}</td><td>${escHtml(i.codigo||'—')}</td><td>${escHtml(i.descricao||'—')}</td>
          <td>${fmtNum(i.qty)}</td><td>${escHtml(i.unidade||'—')}</td><td>${fmtNum(i.precoUnit)}</td>
          <td class="${i.divergencia_calculo?'cell-error':''}">${fmtNum(i.total_declarado)}</td>
          <td class="${i.divergencia_calculo?'cell-warn':''}">${fmtNum(i.total_calculado)}</td>
          <td>${escHtml(i.hsncm||'—')}</td><td>${escHtml(i.pesoLiquido||'—')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }
  const invV   = (l.validacoes||[]).filter(v => v.id?.startsWith('inv_'));
  const crossV = (l.validacoes||[]).filter(v => v.id?.startsWith('cross_'));
  if (invV.length)   html += `<div class="result-section"><div class="result-section-title">✅ Validações da Invoice</div><div class="validation-list">${invV.map(renderValidationRow).join('')}</div></div>`;
  if (crossV.length) html += `<div class="result-section"><div class="result-section-title">🔗 Cruzamentos Documentais</div><div class="validation-list">${crossV.map(renderValidationRow).join('')}</div></div>`;
  return html || '<div class="no-data">Nenhum dado extraído.</div>';
}

function rc(label, value) {
  return `<div class="resumo-card"><span class="resumo-label">${label}</span><span class="resumo-value">${escHtml(value)||'<span style="color:var(--text-muted)">—</span>'}</span></div>`;
}

function renderValidationRow(v) {
  const icons = {
    ok:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    nok:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    warn: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2"/><path d="M12 9v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    na:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  };
  const labels = { ok:'CONFORME', nok:'DIVERGÊNCIA', warn:'ATENÇÃO', na:'N/A' };
  const s = v.status||'na';
  let valBoxes = '';
  if (v.valor_declarado!=null||v.valor_calculado!=null) {
    valBoxes=`<div class="v-values">
      ${v.valor_declarado!=null?`<div class="v-value-box${s==='nok'?' diff':''}"><span class="label">Declarado</span><span class="val">${escHtml(String(v.valor_declarado))}</span></div>`:''}
      ${v.valor_calculado!=null?`<div class="v-value-box"><span class="label">Calculado</span><span class="val">${escHtml(String(v.valor_calculado))}</span></div>`:''}
    </div>`;
  }
  return `<div class="validation-row ${s}">
    <div class="v-icon ${s}">${icons[s]||icons.na}</div>
    <div class="v-body">
      <div class="v-label">${escHtml(v.descricao)}</div>
      ${v.observacao?`<div class="v-detail">${escHtml(v.observacao)}</div>`:''}
      ${valBoxes}
    </div>
    <div class="v-status ${s}">${labels[s]||'N/A'}</div>
  </div>`;
}

function renderExceptionReport(excecoes) {
  if (!excecoes.length) return `<div style="text-align:center;padding:60px 20px">
    <div style="font-size:2.5rem;margin-bottom:14px">✅</div>
    <h3 style="color:var(--green);margin-bottom:8px">Nenhuma divergência encontrada</h3>
    <p style="color:var(--text-muted);font-size:.82rem">Todos os documentos estão conformes.</p>
  </div>`;
  return `<div class="exception-list">${excecoes.map(e=>`
    <div class="exception-card">
      <div class="exc-header"><span class="exc-doc-badge">Lote ${e.lote} · ${escHtml(e.documento)}</span><span class="exc-field">${escHtml(e.campo)}</span></div>
      <div class="exc-values">
        <div class="exc-val-box found"><span class="label">Valor encontrado</span><span class="val">${escHtml(e.valor_encontrado||'—')}</span></div>
        <div class="exc-val-box"><span class="label">Valor esperado</span><span class="val">${escHtml(e.valor_esperado||'—')}</span></div>
      </div>
      <div class="exc-obs">${escHtml(e.observacao)}</div>
    </div>`).join('')}</div>`;
}

function renderFullReport(lotes) {
  return lotes.map(l => l.error ? errorBlock(l) :
    `<div class="result-section">
      <div class="result-section-title">📁 Lote ${l.lote} — Todas as Validações</div>
      <div class="validation-list">${(l.validacoes||[]).map(renderValidationRow).join('')}</div>
    </div>`
  ).join('') || '<div class="no-data">Sem dados.</div>';
}

// ─── EXPORT EXCEL ─────────────────────────────
function exportExcelReport() {
  const result = state.currentResult;
  if (!result) return;
  const wb = XLSX.utils.book_new();
  result.lotes.forEach(l => {
    if (l.error) return;
    const inv = l.invoice || {};
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Campo','Valor'],
      ['Invoice Nº',inv.numero],['Data',inv.data],['Exportador',inv.exportador],
      ['Fabricante',inv.fabricante],['Importador',inv.importador],
      ['Incoterm',inv.incoterm],['Local Incoterm',inv.incoterm_local],
      ['Moeda',inv.moeda],['Valor Total Declarado',inv.valorTotal_declarado],
      ['Valor Total Calculado',inv.valorTotal_calculado],
      ['País de Origem',inv.pais_origem],['Cond. Pagamento',inv.condicao_pagamento],
      ['Frete',inv.frete],['Seguro',inv.seguro],
    ]), `L${l.lote} Resumo`);
    const ih=['#','Código','Descrição','Qty','Un.','P.Unit.','Total Decl.','Total Calc.','Diverg.','HS/NCM','Peso Líq.'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ih,
      ...(l.itens||[]).map(i=>[i.num,i.codigo,i.descricao,i.qty,i.unidade,i.precoUnit,i.total_declarado,i.total_calculado,i.divergencia_calculo?'SIM':'NÃO',i.hsncm,i.pesoLiquido])
    ]), `L${l.lote} Itens`);
    const vh=['ID','Categoria','Descrição','Status','Declarado','Calculado','Observação'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([vh,
      ...(l.validacoes||[]).map(v=>[v.id,v.categoria,v.descricao,{ok:'CONFORME',nok:'DIVERGÊNCIA',warn:'ATENÇÃO',na:'N/A'}[v.status]||v.status,v.valor_declarado,v.valor_calculado,v.observacao])
    ]), `L${l.lote} Validações`);
    const eh=['Documento','Campo','Valor Encontrado','Valor Esperado','Observação'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([eh,
      ...(l.excecoes||[]).map(e=>[e.documento,e.campo,e.valor_encontrado,e.valor_esperado,e.observacao])
    ]), `L${l.lote} Exceções`);
  });
  XLSX.writeFile(wb, `Conferencia_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Excel exportado!', 'success');
}

// ─── HISTÓRICO / INDICADORES ──────────────────
function renderHistorico() {
  const list  = document.getElementById('historico-list');
  const empty = document.getElementById('historico-empty');
  if (!state.history.length) { list.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display='none';
  list.innerHTML = state.history.map(h=>`
    <div class="analysis-card">
      <div class="ac-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" stroke-width="2"/></svg></div>
      <div class="ac-main">
        <div class="ac-title">${fmtDate(h.date)}</div>
        <div class="ac-meta"><span>${h.totalDocs} docs</span><span>Lotes: ${h.lotes.join(', ')}</span></div>
      </div>
      <div class="ac-badges">
        ${h.divergencias>0?`<span class="badge-nok">${h.divergencias} divergência${h.divergencias>1?'s':''}</span>`:''}
        ${h.conformidades>0?`<span class="badge-ok">${h.conformidades} conforme${h.conformidades>1?'s':''}</span>`:''}
      </div>
    </div>`).join('');
}

function renderIndicadores() {
  const h=state.history;
  const tD=h.length, tDocs=h.reduce((s,i)=>s+i.totalDocs,0),
        tDiv=h.reduce((s,i)=>s+i.divergencias,0),
        tOk=h.reduce((s,i)=>s+i.conformidades,0);
  const taxa=(tOk+tDiv)>0?Math.round((tOk/(tOk+tDiv))*100)+'%':'—';
  document.getElementById('kpi-conf').textContent=tD;
  document.getElementById('kpi-docs').textContent=tDocs;
  document.getElementById('kpi-div').textContent=tDiv;
  document.getElementById('kpi-taxa').textContent=taxa;
  document.getElementById('top-divergencias').innerHTML=tDiv===0
    ?'<div class="no-data">Nenhuma divergência registrada.</div>'
    :`<div class="finding-row"><span class="finding-rank">—</span><div class="finding-bar-wrap"><div class="finding-label">Divergências acumuladas</div><div class="finding-bar-bg"><div class="finding-bar-fill" style="width:100%"></div></div></div><span class="finding-count">${tDiv}</span></div>`;
}

// ─── HELPERS ─────────────────────────────────
function countDivergencias(r){let n=0;r.lotes.forEach(l=>{if(!l.error)(l.validacoes||[]).forEach(v=>{if(v.status==='nok')n++;});});return n;}
function countConformidades(r){let n=0;r.lotes.forEach(l=>{if(!l.error)(l.validacoes||[]).forEach(v=>{if(v.status==='ok')n++;});});return n;}
function countNok(l){return(l.validacoes||[]).filter(v=>v.status==='nok').length;}
function saveHistory(){try{localStorage.setItem('aa_history',JSON.stringify(state.history.slice(0,50)));}catch(e){}}
function showLoading(msg){document.getElementById('loading-overlay').style.display='flex';document.getElementById('loading-step').textContent=msg||'';}
function setLoadingStep(s){document.getElementById('loading-step').textContent=s;}
function setProgress(p){document.getElementById('loading-bar').style.width=p+'%';}
function hideLoading(){document.getElementById('loading-overlay').style.display='none';}
let _t;function showToast(msg,type=''){const el=document.getElementById('toast');el.textContent=msg;el.className='toast'+(type?' '+type:'');el.style.display='block';clearTimeout(_t);_t=setTimeout(()=>{el.style.display='none';},3800);}
function escHtml(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtNum(n){const x=parseFloat(n);if(isNaN(x))return n!=null?String(n):'—';return x.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function formatBytes(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';}
function fmtDate(iso){try{return new Date(iso).toLocaleString('pt-BR');}catch{return iso;}}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function extractPDFText(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=async(e)=>{
      try{
        const pdf=await pdfjsLib.getDocument({data:e.target.result}).promise;
        let text='';
        for(let i=1;i<=pdf.numPages;i++){
          const page=await pdf.getPage(i);
          const content=await page.getTextContent();
          text+=content.items.map(it=>it.str).join(' ')+'\n';
        }
        resolve(text);
      }catch(err){reject(err);}
    };
    reader.readAsArrayBuffer(file);
  });
}
