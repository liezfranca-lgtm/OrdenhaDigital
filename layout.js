// ============================================================
// OrdenhaDigital — layout, utilidades e gráficos compartilhados
// ============================================================

(function aplicarTemaSalvo() {
  let t = null;
  try { t = localStorage.getItem('ordenha-tema'); } catch (e) {}
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();

const MENU = [
  ['painel', 'Painel'],
  ['rebanho', 'Rebanho'],
  ['fazendas', 'Fazendas'],
  ['producao', 'Produção de leite'],
  ['ranking', 'Ranking de produção'],
  ['reproducao', 'Reprodução'],
  ['sanidade', 'Sanidade'],
  ['bezerras', 'Bezerras e novilhas'],
  ['nutricao', 'Nutrição e estoque'],
  ['qualidade', 'Qualidade e laticínio'],
  ['financeiro', 'Financeiro'],
];

// Monta barra lateral + <main id="main"> e confere login
async function iniciarPagina(pagina) {
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="app">
      <aside class="side">
        <div class="brand"><img src="logo-gm.png" alt="GM Agronegócios"><div><b>OrdenhaDigital</b><small>Controle do rebanho leiteiro</small></div></div>
        <nav class="nav">${MENU.map(([p, t]) => `<a href="${p}.html" class="${p === pagina ? 'on' : ''}">${t}</a>`).join('')}</nav>
        <div class="foot"><span id="userEmail"></span>
          <div class="row"><button class="ghost" type="button" onclick="alternarTema()">Alternar tema</button><button class="ghost" type="button" onclick="logout()">Sair</button></div></div>
      </aside>
      <main id="main"><div class="loading">Carregando…</div></main>
    </div><div id="layer"></div>`);
  const s = await checkAuth();
  if (s) document.getElementById('userEmail').textContent = s.user.email;
  return s;
}

function alternarTema() {
  const novo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', novo);
  try { localStorage.setItem('ordenha-tema', novo); } catch (e) {}
}

// ---------- datas e formatação ----------
const DIA = 864e5;
const HOJE = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const addD = (d, n) => new Date(d.getTime() + n * DIA);
const dd = (a, b) => Math.round((a - b) / DIA);
const pd = s => { if (!s) return null; if (s instanceof Date) return s; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fd = d => d ? pd(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
const fdy = d => d ? pd(d).toLocaleDateString('pt-BR') : '—';
const nf = (x, c = 0) => Number(x || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const brl = (x, c = 2) => Number(x || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: c, maximumFractionDigits: c });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pill = (t, k = 'mute') => `<span class="pill p-${k}">${t}</span>`;
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mesTxt = d => { d = pd(d); return MESES_CURTOS[d.getMonth()] + '/' + String(d.getFullYear()).slice(2); };
function idadeTxt(n) { if (!n) return '—'; const d = dd(HOJE, pd(n)); if (d < 60) return d + ' dias'; const m = Math.floor(d / 30.44); if (m < 24) return m + ' meses'; return Math.floor(m / 12) + 'a ' + (m % 12) + 'm'; }
const kpi = (l, v, s = '', u = '') => `<div class="kpi"><span class="lbl">${l}</span><span class="val">${v}${u ? `<small>${u}</small>` : ''}</span><span class="sub">${s}</span></div>`;
// O filtro de fazenda (definido em animal.js) aparece ao lado dos botões nas telas do rebanho
const head = (t, p, btns = '') => `<div class="vhead"><div><h1>${t}</h1><p>${p}</p></div><div class="actions">${typeof seletorFazendaHtml === 'function' ? seletorFazendaHtml() : ''}${btns}</div></div>`;

// ---------- banco ----------
const sb = supabaseClient;
async function q(builder) {
  const { data, error } = await builder;
  if (error) {
    console.error(error);
    if (error.code === '23505') {
      const campo = (error.details || '').match(/\((\w+)\)=\(([^)]*)\)/);
      throw new Error(campo ? `já existe um registro com ${({ brinco: 'o brinco', mes: 'o mês', codigo: 'o código', nome: 'o nome', data: 'a data' })[campo[1]] || campo[1]} ${campo[2]}.` : 'registro duplicado.');
    }
    throw new Error(error.message);
  }
  return data;
}
// O Supabase limita cada consulta a 1000 linhas: busca em páginas
async function buscarPaginado(criarQuery) {
  const LOTE = 1000; let pagina = 0, todos = [];
  while (true) {
    const { data, error } = await criarQuery().range(pagina * LOTE, pagina * LOTE + LOTE - 1);
    if (error) throw new Error(error.message);
    todos = todos.concat(data || []);
    if (!data || data.length < LOTE) break;
    pagina++;
  }
  return todos;
}
const todos = (tabela, select = '*', ordem = 'id') => buscarPaginado(() => sb.from(tabela).select(select).order(ordem));

// ---------- avisos e modal ----------
let _tt;
function toast(m, erro) {
  clearTimeout(_tt);
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.classList.toggle('erro', !!erro); el.textContent = m;
  _tt = setTimeout(() => el.remove(), erro ? 6000 : 3200);
}
function fechar() { const l = document.getElementById('layer'); if (l) l.innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });

// salvar(dados, form) pode lançar erro (mostra no modal) ou retornar false (mantém aberto)
function abrirModal({ titulo, corpo, salvar, wide = false, textoSalvar = 'Salvar' }) {
  document.getElementById('layer').innerHTML = `<div class="ovl" onmousedown="if(event.target===this)fechar()"><form class="modal ${wide ? 'wide' : ''}" id="mform" novalidate><h2>${titulo}</h2><div class="form">${corpo}<div class="err" id="merr" hidden></div></div><div class="mfoot"><button type="button" class="btn" onclick="fechar()">Cancelar</button><button class="btn pri" type="submit" id="msave">${textoSalvar}</button></div></form></div>`;
  const form = document.getElementById('mform');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('merr'), btn = document.getElementById('msave');
    err.hidden = true;
    const falta = [...form.querySelectorAll('[required]')].find(i => !String(i.value).trim());
    if (falta) { err.textContent = 'Preencha o campo: ' + (falta.closest('label')?.firstChild?.textContent || falta.name).trim(); err.hidden = false; falta.focus(); return; }
    btn.disabled = true;
    try {
      const r = await salvar(Object.fromEntries(new FormData(form)), form);
      if (r !== false) fechar();
    } catch (ex) { err.textContent = 'Não foi possível salvar: ' + ex.message; err.hidden = false; }
    btn.disabled = false;
  });
  const first = form.querySelector('select, input:not([type=hidden]), textarea'); if (first) first.focus();
  return form;
}
// Confirmação dentro da página (confirm() nativo é bloqueado em alguns navegadores embutidos)
function confirmar(titulo, texto, acao, textoBotao = 'Confirmar') {
  abrirModal({ titulo, corpo: `<div class="full">${texto}</div>`, textoSalvar: textoBotao, salvar: acao });
}

// ---------- gráficos (SVG) ----------
function niceStep(r) { const p = Math.pow(10, Math.floor(Math.log10(r || 1))); const n = r / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; }
function lineChart(pts, { unit = 'L', label = '', media = true } = {}) {
  if (pts.length < 2) return `<div class="empty">Lance pelo menos dois dias para ver o gráfico.</div>`;
  const W = 680, H = 230, pl = 48, pr = 18, pt = 16, pb = 28, ys = pts.map(p => p.v);
  let lo = Math.min(...ys), hi = Math.max(...ys); const st = niceStep((hi - lo) / 4 || Math.max(hi / 4, 1));
  lo = Math.max(0, Math.floor(lo / st) * st - st); hi = Math.ceil(hi / st) * st; if (hi <= lo) hi = lo + st;
  const x = i => pl + i * (W - pl - pr) / (pts.length - 1), y = v => pt + (hi - v) * (H - pt - pb) / (hi - lo);
  let g = ''; for (let v = lo; v <= hi + 1e-9; v += st) g += `<line class="ch-grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-tick" x="${pl - 7}" y="${y(v) + 4}" text-anchor="end">${nf(v)}</text>`;
  const passo = Math.max(1, Math.ceil(pts.length / 8));
  let xl = ''; pts.forEach((p, i) => { if ((pts.length - 1 - i) % passo === 0) xl += `<text class="ch-tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${fd(p.d)}</text>`; });
  const path = arr => arr.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const line = path(pts), area = line + `L${x(pts.length - 1)},${y(lo)}L${x(0)},${y(lo)}Z`;
  const avg = pts.map((p, i) => { const s = pts.slice(Math.max(0, i - 6), i + 1); return { v: s.reduce((a, b) => a + b.v, 0) / s.length }; });
  const l = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">${g}<path class="ch-area" d="${area}"/>${media ? `<path class="ch-avg" d="${path(avg)}"/>` : ''}<path class="ch-line" d="${line}"/><circle class="ch-dot" cx="${x(pts.length - 1)}" cy="${y(l.v)}" r="4.5"/><text class="ch-end" x="${x(pts.length - 1) - 8}" y="${y(l.v) - 10}" text-anchor="end">${nf(l.v)} ${unit}</text>${xl}</svg>`;
}
// Curva de lactação: pontos {d: dias em lactação, l: litros} + curva esperada (Wood) ajustada aos pontos
const woodForma = d => Math.pow(Math.max(d, 1), 0.2) * Math.exp(-0.004 * d);
function curvaChart(pontos, delHoje) {
  const W = 520, H = 200, pl = 38, pr = 12, pt = 12, pb = 26, maxD = 330;
  const a = pontos.length ? pontos.reduce((s, p) => s + p.l / woodForma(p.d), 0) / pontos.length : 24 / 1.79;
  const mx = Math.max(a * 1.79 * 1.12, ...pontos.map(p => p.l), 5), hi = Math.ceil(mx / 5) * 5;
  const x = d => pl + Math.min(d, maxD) * (W - pl - pr) / maxD, y = v => pt + (hi - v) * (H - pt - pb) / hi;
  let g = ''; for (let v = 0; v <= hi; v += hi > 30 ? 10 : 5) g += `<line class="ch-grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-tick" x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let d = 0; d <= 300; d += 60) g += `<text class="ch-tick" x="${x(d)}" y="${H - 8}" text-anchor="middle">${d}</text>`;
  let proj = ''; for (let d = 1; d <= maxD; d += 5) proj += `${d === 1 ? 'M' : 'L'}${x(d).toFixed(1)},${y(a * woodForma(d)).toFixed(1)}`;
  const line = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(p.d)},${y(p.l)}`).join('');
  const dots = pontos.map(p => `<circle class="ch-dot" cx="${x(p.d)}" cy="${y(p.l)}" r="4"/>`).join('');
  const hoje = delHoje != null && delHoje <= maxD ? `<line class="ch-today" x1="${x(delHoje)}" x2="${x(delHoje)}" y1="${pt}" y2="${H - pb}"/><text class="ch-tick" x="${x(delHoje) + 4}" y="${pt + 10}">hoje</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Curva de lactação">${g}<path class="ch-proj" d="${proj}"/>${line ? `<path class="ch-line" d="${line}"/>` : ''}${dots}${hoje}</svg>`;
}
// Barras agrupadas: rows = [{m:'Set/26', a: valor1, b: valor2}]
function barsChart(rows) {
  const W = 680, H = 240, pl = 56, pr = 10, pt = 14, pb = 28, mx = Math.max(1, ...rows.flatMap(r => [r.a, r.b]));
  const st = niceStep(mx / 4), hi = Math.ceil(mx / st) * st, y = v => pt + (hi - v) * (H - pt - pb) / hi, gw = (W - pl - pr) / rows.length, bw = Math.min(26, gw * .3);
  let g = ''; for (let v = 0; v <= hi; v += st) g += `<line class="ch-grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-tick" x="${pl - 7}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? nf(v / 1000) + 'k' : nf(v)}</text>`;
  rows.forEach((r, i) => {
    const cx = pl + gw * i + gw / 2;
    g += `<rect class="ch-bar-a" x="${cx - bw - 2}" y="${y(r.a)}" width="${bw}" height="${y(0) - y(r.a)}" rx="3"/><rect class="ch-bar-b" x="${cx + 2}" y="${y(r.b)}" width="${bw}" height="${y(0) - y(r.b)}" rx="3"/><text class="ch-tick" x="${cx}" y="${H - 8}" text-anchor="middle">${r.m}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Comparativo mensal">${g}</svg>`;
}

// ---------- siglas: passar o mouse (ou tocar) mostra o significado ----------
const SIGLAS = {
  'CCS': 'Contagem de Células Somáticas: mede a saúde do úbere (mastite). Vem da análise de laboratório. Limite no leite do tanque: 500 mil células/mL.',
  'CBT': 'Contagem Bacteriana Total: mede a higiene da ordenha e o resfriamento do leite. Limite: 300 mil UFC/mL.',
  'UFC': 'Unidades Formadoras de Colônia: unidade usada para contar bactérias no leite.',
  'DEL': 'Dias em Lactação: quantos dias se passaram desde o último parto da vaca.',
  'IEP': 'Intervalo Entre Partos: tempo entre um parto e o seguinte da mesma vaca. Meta: cerca de 13 meses.',
  'IA': 'Inseminação Artificial.',
  'TE': 'Transferência de Embrião.',
  'B19': 'Vacina contra brucelose (amostra B19). Obrigatória para bezerras de 3 a 8 meses, aplicada por veterinário cadastrado.',
  'IN 76': 'Instrução Normativa 76 do Ministério da Agricultura: define os padrões de qualidade do leite cru (CCS, CBT, temperatura).',
  'CMT': 'California Mastitis Test: teste rápido feito no curral, com raquete e reagente, para achar mastite em cada quarto do úbere.',
  'CAR': 'Cadastro Ambiental Rural: registro obrigatório do imóvel rural no órgão ambiental.',
  'UF': 'Unidade da Federação (estado).',
  'PB': 'Proteína Bruta: quanto de proteína o alimento tem.',
  'NF': 'Nota Fiscal.',
  'GMD': 'Ganho Médio Diário de peso.',
};
const _reSigla = new RegExp('(?<![\\wÀ-ÿ])(' + Object.keys(SIGLAS).sort((a, b) => b.length - a.length).map(k => k.replace(' ', '\\s')).join('|') + ')(?![\\wÀ-ÿ])', 'g');
const _pulaSigla = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'ABBR', 'svg', 'SVG', 'text', 'title']);
function marcarSiglas(raiz) {
  if (!raiz || raiz.nodeType !== 1) return;
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      for (let p = n.parentNode; p && p !== raiz.parentNode; p = p.parentNode) if (_pulaSigla.has(p.nodeName) || (p.classList && p.classList.contains('sem-sigla'))) return NodeFilter.FILTER_REJECT;
      _reSigla.lastIndex = 0;
      return _reSigla.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  const nos = []; while (w.nextNode()) nos.push(w.currentNode);
  nos.forEach(n => {
    const frag = document.createDocumentFragment(), txt = n.nodeValue; let i = 0;
    txt.replace(_reSigla, (m, g, pos) => {
      if (pos > i) frag.appendChild(document.createTextNode(txt.slice(i, pos)));
      const ab = document.createElement('abbr'); ab.className = 'sig'; ab.tabIndex = 0;
      ab.dataset.tip = SIGLAS[m.replace(/\s+/, ' ')]; ab.textContent = m; frag.appendChild(ab);
      i = pos + m.length; return m;
    });
    if (i < txt.length) frag.appendChild(document.createTextNode(txt.slice(i)));
    n.parentNode.replaceChild(frag, n);
  });
}
let _tip;
function mostrarSigla(el) {
  if (!_tip) { _tip = document.createElement('div'); _tip.className = 'sig-tip'; _tip.setAttribute('role', 'tooltip'); document.body.appendChild(_tip); }
  _tip.innerHTML = `<b>${esc(el.textContent)}</b> ${esc(el.dataset.tip)}`; _tip.hidden = false;
  const r = el.getBoundingClientRect(), t = _tip.getBoundingClientRect();
  let x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8), y = r.top - t.height - 8;
  if (y < 8) y = r.bottom + 8;
  _tip.style.left = x + 'px'; _tip.style.top = y + 'px';
}
const esconderSigla = () => { if (_tip) _tip.hidden = true; };
document.addEventListener('mouseover', e => { const a = e.target.closest && e.target.closest('abbr.sig'); if (a && !a.closest(_seletorBotaoSigla)) mostrarSigla(a); });
const _seletorBotaoSigla = 'button, a.btn, .chip';
document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('abbr.sig')) esconderSigla(); });
document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('abbr.sig')) mostrarSigla(e.target); });
document.addEventListener('focusout', esconderSigla);
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('abbr.sig'); if (a) { mostrarSigla(a); } else esconderSigla(); });
addEventListener('scroll', esconderSigla, true);
// marca as siglas sempre que uma tela, ficha ou formulário é desenhado
let _pendSigla = false;
new MutationObserver(() => {
  if (_pendSigla) return; _pendSigla = true;
  requestAnimationFrame(() => { _pendSigla = false; marcarSiglas(document.getElementById('main')); marcarSiglas(document.getElementById('layer')); });
}).observe(document.documentElement, { childList: true, subtree: true });

// ---------- ajuda dos botões: parar o mouse sobre um botão mostra o que ele faz ----------
// Um botão pode trazer data-ajuda="..." quando o mesmo texto faz coisas diferentes em telas diferentes.
const AJUDA_BOTOES = {
  'Lançar leite do tanque': 'Registra quantos litros foram para o tanque no dia (a coleta do laticínio) e quanto foi descartado.',
  'Registrar evento': 'Registra inseminação, monta natural, transferência de embrião, diagnóstico de gestação, cio, parto, secagem ou aborto. O sistema recalcula sozinho o parto previsto, a secagem e o pré-parto.',
  'Registrar evento reprodutivo': 'Registra inseminação, monta natural, transferência de embrião, diagnóstico de gestação, cio, parto, secagem ou aborto. O sistema recalcula sozinho o parto previsto, a secagem e o pré-parto.',
  'Evento reprodutivo': 'Registra inseminação, monta natural, transferência de embrião, diagnóstico de gestação, cio, parto, secagem ou aborto. O sistema recalcula sozinho o parto previsto, a secagem e o pré-parto.',
  'Evento': 'Registra inseminação, monta natural, transferência de embrião, diagnóstico de gestação, cio, parto, secagem ou aborto. O sistema recalcula sozinho o parto previsto, a secagem e o pré-parto.',
  'Cadastrar animal': 'Abre o cadastro de um animal novo: identificação, genealogia e situação atual (para vaca que já está em lactação ou prenhe, informe o último parto e a última cobrição).',
  'Cadastrar primeiro animal': 'Abre o cadastro de um animal novo: identificação, genealogia e situação atual (para vaca que já está em lactação ou prenhe, informe o último parto e a última cobrição).',
  'Cadastrar cria': 'Cadastra uma bezerra ou bezerro. Crias de parto registrado em Reprodução já entram sozinhas.',
  'Exportar relação (planilha)': 'Baixa a relação dos animais desta tela (com os filtros aplicados) num arquivo que abre no Excel.',
  'Pesagem em grupo': 'Abre uma lista para digitar o peso de vários animais de uma vez (um lote ou uma categoria), mostrando o ganho por dia de cada um.',
  'Pesar': 'Registra o peso deste animal no histórico e mostra quanto ele ganhou por dia desde a última pesagem.',
  'Pesagem de leite': 'Lança a produção desta vaca no dia (manhã e tarde) e, se tiver, a CCS do laboratório.',
  'Controle leiteiro do rebanho': 'Abre uma grade com todas as vacas em lactação para digitar manhã, tarde e CCS de cada uma no dia do controle.',
  'Mover para o lote sugerido': 'Muda de lote as vacas cuja produção saiu da faixa: Lote 1 com 24 L ou mais, Lote 2 de 15 a 24 L, Lote 3 abaixo de 15 L.',
  'Tratamento': 'Registra doença, medicamento e carência. Enquanto durar a carência, o leite da vaca aparece como descarte na ordenha.',
  'Registrar tratamento': 'Registra doença, medicamento e carência. Enquanto durar a carência, o leite da vaca aparece como descarte na ordenha.',
  'Prêmio': 'Registra um prêmio deste animal em exposição ou torneio leiteiro.',
  'Editar': 'Abre os dados para corrigir ou completar.',
  'Excluir': 'Apaga este registro. O sistema pede confirmação antes.',
  'Saída do rebanho': 'Tira o animal das listas (venda, descarte, morte ou doação). O histórico fica guardado e, se informar valor, a venda entra no Financeiro.',
  'Desmamar': 'Encerra o aleitamento. Registra o peso com que a cria foi entregue e, se quiser, o peso da mãe na desmama.',
  'B19': 'Registra a vacina contra brucelose (B19), obrigatória para bezerras de 3 a 8 meses e aplicada por veterinário cadastrado.',
  'Passar p/ novilha': 'Muda a bezerra desmamada para novilha (recria). Ela vai para o lote de novilhas.',
  'Passar p/ novilho': 'Muda o bezerro desmamado para novilho (recria).',
  'Registrar aplicação': 'Marca que esta vacina ou manejo foi feito. A próxima data é recalculada e, se informar o custo, ele vai para o Financeiro.',
  'Novo manejo no calendário': 'Inclui uma vacina, exame ou manejo novo no calendário, com a frequência em dias.',
  'Abrir': 'Abre a tela relacionada a este item.',
  'Cadastrar touro': 'Cadastra um touro no botijão de sêmen: raça, central, preço e quantidade de doses.',
  'Saída': 'Desconta do estoque uma quantidade que saiu fora da dieta (perda, uso avulso).',
  'Cadastrar insumo': 'Cadastra um alimento ou produto do estoque (silagem, concentrado, núcleo mineral...) com preço e estoque inicial.',
  'Baixar consumo das dietas': 'Desconta do estoque o que o rebanho comeu no dia (ou em vários dias), pela dieta de cada lote.',
  'Editar dieta': 'Define quantos kg de cada insumo cada animal do lote come por dia. Isso calcula o custo e quanto o estoque ainda dura.',
  'Novo lote': 'Cria um lote novo (lactação, pré-parto, secas, novilhas ou bezerras).',
  'Renomear': 'Muda o nome, o tipo ou a ordem do lote.',
  'Desfazer': 'Desfaz esta movimentação e volta o estoque ao que era antes.',
  'Lançar mês do laticínio': 'Registra o resultado mensal do laticínio: volume, preço, bonificação, CCS, CBT, gordura e proteína. Pode lançar a receita do leite no Financeiro.',
  'Lançar temperatura': 'Anota a temperatura do tanque de resfriamento. Avisa se passar de 4 °C.',
  'Novo lançamento': 'Lança uma receita ou despesa no Financeiro.',
  'Lançar nota fiscal': 'Lança uma despesa ou receita com o número da nota, o fornecedor ou cliente e o arquivo da nota (PDF ou foto).',
  'Ver arquivo': 'Abre o PDF ou a foto da nota fiscal.',
  'Com nota fiscal': 'Mostra só os lançamentos que têm nota fiscal.',
  'Cadastrar fazenda': 'Cadastra uma propriedade: nome, município, áreas, inscrição estadual e CAR.',
  'Ver só esta fazenda': 'Filtra todas as telas do rebanho para mostrar só os animais desta fazenda. Para voltar, escolha "Todas as fazendas" no filtro do topo.',
  'Alternar tema': 'Troca entre o tema claro e o escuro.',
  'Sair': 'Sai do sistema neste aparelho.',
  'Todos': 'Mostra tudo, sem filtro.',
  'Bezerra': 'Mostra só as bezerras.',
  'Novilha': 'Mostra só as novilhas.',
  'Lactação': 'Mostra só as vacas em lactação.',
  'Seca': 'Mostra só as vacas secas.',
  'Machos': 'Mostra só os machos (bezerros, novilhos e touros).',
  'Produção atual': 'Ordena pela última pesagem de leite de cada vaca em lactação.',
  'Média dos últimos 90 dias': 'Ordena pela média das pesagens dos últimos 90 dias. Tira o efeito de um dia bom ou ruim.',
  'Total na lactação': 'Ordena pelos litros produzidos desde o parto, calculados pelo método do controle leiteiro oficial.',
  'Projeção em 305 dias': 'Ordena por quanto a vaca deve produzir numa lactação padrão de 305 dias, pela curva dela.'
};
const _seletorBotao = 'button, a.btn, .chip';
function ajudaDoBotao(el) {
  if (el.dataset.ajuda) return el.dataset.ajuda;
  const t = el.textContent.trim().replace(/\s+/g, ' ');
  return AJUDA_BOTOES[t] || AJUDA_BOTOES[t.replace(/\s*\d+$/, '')] || null;
}
function mostrarDica(el, texto) {
  if (!_tip) { _tip = document.createElement('div'); _tip.className = 'sig-tip'; _tip.setAttribute('role', 'tooltip'); document.body.appendChild(_tip); }
  _tip.textContent = texto; _tip.hidden = false;
  const r = el.getBoundingClientRect(), t = _tip.getBoundingClientRect();
  let x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8), y = r.bottom + 8;
  if (y + t.height > innerHeight - 8) y = r.top - t.height - 8;
  _tip.style.left = x + 'px'; _tip.style.top = y + 'px';
}
let _tBotao = null;
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse' || !e.target.closest) return;
  const b = e.target.closest(_seletorBotao); if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
  const txt = ajudaDoBotao(b); if (!txt) return;
  clearTimeout(_tBotao); _tBotao = setTimeout(() => { if (b.isConnected && b.matches(':hover')) mostrarDica(b, txt); }, 500);
});
document.addEventListener('pointerout', e => {
  const b = e.target.closest && e.target.closest(_seletorBotao);
  if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) { clearTimeout(_tBotao); esconderSigla(); }
});
document.addEventListener('pointerdown', () => { clearTimeout(_tBotao); esconderSigla(); }, true);
