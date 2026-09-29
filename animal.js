// ============================================================
// OrdenhaDigital — dados do rebanho, regras reprodutivas, ficha e formulários do animal
// Cada página define window.aoSalvar = () => { ...recarrega a tela... }
// ============================================================

const RACAS = ['Girolando 1/2', 'Girolando 3/4', 'Girolando 5/8', 'Holandesa', 'Jersey', 'Gir Leiteiro', 'Pardo Suíço', 'Mestiça'];
const CATEGORIAS = ['Bezerra', 'Novilha', 'Lactação', 'Seca'];
const CAT_MACHOS = ['Bezerro', 'Novilho', 'Touro'];
const FEMEAS_ADULTAS = ['Novilha', 'Lactação', 'Seca'];
const ehFemeaAdulta = a => FEMEAS_ADULTAS.includes(a.categoria);
const ehCria = a => a.categoria === 'Bezerra' || a.categoria === 'Bezerro';
const ehMacho = a => a.sexo === 'M' || CAT_MACHOS.includes(a.categoria);
const DIAS_GESTACAO = 283, DIAS_SECAGEM = 60, DIAS_PRE_PARTO = 21, ESPERA_VOLUNTARIA = 45;
// Eventos que contam como cobrição (mudam a vaca para "Inseminada" e marcam a data para o parto previsto)
const COBRICOES = ['Inseminação', 'Monta natural', 'Transferência de embrião'];

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
  if (ehCria(a)) return lotesTipo('bezerras')[0];
  return null;
}
function situacao(a) {
  const del = delDe(a), p = prevParto(a);
  if (ehCria(a)) return a.data_desmama ? pill('Desmamad' + (a.categoria === 'Bezerro' ? 'o' : 'a'), 'mute') : pill('Aleitamento', 'info');
  if (a.categoria === 'Touro') return pill('Reprodutor', 'acc');
  if (a.categoria === 'Novilho') return pill('Recria', 'mute');
  if (a.categoria === 'Seca') return p ? pill('Seca · parto ' + fd(p), 'acc') : pill('Seca · vazia', 'bad');
  switch (a.situacao_reprodutiva) {
    case 'Prenhe': return pill('Prenhe · parto ' + fd(p), 'ok');
    case 'Inseminada': return pill('Coberta há ' + diasIA(a) + ' d', 'info');
    case 'Pós-parto': return del != null && del >= ESPERA_VOLUNTARIA ? pill('Liberada p/ IA', 'warn') : pill('Pós-parto', 'mute');
    case 'Vazia': return del != null && del > 150 ? pill('Vazia · DEL alto', 'bad') : pill(a.categoria === 'Novilha' ? 'Vazia' : 'Vazia · liberada p/ IA', 'warn');
    case 'Apta p/ IA': return pill('Apta p/ IA', 'warn');
    default: return pill(a.situacao_reprodutiva || '—', 'mute');
  }
}
const animLink = a => `<span class="brinco">${esc(a.brinco)}</span> ${esc(a.nome || '')}`;
const nomeCurto = a => a ? a.brinco + (a.nome ? ' ' + a.nome : '') : '';
const optAnimais = (filtro, sel) => BASE.animais.filter(filtro).map(a => `<option value="${a.id}" ${a.id == sel ? 'selected' : ''}>${esc(a.brinco)}${a.nome ? ' · ' + esc(a.nome) : ''} (${a.categoria})</option>`).join('');
const optLotes = sel => `<option value="">— sem lote —</option>` + BASE.lotes.filter(l => l.ativo).map(l => `<option value="${l.id}" ${l.id == sel ? 'selected' : ''}>${esc(l.nome)}</option>`).join('');
const propriedades = () => [...new Set(BASE.animais.map(a => a.propriedade).filter(Boolean))].sort();

// ---------- pendências do dia ----------
function calcAlertas(extra = {}) {
  const A = BASE.animais, ad = A.filter(ehFemeaAdulta);
  const partos = ad.filter(a => { const p = prevParto(a); return p && dd(p, HOJE) <= 30; }).sort((a, b) => prevParto(a) - prevParto(b));
  const secar = lact().filter(a => { const p = prevParto(a); return p && dd(p, HOJE) <= DIAS_SECAGEM; });
  const diag = ad.filter(a => a.situacao_reprodutiva === 'Inseminada' && diasIA(a) >= 28);
  const cio = ad.filter(a => a.situacao_reprodutiva === 'Inseminada' && diasIA(a) >= 18 && diasIA(a) <= 24);
  const liberadas = ad.filter(a => (a.categoria === 'Lactação' && ((a.situacao_reprodutiva === 'Vazia' && delDe(a) <= 150) || (a.situacao_reprodutiva === 'Pós-parto' && delDe(a) >= ESPERA_VOLUNTARIA))) || (a.categoria === 'Novilha' && ['Apta p/ IA', 'Vazia'].includes(a.situacao_reprodutiva)));
  const problema = lact().filter(a => a.situacao_reprodutiva === 'Vazia' && delDe(a) > 150);
  const ccs = lact().filter(a => ccsAtual(a) > 500);
  const car = lact().filter(emCarencia);
  const bz = A.filter(ehCria);
  const desm = bz.filter(b => !b.data_desmama && b.data_nascimento && dd(HOJE, pd(b.data_nascimento)) >= 60);
  const b19 = bz.filter(b => b.categoria === 'Bezerra' && !b.data_b19 && b.data_nascimento && dd(HOJE, pd(b.data_nascimento)) >= 90);
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
      [desm.length + b19.length, 'Bezerreiro: desmama ou vacina B19', [...desm.map(b => b.brinco + ' desmamar'), ...b19.map(b => b.brinco + ' B19')].join(', '), 'info', 'bezerras.html'],
      [est.length, 'Insumo com menos de 15 dias de estoque', est.map(i => i.nome).join(', '), 'warn', 'nutricao.html'],
      [problema.length, 'Vazias com mais de 150 dias em lactação', nomes(problema), 'warn', 'reproducao.html'],
    ].filter(x => x[0] > 0) };
}

// ---------- genealogia (3 gerações) ----------
function genealogiaHtml(a, maeReg) {
  const mae = maeReg;
  const p = { nome: a.pai, reg: a.pai_registro, pai: a.avo_paterno, mae: a.avo_paterna };
  const m = mae
    ? { nome: nomeCurto(mae), reg: mae.registro, pai: mae.pai, mae: mae.mae_externa || (mae.mae_id ? (BASE.porId.get(mae.mae_id) ? nomeCurto(BASE.porId.get(mae.mae_id)) : 'cadastrada no sistema') : null), id: BASE.porId.get(mae.id) ? mae.id : null }
    : { nome: a.mae_externa, reg: a.mae_registro, pai: a.avo_materno, mae: a.avo_materna };
  const caixa = (rot, nome, reg, cls = '', id = null) => `<div class="gen-box ${cls} ${nome ? '' : 'vazio'}" ${id ? `onclick="ficha(${id})" style="cursor:pointer"` : ''}><small>${rot}</small><b>${esc(nome || 'não informado')}</b>${reg ? `<span class="mono">Reg. ${esc(reg)}</span>` : ''}</div>`;
  return `<div class="gen">
    <div class="gen-col">${caixa(a.sexo === 'M' ? 'Animal' : 'Animal', nomeCurto(a), a.registro, 'eu')}</div>
    <div class="gen-col">${caixa('Pai', p.nome, p.reg, 'pai')}${caixa('Mãe', m.nome, m.reg, 'mae', m.id)}</div>
    <div class="gen-col">${caixa('Avô paterno', p.pai)}${caixa('Avó paterna', p.mae)}${caixa('Avô materno', m.pai)}${caixa('Avó materna', m.mae)}</div>
  </div>`;
}

// ---------- ficha do animal ----------
async function ficha(id) {
  const a = BASE.porId.get(id); if (!a) return;
  document.getElementById('layer').innerHTML = `<div class="ovl" onclick="fechar()"></div><aside class="drawer"><div class="loading">Carregando ficha…</div></aside>`;
  const [ev, pes, tr, crias, premios, maeArr] = await Promise.all([
    q(sb.from('eventos').select('*').eq('animal_id', id).order('data', { ascending: false }).order('id', { ascending: false })),
    q(sb.from('pesagens_leite').select('*').eq('animal_id', id).order('data')),
    q(sb.from('tratamentos').select('*').eq('animal_id', id).order('data_inicio', { ascending: false })),
    q(sb.from('animais').select('id,brinco,nome,sexo,categoria,data_nascimento,registro,peso_nascimento,peso_desmama,peso_mae_desmama,data_desmama,pai,ativo,motivo_saida').eq('mae_id', id).order('data_nascimento', { ascending: false })),
    q(sb.from('premios').select('*').eq('animal_id', id).order('data', { ascending: false })),
    a.mae_id ? q(sb.from('animais').select('*').eq('id', a.mae_id)) : Promise.resolve([]),
  ]);
  const p = prevParto(a), del = delDe(a), prod = prodAtual(a), mae = maeArr[0] || null;
  const dl = [['Sexo', ehMacho(a) ? 'Macho' : 'Fêmea'], ['Raça', a.raca || '—'], ['Categoria', a.categoria], ['Registro', a.registro || 'sem registro'], ['Propriedade', a.propriedade || '—'], ['Procedência', a.procedencia || '—'], ['Lote', loteNome(a)], ['Nascimento', fdy(a.data_nascimento)], ['Idade', idadeTxt(a.data_nascimento)]];
  if (!ehMacho(a) && !ehCria(a)) dl.push(['Lactações', a.numero_lactacao || '—']);
  if (a.categoria === 'Lactação' || a.categoria === 'Seca') dl.push(['Último parto', fdy(a.data_ultimo_parto)], ['DEL', del ?? '—'], ['Produção', prod != null ? nf(prod, 1) + ' L/dia' : a.categoria === 'Seca' ? 'seca' : 'sem pesagem']);
  if (a.data_ultima_ia) dl.push(['Última cobrição', fdy(a.data_ultima_ia)], ['Touro', a.touro_ultima_ia || '—'], ['Cobrições no ciclo', a.ias_no_ciclo]);
  if (p) dl.push(['Parto previsto', fdy(p)], ['Secar até', fdy(addD(p, -DIAS_SECAGEM))], ['Pré-parto', fdy(addD(p, -DIAS_PRE_PARTO))]);
  if (a.peso) dl.push(['Peso atual', nf(a.peso) + ' kg']);
  if (a.peso_nascimento) dl.push(['Peso ao nascer', nf(a.peso_nascimento) + ' kg']);
  if (a.peso_desmama) dl.push(['Peso na desmama', nf(a.peso_desmama) + ' kg']);
  if (ccsAtual(a) != null) dl.push(['CCS', nf(ccsAtual(a)) + ' mil']);
  const pontos = a.data_ultimo_parto ? pes.filter(x => x.data >= a.data_ultimo_parto).map(x => ({ d: dd(pd(x.data), pd(a.data_ultimo_parto)), l: Number(x.total) })) : [];
  const cobricoes = ev.filter(e => COBRICOES.includes(e.tipo));
  const femea = !ehMacho(a);
  document.getElementById('layer').innerHTML = `<div class="ovl" onclick="fechar()"></div><aside class="drawer" role="dialog" aria-label="Ficha do animal"><button class="btn sm close" onclick="fechar()">Fechar</button>
  <span class="brinco" style="font-size:.95rem">${esc(a.brinco)}</span><h1 style="margin-top:6px">${esc(a.nome || 'Sem nome')}</h1>
  <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${situacao(a)}${emCarencia(a) ? pill('leite em carência', 'bad') : ''}${a.registro ? pill('Registrado', 'ok') : ''}${premios.length ? pill(premios.length + ' prêmio' + (premios.length > 1 ? 's' : ''), 'warn') : ''}</div>
  <dl class="dl">${dl.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  ${a.observacao ? `<p class="muted" style="margin-top:-6px">${esc(a.observacao)}</p>` : ''}
  <div class="actions">${ehFemeaAdulta(a) ? `<button class="btn sm" onclick="formEvento(${id})">Evento reprodutivo</button>` : ''}${a.categoria === 'Lactação' ? `<button class="btn sm" onclick="formPesagem(${id})">Pesagem de leite</button>` : ''}<button class="btn sm" onclick="formTratamento(${id})">Tratamento</button><button class="btn sm" onclick="formPremio(${id})">Prêmio</button><button class="btn sm" onclick="formAnimal(${id})">Editar</button><button class="btn sm danger" onclick="formSaida(${id})">Saída do rebanho</button></div>
  ${a.categoria === 'Lactação' || pontos.length ? `<div class="sec-t">Curva de lactação atual</div><div class="legend" style="margin-bottom:4px"><span><i style="background:var(--accent)"></i>pesagens (L/dia)</span><span><i style="background:var(--muted)"></i>curva esperada</span><span>eixo: dias em lactação</span></div>${curvaChart(pontos, del)}` : ''}
  <div class="sec-t">Genealogia</div>${genealogiaHtml(a, mae)}
  ${femea && (crias.length || a.numero_lactacao) ? `<div class="sec-t">Crias (${crias.length})</div>${crias.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Cria</th><th>Nasc.</th><th>Pai</th><th>Registro</th><th class="num">Ao nascer</th><th class="num">Desmama</th><th class="num">Mãe na desmama</th></tr></thead><tbody>${crias.map(c => `<tr ${BASE.porId.get(c.id) ? `class="click" onclick="ficha(${c.id})"` : ''}><td><span class="brinco">${esc(c.brinco)}</span> ${esc(c.nome || '')} ${pill(c.sexo === 'M' ? 'macho' : 'fêmea', c.sexo === 'M' ? 'info' : 'acc')}${c.ativo ? '' : ' ' + pill(esc(c.motivo_saida || 'saiu'), 'mute')}</td><td class="mono">${fd(c.data_nascimento)}</td><td class="muted">${esc(c.pai || '—')}</td><td>${c.registro ? pill(esc(c.registro), 'ok') : pill('sem registro', 'mute')}</td><td class="num mono">${c.peso_nascimento ? nf(c.peso_nascimento) + ' kg' : '—'}</td><td class="num mono">${c.peso_desmama ? nf(c.peso_desmama) + ' kg' : '—'}</td><td class="num mono">${c.peso_mae_desmama ? nf(c.peso_mae_desmama) + ' kg' : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhuma cria cadastrada no sistema. Partos anteriores aparecem no histórico.</div>'}` : ''}
  ${cobricoes.length ? `<div class="sec-t">Cobrições</div><table class="tbl"><tbody>${cobricoes.map(e => `<tr><td class="mono">${fd(e.data)}${e.data_fim ? ' a ' + fd(e.data_fim) : ''}</td><td><b>${esc(e.tipo)}</b><br><small class="muted">${esc(e.detalhe || '')}</small></td></tr>`).join('')}</tbody></table>` : ''}
  ${premios.length ? `<div class="sec-t">Prêmios</div><table class="tbl"><tbody>${premios.map(r => `<tr><td class="mono">${fdy(r.data)}</td><td><b>${esc(r.colocacao || '')}</b> ${esc(r.categoria ? '· ' + r.categoria : '')}<br><small class="muted">${esc(r.evento)}${r.observacao ? ' · ' + esc(r.observacao) : ''}</small></td><td><button class="btn sm danger" onclick="excluirPremio(${r.id},${id})">Excluir</button></td></tr>`).join('')}</tbody></table>` : ''}
  ${tr.length ? `<div class="sec-t">Tratamentos</div><table class="tbl"><tbody>${tr.map(t => `<tr><td class="mono">${fd(t.data_inicio)}</td><td>${esc(t.doenca)}<br><small class="muted">${esc(t.medicamento)}</small></td><td>${pd(t.data_liberacao) > HOJE && t.carencia_leite > 0 ? pill('libera ' + fd(t.data_liberacao), 'bad') : pill('concluído', 'mute')}</td></tr>`).join('')}</tbody></table>` : ''}
  <div class="sec-t">Histórico</div>${ev.length ? `<ul class="tl">${ev.map(e => `<li><small>${fdy(e.data)}${e.data_fim ? ' a ' + fdy(e.data_fim) : ''}</small><br><b>${esc(e.tipo)}</b> <span class="muted">${esc(e.detalhe || '')}</span></li>`).join('')}</ul>` : '<div class="empty">Nenhum evento registrado ainda.</div>'}</aside>`;
}

async function registrarEvento(animal_id, data, tipo, detalhe, touro_id = null, data_fim = null) {
  await q(sb.from('eventos').insert({ animal_id, data, tipo, detalhe, touro_id, data_fim }));
}
async function depoisDeSalvar(msg) { toast(msg); if (window.aoSalvar) await window.aoSalvar(); }

// ---------- cadastro / edição ----------
function formAnimal(id, catPadrao) {
  const a = id ? BASE.porId.get(id) : null, v = (k, d = '') => a && a[k] != null ? esc(a[k]) : d;
  const cat = a ? a.categoria : (catPadrao || 'Lactação');
  const sexo = a ? (a.sexo || 'F') : (CAT_MACHOS.includes(cat) ? 'M' : 'F');
  abrirModal({
    titulo: a ? 'Editar ' + esc(a.brinco) : 'Cadastrar animal', wide: true,
    corpo: `<div class="sec-t full" style="margin-top:0">Identificação</div>
    <label>Brinco<input name="brinco" id="fa-brinco" required value="${v('brinco')}"></label><label>Nome<input name="nome" id="fa-nome" value="${v('nome')}"></label>
    <label>Sexo<select name="sexo" id="fa-sexo" onchange="trocarSexo()"><option value="F" ${sexo === 'F' ? 'selected' : ''}>Fêmea</option><option value="M" ${sexo === 'M' ? 'selected' : ''}>Macho</option></select></label>
    <label>Categoria<select name="categoria" id="fa-cat" data-atual="${esc(cat)}" onchange="mostrarCamposCategoria(${a ? 'false' : 'true'})"></select></label>
    <label>Raça<input name="raca" id="fa-raca" list="dl-racas" value="${v('raca')}"><datalist id="dl-racas">${RACAS.map(r => `<option>${r}</option>`).join('')}</datalist></label>
    <label>Nº de registro (associação)<input name="registro" id="fa-reg" value="${v('registro')}" placeholder="deixe em branco se não tem"></label>
    <label>Nascimento<input name="data_nascimento" id="fa-nasc" type="date" value="${v('data_nascimento')}"></label><label>Lote<select name="lote_id" id="fa-lote">${optLotes(a ? a.lote_id : '')}</select></label>
    <label>Propriedade<input name="propriedade" id="fa-prop" list="dl-props" value="${v('propriedade')}"><datalist id="dl-props">${propriedades().map(p => `<option>${esc(p)}</option>`).join('')}</datalist></label>
    <label>Procedência<input name="procedencia" id="fa-proc" list="dl-proc" value="${v('procedencia')}" placeholder="Ex.: nascida na fazenda, comprada de…"><datalist id="dl-proc"><option>Nascida na fazenda</option><option>Comprada</option></datalist></label>
    <label>Peso atual (kg)<input name="peso" id="fa-peso" type="number" step="0.1" min="0" value="${v('peso')}"></label><label>Peso ao nascer (kg)<input name="peso_nascimento" id="fa-pnasc" type="number" step="0.1" min="0" value="${v('peso_nascimento')}"></label>
    <label class="full">Observação<input name="observacao" id="fa-obs" value="${v('observacao')}"></label>
    <div class="sec-t full">Genealogia</div>
    <label>Pai (touro)<input name="pai" id="fa-pai" list="dl-touros" value="${v('pai')}"></label><label>Registro do pai<input name="pai_registro" id="fa-pai-reg" value="${v('pai_registro')}"></label>
    <label>Avô paterno<input name="avo_paterno" id="fa-avo-p" value="${v('avo_paterno')}"></label><label>Avó paterna<input name="avo_paterna" id="fa-ava-p" value="${v('avo_paterna')}"></label>
    <label class="full">Mãe (se estiver no rebanho)<select name="mae_id" id="fa-mae" onchange="document.querySelectorAll('[data-mae-ext]').forEach(e=>e.hidden=!!this.value)"><option value="">— mãe de fora do rebanho / não informada —</option>${optAnimais(x => x.id !== id && ehFemeaAdulta(x), a ? a.mae_id : '')}</select></label>
    <label data-mae-ext>Mãe (nome, se de fora)<input name="mae_externa" id="fa-mae-ext" value="${v('mae_externa')}"></label><label data-mae-ext>Registro da mãe<input name="mae_registro" id="fa-mae-reg" value="${v('mae_registro')}"></label>
    <label data-mae-ext>Avô materno<input name="avo_materno" id="fa-avo-m" value="${v('avo_materno')}"></label><label data-mae-ext>Avó materna<input name="avo_materna" id="fa-ava-m" value="${v('avo_materna')}"></label>
    <div class="hint" data-mae-ext>Quando a mãe está no rebanho, o registro e os avós maternos vêm da ficha dela.</div>
    <datalist id="dl-touros">${BASE.touros.map(t => `<option>${esc(t.codigo)}</option>`).join('')}${BASE.animais.filter(x => x.categoria === 'Touro').map(t => `<option>${esc(nomeCurto(t))}</option>`).join('')}</datalist>
    <div class="sec-t full" data-cat="Lactação Seca Novilha">Situação atual</div>
    <label data-cat="Lactação Seca">Nº de lactações<input name="numero_lactacao" id="fa-nlac" type="number" min="0" value="${v('numero_lactacao', cat === 'Lactação' ? '1' : '0')}"></label>
    <label data-cat="Lactação Seca">Data do último parto<input name="data_ultimo_parto" id="fa-parto" type="date" value="${v('data_ultimo_parto')}"></label>
    <label data-cat="Lactação Seca Novilha">Situação reprodutiva<select name="situacao_reprodutiva" id="fa-sit">${['Em recria', 'Apta p/ IA', 'Pós-parto', 'Vazia', 'Inseminada', 'Prenhe'].map(s => `<option value="${s}" ${a && a.situacao_reprodutiva === s ? 'selected' : ''}>${s === 'Inseminada' ? 'Coberta / inseminada' : s}</option>`).join('')}</select></label>
    <label data-cat="Lactação Seca Novilha">Data da última cobrição<input name="data_ultima_ia" id="fa-ia" type="date" value="${v('data_ultima_ia')}"></label>
    <label data-cat="Lactação Seca Novilha">Touro da última cobrição<input name="touro_ultima_ia" id="fa-touro" list="dl-touros" value="${v('touro_ultima_ia')}"></label>
    <label data-cat="Seca">Data da secagem<input name="data_secagem" id="fa-sec" type="date" value="${v('data_secagem')}"></label>
    <div class="hint" data-cat="Lactação Seca Novilha">Para quem está entrando no sistema agora: informe a situação de hoje. Com a data da cobrição de uma vaca prenhe, o sistema calcula parto, secagem e pré-parto sozinho.</div>`,
    salvar: async f => {
      const t = s => (s || '').trim() || null;
      const reg = {
        brinco: f.brinco.trim(), nome: t(f.nome), raca: t(f.raca), categoria: f.categoria, sexo: f.sexo, registro: t(f.registro),
        propriedade: t(f.propriedade), procedencia: t(f.procedencia), data_nascimento: f.data_nascimento || null, lote_id: f.lote_id ? +f.lote_id : null,
        mae_id: f.mae_id ? +f.mae_id : null, pai: t(f.pai), pai_registro: t(f.pai_registro), avo_paterno: t(f.avo_paterno), avo_paterna: t(f.avo_paterna),
        mae_externa: f.mae_id ? null : t(f.mae_externa), mae_registro: f.mae_id ? null : t(f.mae_registro),
        avo_materno: f.mae_id ? null : t(f.avo_materno), avo_materna: f.mae_id ? null : t(f.avo_materna),
        peso: f.peso ? +f.peso : null, peso_nascimento: f.peso_nascimento ? +f.peso_nascimento : null, observacao: t(f.observacao),
      };
      if (f.categoria === 'Lactação' || f.categoria === 'Seca') { reg.numero_lactacao = +f.numero_lactacao || 0; reg.data_ultimo_parto = f.data_ultimo_parto || null; }
      if (!FEMEAS_ADULTAS.includes(f.categoria)) { reg.situacao_reprodutiva = 'Em recria'; }
      else {
        reg.situacao_reprodutiva = f.situacao_reprodutiva; reg.data_ultima_ia = f.data_ultima_ia || null; reg.touro_ultima_ia = t(f.touro_ultima_ia);
        if (['Inseminada', 'Prenhe'].includes(reg.situacao_reprodutiva) && !reg.data_ultima_ia) throw new Error('informe a data da última cobrição para vaca coberta ou prenhe.');
        if (reg.data_ultima_ia && (!a || a.ias_no_ciclo === 0)) reg.ias_no_ciclo = 1;
      }
      reg.data_secagem = f.categoria === 'Seca' ? (f.data_secagem || null) : null;
      if (f.categoria === 'Lactação' && !reg.data_ultimo_parto) throw new Error('informe a data do último parto da vaca em lactação.');
      if (a) {
        await q(sb.from('animais').update(reg).eq('id', id));
      } else {
        if (!reg.lote_id) { const L = lotesTipo('lactacao'); const l = loteSugerido({ ...reg, id: 0 }) || (reg.categoria === 'Lactação' ? L[1] || L[0] : null); if (l) reg.lote_id = l.id; }
        if (ehCria(reg)) reg.leite_aleitamento = 6;
        const novo = await q(sb.from('animais').insert(reg).select().single());
        await registrarEvento(novo.id, iso(HOJE), 'Cadastro', 'Entrada no sistema' + (reg.procedencia ? ' · ' + reg.procedencia : ''));
      }
      await depoisDeSalvar(a ? 'Dados atualizados' : `${reg.nome || reg.brinco} cadastrad${reg.sexo === 'M' ? 'o' : 'a'} no rebanho`);
    }
  });
  trocarSexo(true);
  document.querySelectorAll('[data-mae-ext]').forEach(e => e.hidden = !!document.getElementById('fa-mae').value);
}
function trocarSexo(inicial) {
  const s = document.getElementById('fa-sexo').value, sel = document.getElementById('fa-cat');
  const lista = s === 'M' ? CAT_MACHOS : CATEGORIAS, atual = inicial ? sel.dataset.atual : sel.value;
  sel.innerHTML = lista.map(c => `<option ${c === atual ? 'selected' : ''}>${c}</option>`).join('');
  mostrarCamposCategoria(!inicial || !document.getElementById('fa-brinco').value);
}
function mostrarCamposCategoria(novo) {
  const c = document.getElementById('fa-cat').value;
  if (novo) document.getElementById('fa-sit').value = { 'Lactação': 'Vazia', 'Seca': 'Prenhe', 'Novilha': 'Em recria' }[c] || 'Em recria';
  document.querySelectorAll('#mform [data-cat]').forEach(el => el.hidden = !el.dataset.cat.split(' ').includes(c));
}

// ---------- evento reprodutivo ----------
const TIPOS_EVENTO = ['Inseminação', 'Monta natural', 'Transferência de embrião', 'Diagnóstico positivo', 'Diagnóstico negativo', 'Cio observado', 'Parto', 'Secagem', 'Aborto'];
function formEvento(id) {
  const reprodutores = BASE.animais.filter(x => x.categoria === 'Touro');
  abrirModal({
    titulo: 'Registrar evento reprodutivo',
    corpo: `<label class="full">Animal<select name="animal" id="fe-animal" required><option value="">Escolha…</option>${optAnimais(ehFemeaAdulta, id)}</select></label>
    <label>Evento<select name="tipo" id="fe-tipo" onchange="camposEvento()">${TIPOS_EVENTO.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label><span id="fe-data-rot">Data</span><input name="data" id="fe-data" type="date" value="${iso(HOJE)}" required></label>
    <label class="full" data-ev="Inseminação">Sêmen do botijão<select name="touro" id="fe-touro"><option value="">— informar sem baixa no botijão —</option>${BASE.touros.filter(t => t.ativo).map(t => `<option value="${t.id}" ${t.doses > 0 ? '' : 'disabled'}>${esc(t.codigo)} · ${t.doses} doses</option>`).join('')}</select></label>
    <label class="full" data-ev="Inseminação">Ou outro sêmen<input name="touro_txt" id="fe-touro-txt" placeholder="opcional"></label>
    <label data-ev="Monta natural">Touro da monta<input name="touro_monta" id="fe-touro-monta" list="dl-reprod" placeholder="brinco ou nome"><datalist id="dl-reprod">${reprodutores.map(t => `<option>${esc(nomeCurto(t))}</option>`).join('')}</datalist></label>
    <label data-ev="Monta natural">Fim do período com o touro<input name="data_fim" id="fe-data-fim" type="date"></label>
    <label data-ev="Transferência de embrião">Touro (pai do embrião)<input name="touro_te" id="fe-touro-te" list="dl-touros-te"><datalist id="dl-touros-te">${BASE.touros.map(t => `<option>${esc(t.codigo)}</option>`).join('')}</datalist></label>
    <label data-ev="Transferência de embrião">Doadora (mãe do embrião)<input name="doadora" id="fe-doadora" placeholder="nome ou registro"></label>
    <label data-ev="Diagnóstico positivo">Idade da gestação (dias)<input name="dias_gest" id="fe-dias-gest" type="number" min="20" max="280" placeholder="opcional, pelo ultrassom"></label>
    <label data-ev="Parto">Cria<select name="cria" id="fe-cria" onchange="camposEvento()"><option>Fêmea</option><option>Macho</option><option>Natimorto</option><option>Gêmeos (2 fêmeas)</option></select></label>
    <label data-ev="Parto" data-cria="Fêmea Macho Gêmeos (2 fêmeas)"><span id="fe-rot-brinco">Brinco da cria</span><input name="brinco_cria" id="fe-brinco-cria"></label>
    <label data-ev="Parto" data-cria="Fêmea Macho Gêmeos (2 fêmeas)">Nome da cria<input name="nome_cria" id="fe-nome-cria" placeholder="opcional"></label>
    <label data-ev="Parto" data-cria="Fêmea Macho Gêmeos (2 fêmeas)">Peso ao nascer (kg)<input name="peso_cria" id="fe-peso-cria" type="number" step="0.1" min="0"></label>
    <label data-ev="Parto" data-cria="Fêmea Macho Gêmeos (2 fêmeas)">Registro da cria<input name="registro_cria" id="fe-reg-cria" placeholder="se já tiver"></label>
    <label data-ev="Parto" data-cria="Fêmea Macho Gêmeos (2 fêmeas)" class="chk full"><input type="checkbox" name="colostro" id="fe-colostro" checked> Recebeu colostro nas primeiras 6 horas</label>
    <label class="full">Observação<input name="obs" id="fe-obs"></label>
    <div class="hint" id="fe-hint"></div>`,
    salvar: async f => {
      const a = BASE.porId.get(+f.animal); if (!a) throw new Error('escolha o animal.');
      const d = f.data, up = {}; let det = f.obs.trim(), touroId = null, dataFim = null;
      if (COBRICOES.includes(f.tipo)) {
        let nomeTouro = '';
        if (f.tipo === 'Inseminação') {
          const t = f.touro ? BASE.touros.find(x => x.id == f.touro) : null;
          nomeTouro = t ? t.codigo : f.touro_txt.trim();
          if (t) { touroId = t.id; await q(sb.from('touros').update({ doses: Math.max(0, t.doses - 1) }).eq('id', t.id)); }
        } else if (f.tipo === 'Monta natural') {
          nomeTouro = f.touro_monta.trim();
          dataFim = f.data_fim || null;
          if (dataFim && dataFim < d) throw new Error('o fim do período não pode ser antes do início.');
        } else {
          nomeTouro = f.touro_te.trim();
          if (f.doadora.trim()) det = ['Doadora ' + f.doadora.trim(), det].filter(Boolean).join(' · ');
        }
        if (!nomeTouro) throw new Error('informe o touro.');
        Object.assign(up, { data_ultima_ia: d, touro_ultima_ia: nomeTouro, situacao_reprodutiva: 'Inseminada', ias_no_ciclo: (['Vazia', 'Inseminada'].includes(a.situacao_reprodutiva) ? a.ias_no_ciclo : 0) + 1 });
        det = [nomeTouro, det].filter(Boolean).join(' · ');
      } else if (f.tipo === 'Diagnóstico positivo') {
        if (f.dias_gest) up.data_ultima_ia = iso(addD(pd(d), -(+f.dias_gest)));
        else if (!a.data_ultima_ia) throw new Error('registre a cobrição antes, ou informe a idade da gestação.');
        up.situacao_reprodutiva = 'Prenhe';
        det = [(f.dias_gest ? f.dias_gest + ' dias de gestação · ' : '') + 'Parto previsto ' + fdy(addD(pd(up.data_ultima_ia || a.data_ultima_ia), DIAS_GESTACAO)), det].filter(Boolean).join(' · ');
      } else if (f.tipo === 'Diagnóstico negativo' || f.tipo === 'Aborto') {
        up.situacao_reprodutiva = 'Vazia';
      } else if (f.tipo === 'Parto') {
        const lote = lotesTipo('lactacao')[0], pai = a.touro_ultima_ia;
        Object.assign(up, { categoria: 'Lactação', numero_lactacao: (a.numero_lactacao || 0) + 1, data_ultimo_parto: d, situacao_reprodutiva: 'Pós-parto', data_ultima_ia: null, touro_ultima_ia: null, ias_no_ciclo: 0, data_secagem: null, lote_id: lote ? lote.id : a.lote_id });
        det = [`${up.numero_lactacao}ª lactação · cria ${f.cria.toLowerCase()}`, det].filter(Boolean).join(' · ');
        const macho = f.cria === 'Macho';
        if (f.cria !== 'Natimorto' && (!macho || f.brinco_cria.trim())) {
          if (!f.brinco_cria.trim()) throw new Error('informe o brinco da bezerra.');
          const lb = lotesTipo('bezerras')[0];
          const b = await q(sb.from('animais').insert({ brinco: f.brinco_cria.trim(), nome: f.nome_cria.trim() || null, sexo: macho ? 'M' : 'F', raca: a.raca, categoria: macho ? 'Bezerro' : 'Bezerra', data_nascimento: d, mae_id: a.id, pai, propriedade: a.propriedade, procedencia: 'Nascid' + (macho ? 'o' : 'a') + ' na fazenda', registro: f.registro_cria.trim() || null, peso_nascimento: f.peso_cria ? +f.peso_cria : null, peso: f.peso_cria ? +f.peso_cria : null, lote_id: lb ? lb.id : null, situacao_reprodutiva: 'Em recria', colostro_ok: !!f.colostro, leite_aleitamento: 6 }).select().single());
          await registrarEvento(b.id, d, 'Nascimento', `${macho ? 'Filho' : 'Filha'} de ${a.brinco}` + (pai ? ' e ' + pai : '') + (f.peso_cria ? ' · ' + f.peso_cria + ' kg' : '') + (f.colostro ? ' · colostro ok' : ' · sem registro de colostro'));
          det += ` · ${macho ? 'bezerro' : 'bezerra'} ${b.brinco}`;
        }
      } else if (f.tipo === 'Secagem') {
        if (a.categoria !== 'Lactação') throw new Error('só vacas em lactação podem ser secas.');
        const pp = prevParto(a), l = (pp && dd(pp, pd(d)) <= DIAS_PRE_PARTO ? lotesTipo('pre_parto')[0] : null) || lotesTipo('secas')[0];
        Object.assign(up, { categoria: 'Seca', data_secagem: d, lote_id: l ? l.id : a.lote_id });
      }
      if (Object.keys(up).length) await q(sb.from('animais').update(up).eq('id', a.id));
      await registrarEvento(a.id, d, f.tipo, det, touroId, dataFim);
      await depoisDeSalvar(`${f.tipo} registrado para ${a.nome || a.brinco}`);
    }
  });
  camposEvento();
}
const DICAS_EVENTO = {
  'Inseminação': 'Dá baixa no botijão e agenda o diagnóstico para 30 dias.',
  'Monta natural': 'Informe o dia em que o touro entrou com a vaca. Se ficou um período junto, informe o fim. No diagnóstico, a idade da gestação acerta o parto previsto.',
  'Transferência de embrião': 'A vaca que recebeu o embrião é a receptora. O pai e a doadora ficam registrados como genealogia da cria.',
  'Diagnóstico positivo': 'Calcula parto (+283 dias da cobrição), secagem (−60) e pré-parto (−21). Com a idade da gestação pelo ultrassom, a conta usa ela.',
  'Parto': 'Fêmea é cadastrada no bezerreiro. Macho só é cadastrado se você informar o brinco.',
};
function camposEvento() {
  const t = document.getElementById('fe-tipo').value, c = document.getElementById('fe-cria').value;
  document.querySelectorAll('#mform [data-ev]').forEach(el => el.hidden = el.dataset.ev !== t || (el.dataset.cria && !el.dataset.cria.split(' ').includes(c.split(' ')[0])));
  document.getElementById('fe-data-rot').textContent = t === 'Monta natural' ? 'Início (touro entrou)' : 'Data';
  document.getElementById('fe-rot-brinco').textContent = c === 'Macho' ? 'Brinco do bezerro (opcional)' : 'Brinco da bezerra';
  const h = document.getElementById('fe-hint'); h.textContent = DICAS_EVENTO[t] || ''; h.hidden = !DICAS_EVENTO[t];
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

// ---------- prêmios ----------
function formPremio(id) {
  const a = BASE.porId.get(id);
  abrirModal({
    titulo: 'Registrar prêmio · ' + esc(nomeCurto(a)),
    corpo: `<label class="full">Exposição / torneio<input name="evento" id="fpr-evento" required placeholder="Ex.: Expo Leite 2026, Torneio Leiteiro Regional"></label>
    <label>Data<input name="data" id="fpr-data" type="date" value="${iso(HOJE)}" required></label>
    <label>Colocação / título<input name="colocacao" id="fpr-col" list="dl-col" required><datalist id="dl-col">${['Grande Campeã', 'Campeã', 'Reservada Campeã', '1º lugar', '2º lugar', '3º lugar', 'Melhor úbere', 'Campeã do torneio leiteiro'].map(x => `<option>${x}</option>`).join('')}</datalist></label>
    <label>Categoria<input name="categoria" id="fpr-cat" placeholder="Ex.: Vaca adulta, Novilha júnior"></label><label>Observação<input name="obs" id="fpr-obs" placeholder="Ex.: 52 L no torneio"></label>`,
    salvar: async f => {
      await q(sb.from('premios').insert({ animal_id: id, data: f.data, evento: f.evento.trim(), colocacao: f.colocacao.trim(), categoria: f.categoria.trim() || null, observacao: f.obs.trim() || null }));
      await registrarEvento(id, f.data, 'Prêmio', `${f.colocacao.trim()} · ${f.evento.trim()}`);
      toast('Prêmio registrado'); ficha(id);
    }
  });
}
function excluirPremio(pid, id) {
  confirmar('Excluir prêmio', 'Excluir este prêmio?', async () => { await q(sb.from('premios').delete().eq('id', pid)); toast('Prêmio excluído'); ficha(id); }, 'Excluir');
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

// ---------- produção por lactação (método de Fleischmann, usado no controle leiteiro oficial) ----------
// 1º intervalo: parto até a 1ª pesagem × 1ª pesagem; depois média entre pesagens × dias entre elas;
// para vaca ainda em lactação, soma da última pesagem até hoje com o valor da última.
function producaoLactacao(a, pesagens) {
  if (!a.data_ultimo_parto) return null;
  const parto = pd(a.data_ultimo_parto), fim = a.categoria === 'Lactação' ? HOJE : (a.data_secagem ? pd(a.data_secagem) : null);
  const ps = pesagens.filter(p => p.animal_id === a.id && p.data >= a.data_ultimo_parto).map(p => ({ d: dd(pd(p.data), parto), l: Number(p.total) })).sort((x, y) => x.d - y.d);
  if (!ps.length) return null;
  let total = ps[0].d * ps[0].l;
  for (let i = 1; i < ps.length; i++) total += (ps[i].d - ps[i - 1].d) * (ps[i].l + ps[i - 1].l) / 2;
  const ult = ps[ps.length - 1];
  if (fim) total += Math.max(0, dd(fim, parto) - ult.d) * ult.l;
  // projeção para 305 dias pela curva de lactação ajustada às pesagens
  const k = ps.reduce((s, p) => s + p.l / woodForma(Math.max(p.d, 1)), 0) / ps.length;
  let proj = 0; for (let d = 1; d <= 305; d++) proj += k * woodForma(d);
  return { total, proj305: proj, pontos: ps, dias: fim ? dd(fim, parto) : ult.d };
}
