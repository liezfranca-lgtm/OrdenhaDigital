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
        <div class="sel-faz" id="selFazenda" hidden></div>
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
const head = (t, p, btns = '') => `<div class="vhead"><div><h1>${t}</h1><p>${p}</p></div><div class="actions">${btns}</div></div>`;

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
function lineChart(pts, { unit = 'L', label = '' } = {}) {
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
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">${g}<path class="ch-area" d="${area}"/><path class="ch-avg" d="${path(avg)}"/><path class="ch-line" d="${line}"/><circle class="ch-dot" cx="${x(pts.length - 1)}" cy="${y(l.v)}" r="4.5"/><text class="ch-end" x="${x(pts.length - 1) - 8}" y="${y(l.v) - 10}" text-anchor="end">${nf(l.v)} ${unit}</text>${xl}</svg>`;
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
