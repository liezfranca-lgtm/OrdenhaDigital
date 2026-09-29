// ============================================================
// OrdenhaDigital — dados do rebanho, regras reprodutivas, ficha e formulários do animal
// Cada página define window.aoSalvar = () => { ...recarrega a tela... }
// ============================================================

const RACAS = ['Girolando 1/2', 'Girolando 3/4', 'Girolando 5/8', 'Holandesa', 'Jersey', 'Gir Leiteiro', 'Pardo Suíço', 'Mestiça'];
const CATEGORIAS = ['Bezerra', 'Novilha', 'Lactação', 'Seca'];
const DIAS_GESTACAO = 283, DIAS_SECAGEM = 60, DIAS_PRE_PARTO = 21, ESPERA_VOLUNTARIA = 45;

let BASE = null;
// Carrega o que quase toda tela usa: animais ativos, lotes, touros, tratamentos e última pesagem de cada vaca
async function carregarBase() {
  const desde = iso(addD(HOJE, -420));
  const [animais, lotes, touros, tratamentos, pesagens] = await Promise.all([
    buscarPaginado(() => sb.from('animais').select('*').eq('ativo', true).order('brinco')),
    q(sb.from('lotes').select('*').order('ordem')),
    q(sb.from('touros').select('*').order('codigo')),
    buscarPaginado(() => sb.from('tratamentos').select('*').gte('data_liberacao', iso(addD(HOJE, -120))).order('data_inicio')),
    buscarPaginado(() => sb.from('pesagens_leite').select('animal_id,data,manha,tarde,total,ccs').gte('data', desde).order('data')),
  ]);
  const ultPes = new Map(), ultCcs = new Map();
  pesagens.forEach(p => { ultPes.set(p.animal_id, p); if (p.ccs != null) ultCcs.set(p.animal_id, p); });
  BASE = { animais, lotes, touros, tratamentos, pesagens, ultPes, ultCcs,
    porId: new Map(animais.map(a => [a.id, a])), lotePorId: new Map(lotes.map(l => [l.id, l])) };
  return BASE;
}

// ---------- regras ----------
const prevParto = a => a.situacao_reprodutiva === 'Prenhe' && a.data_ultima_ia ? addD(pd(a.data_ultima_ia), DIAS_GESTACAO) : null;
const delDe = a => a.categoria === 'Lactação' && a.data_ultimo_parto ? dd(HOJE, pd(a.data_ultimo_parto)) : null;
const diasIA = a => a.data_ultima_ia ? dd(HOJE, pd(a.data_ultima_ia)) : null;
function prodAtual(a) {
  if (a.categoria !== 'Lactação') return null;
  const p = BASE.ultPes.get(a.id);
  if (!p || (a.data_ultimo_parto && p.data < a.data_ultimo_parto)) return null;
  return Number(p.total);
}
const ccsAtual = a => { const p = BASE.ultCcs.get(a.id); return p && (!a.data_ultimo_parto || p.data >= a.data_ultimo_parto) ? p.ccs : null; };
const emCarencia = a => BASE.tratamentos.some(t => t.animal_id === a.id && t.carencia_leite > 0 && pd(t.data_liberacao) > HOJE);
const loteNome = a => a.lote_id && BASE.lotePorId.get(a.lote_id) ? BASE.lotePorId.get(a.lote_id).nome : '—';
const lotesTipo = tipo => BASE.lotes.filter(l => l.tipo === tipo && l.ativo);
const lact = () => BASE.animais.filter(a => a.categoria === 'Lactação');
function loteSugerido(a) {
  if (a.categoria === 'Lactação') {
    const L = lotesTipo('lactacao'), p = prodAtual(a), del = delDe(a);
    if (!L.length) return null;
    if (p == null) return del != null && del < 30 ? L[0] : null;
    const i = p >= 24 || (del != null && del < 30) ? 0 : p >= 15 ? 1 : 2;
    return L[Math.min(i, L.length - 1)];
  }
  if (a.categoria === 'Seca') { const pp = prevParto(a); return (pp && dd(pp, HOJE) <= DIAS_PRE_PARTO ? lotesTipo('pre_parto')[0] : null) || lotesTipo('secas')[0]; }
  if (a.categoria === 'Novilha') return lotesTipo('novilhas')[0];
  return lotesTipo('bezerras')[0];
}
function situacao(a) {
  const del = delDe(a), p = prevParto(a);
  if (a.categoria === 'Bezerra') return a.data_desmama ? pill('Desmamada', 'mute') : pill('Aleitamento', 'info');
  if (a.categoria === 'Seca') return p ? pill('Seca · parto ' + fd(p), 'acc') : pill('Seca · vazia', 'bad');
  switch (a.situacao_reprodutiva) {
    case 'Prenhe': return pill('Prenhe · parto ' + fd(p), 'ok');
    case 'Inseminada': return pill('Inseminada há ' + diasIA(a) + ' d', 'info');
    case 'Pós-parto': return del != null && del >= ESPERA_VOLUNTARIA ? pill('Liberada p/ IA', 'warn') : pill('Pós-parto', 'mute');
    case 'Vazia': return del != null && del > 150 ? pill('Vazia · DEL alto', 'bad') : pill(a.categoria === 'Novilha' ? 'Vazia' : 'Vazia · liberada p/ IA', 'warn');
    case 'Apta p/ IA': return pill('Apta p/ IA', 'warn');
    default: return pill(a.situacao_reprodutiva || '—', 'mute');
  }
}
const animLink = a => `<span class="brinco">${esc(a.brinco)}</span> ${esc(a.nome || '')}`;
const optAnimais = (filtro, sel) => BASE.animais.filter(filtro).map(a => `<option value="${a.id}" ${a.id == sel ? 'selected' : ''}>${esc(a.brinco)}${a.nome ? ' · ' + esc(a.nome) : ''} (${a.categoria})</option>`).join('');
const optLotes = sel => `<option value="">— sem lote —</option>` + BASE.lotes.filter(l => l.ativo).map(l => `<option value="${l.id}" ${l.id == sel ? 'selected' : ''}>${esc(l.nome)}</option>`).join('');

// ---------- pendências do dia ----------
function calcAlertas(extra = {}) {
  const A = BASE.animais, ad = A.filter(a => a.categoria !== 'Bezerra');
  const partos = ad.filter(a => { const p = prevParto(a); return p && dd(p, HOJE) <= 30; }).sort((a, b) => prevParto(a) - prevParto(b));
  const secar = lact().filter(a => { const p = prevParto(a); return p && dd(p, HOJE) <= DIAS_SECAGEM; });
  const diag = ad.filter(a => a.situacao_reprodutiva === 'Inseminada' && diasIA(a) >= 28);
  const cio = ad.filter(a => a.situacao_reprodutiva === 'Inseminada' && diasIA(a) >= 18 && diasIA(a) <= 24);
  const liberadas = ad.filter(a => (a.categoria === 'Lactação' && ((a.situacao_reprodutiva === 'Vazia' && delDe(a) <= 150) || (a.situacao_reprodutiva === 'Pós-parto' && delDe(a) >= ESPERA_VOLUNTARIA))) || (a.categoria === 'Novilha' && ['Apta p/ IA', 'Vazia'].includes(a.situacao_reprodutiva)));
  const problema = lact().filter(a => a.situacao_reprodutiva === 'Vazia' && delDe(a) > 150);
  const ccs = lact().filter(a => ccsAtual(a) > 500);
  const car = lact().filter(emCarencia);
  const bz = A.filter(a => a.categoria === 'Bezerra');
  const desm = bz.filter(b => !b.data_desmama && b.data_nascimento && dd(HOJE, pd(b.data_nascimento)) >= 60);
  const b19 = bz.filter(b => !b.data_b19 && b.data_nascimento && dd(HOJE, pd(b.data_nascimento)) >= 90);
  const vac = (extra.manejos || []).filter(m => ['bad', 'warn'].includes(m.status[1]));
  const est = (extra.insumosCriticos || []);
  const nomes = arr => arr.map(a => a.nome || a.brinco).join(', ');
  return { partos, secar, diag, cio, liberadas, problema, ccs, car, desm, b19, vac, est,
    lista: [
      [car.length, 'Leite em carência — descartar', nomes(car), 'bad', 'sanidade.html'],
      [vac.filter(v => v.status[1] === 'bad').length, 'Vacina ou manejo atrasado', vac.filter(v => v.status[1] === 'bad').map(v => v.nome).join(', '), 'bad', 'sanidade.html'],
      [partos.length, 'Partos previstos em 30 dias', partos.map(a => (a.nome || a.brinco) + ' ' + fd(prevParto(a))).join(', '), 'warn', 'reproducao.html'],
      [secar.length, 'Vacas para secar (parto em até 60 dias)', nomes(secar), 'warn', 'reproducao.html'],
      [diag.length, 'Diagnóstico de gestação a fazer', nomes(diag), 'info', 'reproducao.html'],
      [cio.length, 'Observar retorno de cio', nomes(cio), 'info', 'reproducao.html'],
      [liberadas.length, 'Liberadas para inseminar', nomes(liberadas), 'info', 'reproducao.html'],
      [ccs.length, 'CCS individual acima de 500 mil', nomes(ccs), 'warn', 'sanidade.html'],
      [vac.filter(v => v.status[1] === 'warn').length, 'Vacina ou manejo vencendo', vac.filter(v => v.status[1] === 'warn').map(v => v.nome).join(', '), 'warn', 'sanidade.html'],
      [desm.length + b19.length, 'Bezerras: desmama ou vacina B19', [...desm.map(b => b.brinco + ' desmamar'), ...b19.map(b => b.brinco + ' B19')].join(', '), 'info', 'bezerras.html'],
      [est.length, 'Insumo com menos de 15 dias de estoque', est.map(i => i.nome).join(', '), 'warn', 'nutricao.html'],
      [problema.length, 'Vazias com mais de 150 dias em lactação', nomes(problema), 'warn', 'reproducao.html'],
    ].filter(x => x[0] > 0) };
}

// ---------- ficha do animal ----------
async function ficha(id) {
  const a = BASE.porId.get(id); if (!a) return;
  document.getElementById('layer').innerHTML = `<div class="ovl" onclick="fechar()"></div><aside class="drawer"><div class="loading">Carregando ficha…</div></aside>`;
  const [ev, pes, tr] = await Promise.all([
    q(sb.from('eventos').select('*').eq('animal_id', id).order('data', { ascending: false }).order('id', { ascending: false })),
    q(sb.from('pesagens_leite').select('*').eq('animal_id', id).order('data')),
    q(sb.from('tratamentos').select('*').eq('animal_id', id).order('data_inicio', { ascending: false })),
  ]);
  const p = prevParto(a), del = delDe(a), mae = a.mae_id ? BASE.porId.get(a.mae_id) : null, prod = prodAtual(a);
  const dl = [['Raça', a.raca || '—'], ['Categoria', a.categoria], ['Lote', loteNome(a)], ['Nascimento', fdy(a.data_nascimento)], ['Idade', idadeTxt(a.data_nascimento)], ['Lactações', a.numero_lactacao || '—']];
  if (a.categoria === 'Lactação' || a.categoria === 'Seca') dl.push(['Último parto', fdy(a.data_ultimo_parto)], ['DEL', del ?? '—'], ['Produção', prod != null ? nf(prod, 1) + ' L/dia' : a.categoria === 'Seca' ? 'seca' : 'sem pesagem']);
  if (a.data_ultima_ia) dl.push(['Última IA', fdy(a.data_ultima_ia)], ['Touro', a.touro_ultima_ia || '—'], ['Doses no ciclo', a.ias_no_ciclo]);
  if (p) dl.push(['Parto previsto', fdy(p)], ['Secar até', fdy(addD(p, -DIAS_SECAGEM))], ['Pré-parto', fdy(addD(p, -DIAS_PRE_PARTO))]);
  if (a.peso) dl.push(['Peso', nf(a.peso) + ' kg']);
  if (ccsAtual(a) != null) dl.push(['CCS', nf(ccsAtual(a)) + ' mil']);
  if (mae) dl.push(['Mãe', mae.brinco + (mae.nome ? ' ' + mae.nome : '')]);
  if (a.pai) dl.push(['Pai', a.pai]);
  const pontos = a.data_ultimo_parto ? pes.filter(x => x.data >= a.data_ultimo_parto).map(x => ({ d: dd(pd(x.data), pd(a.data_ultimo_parto)), l: Number(x.total) })) : [];
  document.getElementById('layer').innerHTML = `<div class="ovl" onclick="fechar()"></div><aside class="drawer" role="dialog" aria-label="Ficha do animal"><button class="btn sm close" onclick="fechar()">Fechar</button>
  <span class="brinco" style="font-size:.95rem">${esc(a.brinco)}</span><h1 style="margin-top:6px">${esc(a.nome || 'Sem nome')}</h1>
  <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${situacao(a)}${emCarencia(a) ? pill('leite em carência', 'bad') : ''}</div>
  <dl class="dl">${dl.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  ${a.observacao ? `<p class="muted" style="margin-top:-6px">${esc(a.observacao)}</p>` : ''}
  <div class="actions">${a.categoria !== 'Bezerra' ? `<button class="btn sm" onclick="formEvento(${id})">Evento reprodutivo</button>` : ''}${a.categoria === 'Lactação' ? `<button class="btn sm" onclick="formPesagem(${id})">Pesagem de leite</button>` : ''}<button class="btn sm" onclick="formTratamento(${id})">Tratamento</button><button class="btn sm" onclick="formAnimal(${id})">Editar</button><button class="btn sm danger" onclick="formSaida(${id})">Saída do rebanho</button></div>
  ${a.categoria === 'Lactação' || pontos.length ? `<div class="sec-t">Curva de lactação atual</div><div class="legend" style="margin-bottom:4px"><span><i style="background:var(--accent)"></i>pesagens (L/dia)</span><span><i style="background:var(--muted)"></i>curva esperada</span><span>eixo: dias em lactação</span></div>${curvaChart(pontos, del)}` : ''}
  ${tr.length ? `<div class="sec-t">Tratamentos</div><table class="tbl"><tbody>${tr.map(t => `<tr><td class="mono">${fd(t.data_inicio)}</td><td>${esc(t.doenca)}<br><small class="muted">${esc(t.medicamento)}</small></td><td>${pd(t.data_liberacao) > HOJE && t.carencia_leite > 0 ? pill('libera ' + fd(t.data_liberacao), 'bad') : pill('concluído', 'mute')}</td></tr>`).join('')}</tbody></table>` : ''}
  <div class="sec-t">Histórico</div>${ev.length ? `<ul class="tl">${ev.map(e => `<li><small>${fdy(e.data)}</small><br><b>${esc(e.tipo)}</b> <span class="muted">${esc(e.detalhe || '')}</span></li>`).join('')}</ul>` : '<div class="empty">Nenhum evento registrado ainda.</div>'}</aside>`;
}

async function registrarEvento(animal_id, data, tipo, detalhe, touro_id = null) {
  await q(sb.from('eventos').insert({ animal_id, data, tipo, detalhe, touro_id }));
}
async function depoisDeSalvar(msg) { toast(msg); if (window.aoSalvar) await window.aoSalvar(); }

// ---------- cadastro / edição ----------
function formAnimal(id, catPadrao) {
  const a = id ? BASE.porId.get(id) : null, v = (k, d = '') => a && a[k] != null ? esc(a[k]) : d;
  const cat = a ? a.categoria : (catPadrao || 'Lactação');
  abrirModal({
    titulo: a ? 'Editar ' + esc(a.brinco) : 'Cadastrar animal', wide: true,
    corpo: `<label>Brinco<input name="brinco" id="fa-brinco" required value="${v('brinco')}"></label><label>Nome<input name="nome" id="fa-nome" value="${v('nome')}"></label>
    <label>Raça<input name="raca" id="fa-raca" list="dl-racas" value="${v('raca')}"><datalist id="dl-racas">${RACAS.map(r => `<option>${r}</option>`).join('')}</datalist></label>
    <label>Categoria<select name="categoria" id="fa-cat" onchange="mostrarCamposCategoria(${a ? 'false' : 'true'})">${CATEGORIAS.map(c => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Nascimento<input name="data_nascimento" id="fa-nasc" type="date" value="${v('data_nascimento')}"></label><label>Lote<select name="lote_id" id="fa-lote">${optLotes(a ? a.lote_id : '')}</select></label>
    <label>Mãe<select name="mae_id" id="fa-mae"><option value="">— não informada —</option>${optAnimais(x => x.id !== id && x.categoria !== 'Bezerra', a ? a.mae_id : '')}</select></label><label>Pai (touro)<input name="pai" id="fa-pai" value="${v('pai')}"></label>
    <label>Peso (kg)<input name="peso" id="fa-peso" type="number" step="0.1" min="0" value="${v('peso')}"></label><label>Observação<input name="observacao" id="fa-obs" value="${v('observacao')}"></label>
    <div class="sec-t full" data-cat="Lactação Seca Novilha">Situação atual</div>
    <label data-cat="Lactação Seca">Nº de lactações<input name="numero_lactacao" id="fa-nlac" type="number" min="0" value="${v('numero_lactacao', cat === 'Lactação' ? '1' : '0')}"></label>
    <label data-cat="Lactação Seca">Data do último parto<input name="data_ultimo_parto" id="fa-parto" type="date" value="${v('data_ultimo_parto')}"></label>
    <label data-cat="Lactação Seca Novilha">Situação reprodutiva<select name="situacao_reprodutiva" id="fa-sit">${['Em recria', 'Apta p/ IA', 'Pós-parto', 'Vazia', 'Inseminada', 'Prenhe'].map(s => `<option ${a && a.situacao_reprodutiva === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label data-cat="Lactação Seca Novilha">Data da última IA<input name="data_ultima_ia" id="fa-ia" type="date" value="${v('data_ultima_ia')}"></label>
    <label data-cat="Lactação Seca Novilha">Touro da última IA<input name="touro_ultima_ia" id="fa-touro" list="dl-touros" value="${v('touro_ultima_ia')}"><datalist id="dl-touros">${BASE.touros.map(t => `<option>${esc(t.codigo)}</option>`).join('')}</datalist></label>
    <label data-cat="Seca">Data da secagem<input name="data_secagem" id="fa-sec" type="date" value="${v('data_secagem')}"></label>
    <div class="hint" data-cat="Lactação Seca Novilha">Para quem está entrando no sistema agora: informe a situação de hoje. Com a data da IA de uma vaca prenhe, o sistema calcula parto, secagem e pré-parto sozinho.</div>`,
    salvar: async f => {
      const reg = {
        brinco: f.brinco.trim(), nome: f.nome.trim() || null, raca: f.raca.trim() || null, categoria: f.categoria,
        data_nascimento: f.data_nascimento || null, lote_id: f.lote_id ? +f.lote_id : null, mae_id: f.mae_id ? +f.mae_id : null,
        pai: f.pai.trim() || null, peso: f.peso ? +f.peso : null, observacao: f.observacao.trim() || null,
      };
      if (f.categoria === 'Lactação' || f.categoria === 'Seca') { reg.numero_lactacao = +f.numero_lactacao || 0; reg.data_ultimo_parto = f.data_ultimo_parto || null; }
      if (f.categoria === 'Bezerra') { reg.situacao_reprodutiva = 'Em recria'; }
      else {
        reg.situacao_reprodutiva = f.situacao_reprodutiva; reg.data_ultima_ia = f.data_ultima_ia || null; reg.touro_ultima_ia = f.touro_ultima_ia.trim() || null;
        if (['Inseminada', 'Prenhe'].includes(reg.situacao_reprodutiva) && !reg.data_ultima_ia) throw new Error('informe a data da última IA para vaca inseminada ou prenhe.');
        if (reg.data_ultima_ia && (!a || a.ias_no_ciclo === 0)) reg.ias_no_ciclo = 1;
      }
      reg.data_secagem = f.categoria === 'Seca' ? (f.data_secagem || null) : null;
      if (f.categoria === 'Lactação' && !reg.data_ultimo_parto) throw new Error('informe a data do último parto da vaca em lactação.');
      if (a) {
        await q(sb.from('animais').update(reg).eq('id', id));
      } else {
        if (!reg.lote_id) { const L = lotesTipo('lactacao'); const l = loteSugerido({ ...reg, id: 0 }) || (reg.categoria === 'Lactação' ? L[1] || L[0] : null); if (l) reg.lote_id = l.id; }
        if (f.categoria === 'Bezerra') reg.leite_aleitamento = 6;
        const novo = await q(sb.from('animais').insert(reg).select().single());
        await registrarEvento(novo.id, iso(HOJE), 'Cadastro', 'Entrada no sistema' + (reg.raca ? ' · ' + reg.raca : ''));
      }
      await depoisDeSalvar(a ? 'Dados atualizados' : `${reg.nome || reg.brinco} cadastrada no rebanho`);
    }
  });
  mostrarCamposCategoria(!a);
}
function mostrarCamposCategoria(novo) {
  const c = document.getElementById('fa-cat').value;
  if (novo) document.getElementById('fa-sit').value = { 'Lactação': 'Vazia', 'Seca': 'Prenhe', 'Novilha': 'Em recria' }[c] || 'Em recria';
  document.querySelectorAll('#mform [data-cat]').forEach(el => el.hidden = !el.dataset.cat.split(' ').includes(c));
}

// ---------- evento reprodutivo ----------
const TIPOS_EVENTO = ['Inseminação', 'Diagnóstico positivo', 'Diagnóstico negativo', 'Cio observado', 'Parto', 'Secagem', 'Aborto'];
function formEvento(id) {
  abrirModal({
    titulo: 'Registrar evento reprodutivo',
    corpo: `<label class="full">Animal<select name="animal" id="fe-animal" required><option value="">Escolha…</option>${optAnimais(a => a.categoria !== 'Bezerra', id)}</select></label>
    <label>Evento<select name="tipo" id="fe-tipo" onchange="camposEvento()">${TIPOS_EVENTO.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label>Data<input name="data" id="fe-data" type="date" value="${iso(HOJE)}" required></label>
    <label class="full" data-ev="Inseminação">Touro / sêmen<select name="touro" id="fe-touro"><option value="">— informar sem baixa no botijão —</option>${BASE.touros.filter(t => t.ativo).map(t => `<option value="${t.id}" ${t.doses > 0 ? '' : 'disabled'}>${esc(t.codigo)} · ${t.doses} doses</option>`).join('')}</select></label>
    <label class="full" data-ev="Inseminação">Ou touro de monta / outro sêmen<input name="touro_txt" id="fe-touro-txt" placeholder="opcional"></label>
    <label data-ev="Parto">Cria<select name="cria" id="fe-cria" onchange="camposEvento()"><option>Fêmea</option><option>Macho</option><option>Natimorto</option><option>Gêmeos</option></select></label>
    <label data-ev="Parto" data-cria="Fêmea Gêmeos">Brinco da bezerra<input name="brinco_cria" id="fe-brinco-cria"></label>
    <label data-ev="Parto" data-cria="Fêmea Gêmeos">Nome da bezerra<input name="nome_cria" id="fe-nome-cria" placeholder="opcional"></label>
    <label data-ev="Parto" data-cria="Fêmea Gêmeos" class="chk"><input type="checkbox" name="colostro" id="fe-colostro" checked> Recebeu colostro nas primeiras 6 horas</label>
    <label class="full">Observação<input name="obs" id="fe-obs"></label>
    <div class="hint">Inseminação dá baixa no botijão e agenda o diagnóstico para 30 dias. Diagnóstico positivo calcula parto (+283 dias), secagem (−60) e pré-parto (−21). Parto de fêmea já cadastra a bezerra.</div>`,
    salvar: async f => {
      const a = BASE.porId.get(+f.animal); if (!a) throw new Error('escolha o animal.');
      const d = f.data, up = {}; let det = f.obs.trim(), touroId = null;
      if (f.tipo === 'Inseminação') {
        const t = f.touro ? BASE.touros.find(x => x.id == f.touro) : null;
        const nomeTouro = t ? t.codigo : f.touro_txt.trim();
        if (!nomeTouro) throw new Error('informe o touro ou sêmen usado.');
        Object.assign(up, { data_ultima_ia: d, touro_ultima_ia: nomeTouro, situacao_reprodutiva: 'Inseminada', ias_no_ciclo: (['Vazia', 'Inseminada'].includes(a.situacao_reprodutiva) ? a.ias_no_ciclo : 0) + 1 });
        if (t) { touroId = t.id; await q(sb.from('touros').update({ doses: Math.max(0, t.doses - 1) }).eq('id', t.id)); }
        det = [nomeTouro, det].filter(Boolean).join(' · ');
      } else if (f.tipo === 'Diagnóstico positivo') {
        if (!a.data_ultima_ia) throw new Error('registre a inseminação antes do diagnóstico.');
        up.situacao_reprodutiva = 'Prenhe'; det = ['Parto previsto ' + fdy(addD(pd(a.data_ultima_ia), DIAS_GESTACAO)), det].filter(Boolean).join(' · ');
      } else if (f.tipo === 'Diagnóstico negativo' || f.tipo === 'Aborto') {
        up.situacao_reprodutiva = 'Vazia';
      } else if (f.tipo === 'Parto') {
        const lote = lotesTipo('lactacao')[0];
        Object.assign(up, { categoria: 'Lactação', numero_lactacao: (a.numero_lactacao || 0) + 1, data_ultimo_parto: d, situacao_reprodutiva: 'Pós-parto', data_ultima_ia: null, touro_ultima_ia: null, ias_no_ciclo: 0, data_secagem: null, lote_id: lote ? lote.id : a.lote_id });
        det = [`${up.numero_lactacao}ª lactação · cria ${f.cria.toLowerCase()}`, det].filter(Boolean).join(' · ');
        if (['Fêmea', 'Gêmeos'].includes(f.cria)) {
          if (!f.brinco_cria.trim()) throw new Error('informe o brinco da bezerra.');
          const lb = lotesTipo('bezerras')[0];
          const b = await q(sb.from('animais').insert({ brinco: f.brinco_cria.trim(), nome: f.nome_cria.trim() || null, raca: a.raca, categoria: 'Bezerra', data_nascimento: d, mae_id: a.id, pai: a.touro_ultima_ia, lote_id: lb ? lb.id : null, situacao_reprodutiva: 'Em recria', colostro_ok: !!f.colostro, leite_aleitamento: 6 }).select().single());
          await registrarEvento(b.id, d, 'Nascimento', `Filha de ${a.brinco}` + (f.colostro ? ' · colostro ok' : ' · sem registro de colostro'));
          det += ' · bezerra ' + b.brinco;
        }
      } else if (f.tipo === 'Secagem') {
        if (a.categoria !== 'Lactação') throw new Error('só vacas em lactação podem ser secas.');
        const pp = prevParto(a), l = (pp && dd(pp, pd(d)) <= DIAS_PRE_PARTO ? lotesTipo('pre_parto')[0] : null) || lotesTipo('secas')[0];
        Object.assign(up, { categoria: 'Seca', data_secagem: d, lote_id: l ? l.id : a.lote_id });
      }
      if (Object.keys(up).length) await q(sb.from('animais').update(up).eq('id', a.id));
      await registrarEvento(a.id, d, f.tipo, det, touroId);
      await depoisDeSalvar(`${f.tipo} registrado para ${a.nome || a.brinco}`);
    }
  });
  camposEvento();
}
function camposEvento() {
  const t = document.getElementById('fe-tipo').value, c = document.getElementById('fe-cria').value;
  document.querySelectorAll('#mform [data-ev]').forEach(el => el.hidden = el.dataset.ev !== t || (el.dataset.cria && !el.dataset.cria.split(' ').includes(c)));
}

// ---------- pesagem individual ----------
function formPesagem(id) {
  abrirModal({
    titulo: 'Lançar pesagem de leite',
    corpo: `<label class="full">Vaca<select name="animal" id="fp-animal" required><option value="">Escolha…</option>${optAnimais(a => a.categoria === 'Lactação', id)}</select></label>
    <label>Ordenha da manhã (L)<input name="manha" id="fp-manha" type="number" step="0.1" min="0" required></label><label>Ordenha da tarde (L)<input name="tarde" id="fp-tarde" type="number" step="0.1" min="0" value="0"></label>
    <label>Data<input name="data" id="fp-data" type="date" value="${iso(HOJE)}" required></label><label>CCS (mil cél/mL)<input name="ccs" id="fp-ccs" type="number" min="0" placeholder="opcional"></label>
    <div class="hint">Se já existir pesagem dessa vaca nessa data, ela é substituída.</div>`,
    salvar: async f => {
      await q(sb.from('pesagens_leite').upsert({ animal_id: +f.animal, data: f.data, manha: +f.manha, tarde: +f.tarde || 0, ccs: f.ccs ? +f.ccs : null }, { onConflict: 'animal_id,data' }));
      const a = BASE.porId.get(+f.animal);
      await depoisDeSalvar(`Pesagem salva: ${a.nome || a.brinco} com ${nf(+f.manha + (+f.tarde || 0), 1)} L`);
    }
  });
}

// ---------- tratamento ----------
function formTratamento(id) {
  abrirModal({
    titulo: 'Registrar tratamento',
    corpo: `<label class="full">Animal<select name="animal" id="ft-animal" required><option value="">Escolha…</option>${optAnimais(() => true, id)}</select></label>
    <label class="full">Doença / motivo<input name="doenca" id="ft-doenca" required list="dl-doencas" placeholder="Ex.: Mastite clínica (quarto AE)"><datalist id="dl-doencas">${['Mastite clínica', 'Mastite subclínica', 'Metrite', 'Retenção de placenta', 'Pneumonia', 'Diarreia', 'Tristeza parasitária', 'Dermatite digital', 'Hipocalcemia (febre do leite)', 'Cetose'].map(x => `<option>${x}</option>`).join('')}</datalist></label>
    <label class="full">Medicamento<input name="medicamento" id="ft-med" required></label>
    <label>Início<input name="data_inicio" id="ft-inicio" type="date" value="${iso(HOJE)}" required></label><label>Dias de aplicação<input name="dias" id="ft-dias" type="number" min="1" value="3" required></label>
    <label>Carência do leite (dias)<input name="car_leite" id="ft-car" type="number" min="0" value="0" required></label><label>Carência da carne (dias)<input name="car_carne" id="ft-carne" type="number" min="0" value="0"></label>
    <label class="full">Observação<input name="obs" id="ft-obs"></label>
    <div class="hint">A carência começa a contar no fim das aplicações. Até a liberação, o leite da vaca é marcado como descarte na ordenha.</div>`,
    salvar: async f => {
      const reg = { animal_id: +f.animal, doenca: f.doenca.trim(), medicamento: f.medicamento.trim(), data_inicio: f.data_inicio, dias_aplicacao: +f.dias, carencia_leite: +f.car_leite || 0, carencia_carne: +f.car_carne || 0, observacao: f.obs.trim() || null };
      await q(sb.from('tratamentos').insert(reg));
      await registrarEvento(reg.animal_id, reg.data_inicio, 'Tratamento', reg.doenca + ' · ' + reg.medicamento);
      await depoisDeSalvar('Tratamento registrado. Leite liberado em ' + fdy(addD(pd(reg.data_inicio), reg.dias_aplicacao + reg.carencia_leite)));
    }
  });
}

// ---------- saída do rebanho ----------
function formSaida(id) {
  const a = BASE.porId.get(id);
  abrirModal({
    titulo: 'Saída do rebanho · ' + esc(a.brinco),
    corpo: `<label>Motivo<select name="motivo" id="fs-motivo"><option>Venda</option><option>Descarte (venda para abate)</option><option>Morte</option><option>Doação</option></select></label>
    <label>Data<input name="data" id="fs-data" type="date" value="${iso(HOJE)}" required></label>
    <label>Valor recebido (R$)<input name="valor" id="fs-valor" type="number" step="0.01" min="0" placeholder="se houve venda"></label><label>Observação<input name="obs" id="fs-obs"></label>
    <div class="hint">O animal sai das listas, mas o histórico fica guardado. Se informar valor, a receita entra no Financeiro como venda de animais.</div>`,
    textoSalvar: 'Confirmar saída',
    salvar: async f => {
      await q(sb.from('animais').update({ ativo: false, data_saida: f.data, motivo_saida: f.motivo }).eq('id', id));
      await registrarEvento(id, f.data, 'Saída', [f.motivo, f.obs.trim()].filter(Boolean).join(' · '));
      if (+f.valor > 0) await q(sb.from('lancamentos').insert({ data: f.data, tipo: 'receita', categoria: 'Venda de animais', descricao: `${f.motivo} · ${a.brinco}${a.nome ? ' ' + a.nome : ''}`, valor: +f.valor }));
      await depoisDeSalvar(`${a.nome || a.brinco} saiu do rebanho`);
    }
  });
}

// ---------- calendário sanitário ----------
async function carregarManejos() {
  const [man, apl] = await Promise.all([
    q(sb.from('manejos_sanitarios').select('*').eq('ativo', true).order('id')),
    buscarPaginado(() => sb.from('aplicacoes_sanitarias').select('*').order('data')),
  ]);
  return man.map(m => {
    const ap = apl.filter(x => x.manejo_id === m.id), ult = ap.length ? ap[ap.length - 1].data : null;
    const prox = ult ? addD(pd(ult), m.frequencia_dias) : null;
    let status;
    if (!ult) status = ['Sem registro', 'info'];
    else { const d = dd(prox, HOJE); status = d < 0 ? ['Atrasada ' + (-d) + ' d', 'bad'] : d === 0 ? ['Vence hoje', 'warn'] : d <= 15 ? ['Vence em ' + d + ' d', 'warn'] : ['Em dia', 'ok']; }
    return { ...m, ult, prox, status, aplicacoes: ap };
  });
}

// ---------- nutrição: custo das dietas e dias de estoque ----------
async function carregarNutricao() {
  const [insumos, dietas] = await Promise.all([
    q(sb.from('insumos').select('*').eq('ativo', true).order('nome')),
    q(sb.from('dietas').select('*')),
  ]);
  const cab = {}; BASE.animais.forEach(a => { if (a.lote_id) cab[a.lote_id] = (cab[a.lote_id] || 0) + 1; });
  const insPorId = new Map(insumos.map(i => [i.id, i]));
  const custoLote = id => dietas.filter(d => d.lote_id === id).reduce((s, d) => { const i = insPorId.get(d.insumo_id); return s + (i ? Number(d.kg_cab_dia) * Number(i.preco) : 0); }, 0);
  insumos.forEach(i => {
    i.consumo = dietas.filter(d => d.insumo_id === i.id).reduce((s, d) => s + Number(d.kg_cab_dia) * (cab[d.lote_id] || 0), 0);
    i.dias = i.consumo > 0 ? Number(i.estoque) / i.consumo : null;
  });
  const custoDia = BASE.lotes.reduce((s, l) => s + custoLote(l.id) * (cab[l.id] || 0), 0);
  return { insumos, dietas, cab, insPorId, custoLote, custoDia, criticos: insumos.filter(i => i.dias != null && i.dias < 15) };
}
