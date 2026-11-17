
import { OPCOES, normalizePlan } from "./ficha-ia.js";

export function boot(STORE) {
  "use strict";
  var LETTERS = ["A", "B", "C", "D"];
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4.5 4.5L19 7"/></svg>';
  var main = document.getElementById("main"), statusEl = document.getElementById("status");
  var db = null, plan = null, remote = [], planLoaded = false, sessLoaded = false, failed = "";
  var pending = new Map(), pumping = false;
  var view = "treino", letter = null, active = null, drafts = {}, resumo = null;
  var editing = null, adding = false, erro = null, confirmDiscard = false, confirmDel = null;
  var evoEx = null, evoMetric = "carga", openH = {}, wake = null, audio = null, inputTimer = null;
  var chartPts = [];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n, d) { return n == null || isNaN(n) ? "" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d == null ? 1 : d }); }
  function num(v) { if (v == null) return null; var s = String(v).trim().replace(",", "."); if (s === "") return null; var n = parseFloat(s); return isNaN(n) || n < 0 ? null : n; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function series_(n) { return n + (n === 1 ? " série" : " séries"); }
  function dia(ms) { return new Date(ms).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(/\.,?/g, ","). replace(",,", ","); }
  function curta(ms) { return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
  function mmss(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  /* ---------- gravação: fila com nova tentativa, para a internet instável da academia ---------- */
  function persistQueue() { store("ficha_fila", Array.from(pending.entries())); }
  function setStatus(t, err) { statusEl.textContent = t; statusEl.className = err ? "err" : ""; }
  function put(path, body) { pending.set(path, body); persistQueue(); pump(); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function pump() {
    if (pumping || !db) return;
    pumping = true;
    var tries = 0;
    while (pending.size) {
      var first = pending.entries().next().value, path = first[0], body = first[1];
      setStatus("Salvando…");
      try {
        if (body === null) await db.doc(path).delete(); else await db.doc(path).set(body);
        if (pending.get(path) === body) { pending.delete(path); persistQueue(); }
        tries = 0;
      } catch (e) {
        var code = e && e.code;
        if (code === "invalid_argument" || code === "quota_exceeded" || code === "revoked" || code === "not_granted") {
          setStatus("Não consegui salvar. Recarregue a página para tentar de novo.", true);
          pumping = false;
          return;
        }
        tries++;
        setStatus("Sem conexão. Seus dados ficam guardados aqui e eu tento de novo.", true);
        await wait(Math.min(2000 * Math.pow(2, tries), 30000));
      }
    }
    pumping = false;
    setStatus("Salvo");
  }
  function saveActive() { if (!active) return; active.atualizado = Date.now(); put("sessoes/" + active.id, clone(active)); }
  function savePlan() { plan.atualizado = Date.now(); put("plano/atual", clone(plan)); }
  function sessions() {
    var m = new Map(remote.map(function (s) { return [s.id, s]; }));
    pending.forEach(function (b, p) { if (p.indexOf("sessoes/") === 0) { var id = p.slice(8); if (b === null) m.delete(id); else m.set(id, b); } });
    return Array.from(m.values()).sort(function (a, b) { return b.inicio - a.inicio; });
  }
  function finished() { return sessions().filter(function (s) { return s.fim; }); }

  /* ---------- cálculos ---------- */
  function done(ex) { return (ex.series || []).filter(function (s) { return s.feito; }); }
  function volSet(s, ex) { return ex.unidade === "seg" ? 0 : (s.kg || 0) * (s.reps || 0); }
  function volume(sess) { return (sess.exercicios || []).reduce(function (t, ex) { return t + done(ex).reduce(function (a, s) { return a + volSet(s, ex); }, 0); }, 0); }
  function setCount(sess) { return (sess.exercicios || []).reduce(function (t, ex) { return t + done(ex).length; }, 0); }
  function lastFor(nome) {
    var f = finished();
    for (var i = 0; i < f.length; i++) for (var j = 0; j < f[i].exercicios.length; j++) {
      var ex = f[i].exercicios[j];
      if (ex.nome === nome && done(ex).length) return { data: f[i].inicio, ex: ex, series: done(ex) };
    }
    return null;
  }
  function setText(s, ex) { if (ex.unidade === "seg") return (s.kg ? fmt(s.kg) + " kg × " : "") + fmt(s.reps) + " s"; return (s.kg ? fmt(s.kg) + "×" : "") + fmt(s.reps); }
  function suggestion(pe) {
    var last = lastFor(pe.nome);
    if (!last) return { txt: "Primeira vez: pare com 2 a 3 reps sobrando", kg: null };
    var maxKg = Math.max.apply(null, last.series.map(function (s) { return s.kg || 0; }));
    var hit = last.series.length >= pe.series && last.series.every(function (s) { return (s.reps || 0) >= pe.repsMax; });
    var un = pe.unidade === "seg" ? "s" : "reps";
    if (pe.corpo && !maxKg) return hit ? { txt: "Bateu " + pe.repsMax + " " + un + ": pode aumentar", up: true, kg: null } : { txt: "Busque " + pe.repsMax + " " + un + " em todas", kg: null };
    if (hit) return { txt: "Subir para " + fmt(maxKg + (pe.inc || 2.5)) + " kg", up: true, kg: maxKg + (pe.inc || 2.5) };
    var low = last.series.filter(function (s) { return s.kg && (s.reps || 0) < pe.repsMin; });
    if (low.length) { var base = Math.min.apply(null, low.map(function (s) { return s.kg; })), novo = Math.max(base - (pe.inc || 2.5), 0); if (novo > 0) return { txt: "Abaixo de " + pe.repsMin + " reps: baixar para " + fmt(novo) + " kg", down: true, kg: novo }; }
    return { txt: "Manter " + fmt(maxKg) + " kg e buscar mais reps", kg: maxKg };
  }
  function planEx(l, id) { return (plan.treinos[l].exercicios || []).filter(function (e) { return e.id === id; })[0]; }
  function placeholder(sess, i, j, pe) {
    var ex = sess.exercicios[i], last = lastFor(ex.nome), r = { kg: null, reps: null };
    if (last) { var s = last.series[j] || last.series[last.series.length - 1]; r.kg = s.kg; r.reps = s.reps; var sg = suggestion(pe); if (sg.kg != null) r.kg = sg.kg; if (sg.up || sg.down) r.reps = pe.repsMin; }
    else if (j > 0) { var p = ex.series[j - 1]; r.kg = p.kg; r.reps = p.reps; }
    return r;
  }
  function buildDraft(l) {
    return { id: "s" + Date.now(), treino: l, titulo: plan.treinos[l].titulo, inicio: 0, fim: null, exercicios: plan.treinos[l].exercicios.map(function (e) {
      var ser = []; for (var k = 0; k < e.series; k++) ser.push({ kg: null, reps: null, feito: false });
      return { id: e.id, nome: e.nome, grupo: e.grupo, unidade: e.unidade || "reps", corpo: !!e.corpo, series: ser };
    }) };
  }
  function current() { if (active && active.treino === letter) return active; return drafts[letter] || (drafts[letter] = buildDraft(letter)); }
  function nextLetter() { var f = finished(); if (!f.length) return "A"; return LETTERS[(LETTERS.indexOf(f[0].treino) + 1) % 4]; }

  /* ---------- telas ---------- */
  function render(force) {
    var fe = document.activeElement;
    if (!force && fe && main.contains(fe) && /INPUT|SELECT/.test(fe.tagName)) return;
    if (failed) { main.innerHTML = '<p class="empty">' + esc(failed) + "</p>"; return; }
    if ((!planLoaded || !sessLoaded) && view !== "ajustes") return;
    document.querySelectorAll("[data-view]").forEach(function (b) { if (b.dataset.view === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    if (view === "ajustes") { main.innerHTML = ajustesHTML(); return; }
    if (!plan || !plan.treinos || onb.ativo) { main.innerHTML = onbHTML(); return; }
    if (!letter) letter = active ? active.treino : nextLetter();
    main.innerHTML = view === "treino" ? treinoHTML() : view === "evolucao" ? evolucaoHTML() : view === "ajustes" ? ajustesHTML() : historicoHTML();
    if (view === "evolucao") drawChart();
  }

  function treinoHTML() {
    var h = "";
    if (resumo) h += resumoHTML();
    h += '<div class="plates">' + LETTERS.map(function (l) {
      return '<button class="plate-btn ' + l + '" data-act="letter" data-l="' + l + '" aria-pressed="' + (l === letter) + '"><span class="disc">' + l + '</span><span class="plate-label">' + esc(plan.treinos[l].titulo) + "</span></button>";
    }).join("") + "</div>";
    if (finished().length < 8) h += '<div class="note">Retorno aos treinos: nas 2 primeiras semanas, termine cada série com 2 a 3 repetições sobrando.</div>';
    var ro = active && active.treino !== letter;
    if (ro) h += '<div class="note">Treino ' + active.treino + ' em andamento.<button data-act="letter" data-l="' + active.treino + '">Voltar para ele</button></div>';
    var sess = current(), t = plan.treinos[letter], feitas = setCount(sess), total = sess.exercicios.reduce(function (a, e) { return a + e.series.length; }, 0);
    h += '<section class="' + letter + '" style="display:grid;gap:12px"><div class="title-row"><h2>Treino ' + letter + " · " + esc(t.titulo) + '</h2><span class="meta num" style="white-space:nowrap">' + feitas + "/" + total + ' séries</span></div><div class="list">';
    sess.exercicios.forEach(function (ex, i) { h += exHTML(sess, ex, i, ro); });
    h += "</div>";
    if (adding) h += editHTML(null); else h += '<button class="link" style="justify-self:start;padding-left:0" data-act="add-ex">Adicionar exercício</button>';
    if (!ro && active) {
      h += '<div class="actions">';
      if (confirmDiscard) h += '<div class="note">Descartar este treino? As séries marcadas serão apagadas.</div><div class="btn-row"><button class="btn danger" data-act="discard-yes">Descartar</button><button class="btn quiet" data-act="discard-no">Continuar treinando</button></div>';
      else h += '<button class="btn primary" data-act="finish">Concluir treino' + (total > feitas ? " (" + (total - feitas === 1 ? "falta 1 série" : "faltam " + (total - feitas) + " séries") + ")" : "") + '</button><button class="link" style="justify-self:center" data-act="discard">Descartar treino</button>';
      h += "</div>";
    }
    return h + "</section>";
  }

  function exHTML(sess, ex, i, ro) {
    var pe = planEx(letter, ex.id) || { nome: ex.nome, series: ex.series.length, repsMin: 8, repsMax: 12, desc: 90, unidade: ex.unidade, corpo: ex.corpo };
    if (editing === ex.id) return editHTML(pe);
    var last = lastFor(ex.nome), sg = suggestion(pe), un = pe.unidade === "seg" ? "s" : "";
    var h = '<article class="ex"><div class="ex-head"><div><h3>' + esc(ex.nome) + '</h3><div class="meta num">' + pe.series + " × " + pe.repsMin + "–" + pe.repsMax + un + " · descanso " + mmss(pe.desc) + (pe.nota ? " · " + esc(pe.nota) : "") + '</div></div><button class="link" data-act="edit" data-id="' + esc(ex.id) + '">Editar</button></div>';
    if (last) h += '<div class="last num">Última vez (' + curta(last.data) + "): " + last.series.map(function (s) { return setText(s, ex); }).join(", ") + "</div>";
    h += '<div><span class="pill' + (sg.up ? " up" : "") + '">' + esc(sg.txt) + "</span></div>";
    h += '<div class="sets"><div class="set-head"><span></span><span>kg</span><span>' + (pe.unidade === "seg" ? "seg" : "reps") + "</span><span></span></div>";
    ex.series.forEach(function (s, j) {
      var ph = placeholder(sess, i, j, pe), bad = erro && erro.i === i && erro.j === j;
      h += '<div class="set' + (s.feito ? " done" : "") + (bad ? " bad" : "") + '"><span class="set-n num">' + (j + 1) + "</span>" +
        '<input id="k' + i + "_" + j + '" aria-label="Carga da série ' + (j + 1) + ' em kg" inputmode="decimal" autocomplete="off" data-f="kg" data-i="' + i + '" data-j="' + j + '" value="' + fmt(s.kg, 2) + '" placeholder="' + (pe.corpo && ph.kg == null ? "—" : fmt(ph.kg, 2)) + '"' + (ro ? " disabled" : "") + ">" +
        '<input id="r' + i + "_" + j + '" aria-label="Repetições da série ' + (j + 1) + '" inputmode="numeric" autocomplete="off" data-f="reps" data-i="' + i + '" data-j="' + j + '" value="' + fmt(s.reps, 0) + '" placeholder="' + fmt(ph.reps, 0) + '"' + (ro ? " disabled" : "") + ">" +
        '<button class="check" data-act="check" data-i="' + i + '" data-j="' + j + '" aria-label="Marcar série ' + (j + 1) + ' como feita" aria-pressed="' + !!s.feito + '"' + (ro ? " disabled" : "") + ">" + CHECK + "</button></div>";
      if (bad) h += '<div class="err-line">Informe ' + (pe.corpo ? "as repetições" : "a carga e as repetições") + " desta série.</div>";
    });
    h += "</div>";
    if (!ro) h += '<div class="set-tools"><button class="link" data-act="add-set" data-i="' + i + '">Adicionar série</button>' + (ex.series.length > 1 && !ex.series[ex.series.length - 1].feito ? '<button class="link" data-act="rm-set" data-i="' + i + '">Remover série</button>' : "") + "</div>";
    return h + "</article>";
  }

  function editHTML(pe) {
    var v = pe || { nome: "", grupo: plan.treinos[letter].exercicios[0] ? plan.treinos[letter].exercicios[0].grupo : "", series: 3, repsMin: 8, repsMax: 12, desc: 90, inc: 2.5 };
    var h = '<form class="ex" id="edit-form"><div class="field-grid">' +
      '<label class="f wide">Nome<input id="e-nome" value="' + esc(v.nome) + '" required></label>' +
      '<label class="f wide">Grupo muscular<input id="e-grupo" value="' + esc(v.grupo) + '"></label>' +
      '<label class="f">Séries<input id="e-series" inputmode="numeric" value="' + v.series + '"></label>' +
      '<label class="f">Reps mín.<input id="e-min" inputmode="numeric" value="' + v.repsMin + '"></label>' +
      '<label class="f">Reps máx.<input id="e-max" inputmode="numeric" value="' + v.repsMax + '"></label>' +
      '<label class="f">Descanso (s)<input id="e-desc" inputmode="numeric" value="' + v.desc + '"></label>' +
      '<label class="f wide">Salto de carga (kg)<input id="e-inc" inputmode="decimal" value="' + fmt(v.inc || 2.5, 2) + '"></label></div>';
    if (pe) h += '<div class="meta">Trocar o nome começa uma nova curva de evolução para esse exercício.</div>';
    h += '<div class="btn-row"><button class="btn primary" type="submit">Salvar</button><button class="btn quiet" type="button" data-act="edit-cancel">Cancelar</button></div>';
    if (pe) h += '<button class="link" type="button" style="justify-self:start;padding-left:0" data-act="edit-remove" data-id="' + esc(pe.id) + '">Remover da ficha</button>';
    return h + "</form>";
  }

  function resumoHTML() {
    var r = resumo, d = r.delta == null ? "" : (r.delta >= 0 ? "+" : "−") + fmt(Math.abs(r.delta), 0) + "%";
    var h = '<div class="panel"><div class="title-row"><h2>Treino ' + r.treino + ' concluído</h2><button class="link" data-act="close-resumo">Fechar</button></div><div class="stats">' +
      '<div class="stat"><b>' + r.min + ' min</b><span>duração</span></div><div class="stat"><b>' + r.series + '</b><span>' + (r.series === 1 ? "série feita" : "séries feitas") + '</span></div>' +
      '<div class="stat"><b>' + fmt(r.vol, 0) + ' kg</b><span>carga total (kg × reps)</span></div><div class="stat"><b>' + (d || "—") + '</b><span>' + (d ? "contra o último " + r.treino : "primeiro treino " + r.treino) + "</span></div></div>";
    if (r.prs.length) h += '<div class="note"><b>Novos recordes:</b> ' + r.prs.map(esc).join("; ") + "</div>";
    return h + "</div>";
  }

  function allGroups(list) { var o = {}; list.forEach(function (s) { s.exercicios.forEach(function (ex) { var n = done(ex).length; if (n && ex.grupo) o[ex.grupo] = (o[ex.grupo] || 0) + n; }); }); return o; }
  function evolucaoHTML() {
    var f = finished(), now = Date.now(), D7 = 7 * 864e5;
    var a = f.filter(function (s) { return now - s.inicio < D7; }), b = f.filter(function (s) { return now - s.inicio >= D7 && now - s.inicio < 2 * D7; });
    var va = a.reduce(function (t, s) { return t + volume(s); }, 0), vb = b.reduce(function (t, s) { return t + volume(s); }, 0);
    var sa = a.reduce(function (t, s) { return t + setCount(s); }, 0);
    var h = '<div class="panel"><h2>Últimos 7 dias</h2><div class="stats">' +
      '<div class="stat"><b>' + a.length + '/4</b><span>treinos da semana</span></div><div class="stat"><b>' + f.length + '</b><span>treinos no total</span></div>' +
      '<div class="stat"><b>' + sa + '</b><span>séries feitas</span></div><div class="stat"><b>' + fmt(va, 0) + ' kg</b><span>carga total' + (vb ? " (" + (va >= vb ? "+" : "−") + fmt(Math.abs(va / vb - 1) * 100, 0) + "% sobre os 7 dias anteriores)" : "") + "</span></div></div>";
    var ga = allGroups(a), gb = allGroups(b), keys = Object.keys(Object.assign({}, ga, gb)).sort(function (x, y) { return (ga[y] || 0) - (ga[x] || 0); });
    if (keys.length) h += '<div class="scroll"><table><thead><tr><th>Grupo</th><th>7 dias</th><th>7 dias anteriores</th></tr></thead><tbody>' + keys.map(function (k) { return "<tr><td>" + esc(k) + "</td><td>" + series_(ga[k] || 0) + "</td><td>" + series_(gb[k] || 0) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    h += "</div>";

    var hist = {}; f.forEach(function (s) { s.exercicios.forEach(function (ex) { if (done(ex).length) hist[ex.nome] = true; }); });
    var inPlan = {}, opts = LETTERS.map(function (l) {
      return '<optgroup label="Treino ' + l + '">' + plan.treinos[l].exercicios.map(function (e) { inPlan[e.nome] = true; return "<option" + (e.nome === evoEx ? " selected" : "") + ">" + esc(e.nome) + "</option>"; }).join("") + "</optgroup>";
    }).join("");
    var old = Object.keys(hist).filter(function (n) { return !inPlan[n]; });
    if (old.length) opts += '<optgroup label="Fora da ficha">' + old.map(function (n) { return "<option" + (n === evoEx ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</optgroup>";
    if (!evoEx) { evoEx = Object.keys(hist)[0] || plan.treinos.A.exercicios[0].nome; return evolucaoHTML(); }
    var data = seriesFor(evoEx), semKg = data.semKg;
    if (semKg) evoMetric = "melhor"; else if (evoMetric === "melhor") evoMetric = "carga";
    h += '<div class="panel"><div class="pick"><label class="f">Exercício<select id="evo-ex" data-act-change="evo-ex">' + opts + "</select></label>";
    if (!semKg) h += '<div class="seg">' + [["carga", "Carga máxima"], ["rm", "1RM estimado"], ["vol", "Volume"]].map(function (m) { return '<button data-act="metric" data-m="' + m[0] + '" aria-pressed="' + (evoMetric === m[0]) + '">' + m[1] + "</button>"; }).join("") + "</div>";
    h += "</div>";
    if (!data.pts.length) h += '<p class="empty">Conclua um treino com este exercício para ver a curva.</p>';
    else {
      h += '<div id="chart"></div><div class="scroll"><table><thead><tr><th>Data</th><th>Melhor</th>' + (semKg ? "" : "<th>1RM est.</th><th>Volume</th>") + "<th>Séries</th></tr></thead><tbody>";
      data.pts.slice(-8).reverse().forEach(function (p) { h += "<tr><td>" + curta(p.t) + "</td><td>" + esc(p.best) + "</td>" + (semKg ? "" : "<td>" + fmt(p.rm, 1) + " kg</td><td>" + fmt(p.vol, 0) + " kg</td>") + "<td>" + p.n + "</td></tr>"; });
      h += "</tbody></table></div>";
      if (!semKg && evoMetric === "rm") h += '<div class="meta">1RM estimado pela fórmula de Epley: carga × (1 + reps ÷ 30).</div>';
    }
    return h + "</div>";
  }
  function seriesFor(nome) {
    var f = finished().slice().reverse(), pts = [], anyKg = false, seg = false;
    f.forEach(function (s) { s.exercicios.forEach(function (ex) {
      if (ex.nome !== nome) return;
      var d = done(ex); if (!d.length) return;
      if (ex.unidade === "seg") seg = true;
      var carga = 0, rm = 0, vol = 0, melhor = 0, bestSet = d[0];
      d.forEach(function (x) { var k = x.kg || 0, r = x.reps || 0; if (k) anyKg = true; if (k > carga || (k === carga && r > (bestSet.reps || 0))) { carga = k; bestSet = x; } rm = Math.max(rm, k * (1 + r / 30)); vol += k * r; melhor = Math.max(melhor, r); });
      pts.push({ t: s.inicio, carga: carga, rm: rm, vol: vol, melhor: melhor, n: d.length, best: setText(bestSet, ex) });
    }); });
    return { pts: pts, semKg: !anyKg && (pts.length > 0 || isBodyweight(nome)), seg: seg };
  }
  function isBodyweight(nome) { return LETTERS.some(function (l) { return plan.treinos[l].exercicios.some(function (e) { return e.nome === nome && e.corpo; }); }); }
  function niceStep(r) { var e = Math.pow(10, Math.floor(Math.log10(r))), f = r / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function drawChart() {
    var box = document.getElementById("chart"); if (!box) return;
    var data = seriesFor(evoEx), pts = data.pts, key = evoMetric, unit = key === "melhor" ? (data.seg ? " s" : " reps") : " kg";
    var w = box.clientWidth, h = 240, L = 46, R = 18, T = 26, B = 28;
    var vals = pts.map(function (p) { return p[key]; }), min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { var pad = Math.max(1, Math.abs(min) * 0.1); min -= pad; max += pad; }
    var step = niceStep((max - min) / 3) || 1, lo = Math.max(0, Math.floor(min / step) * step), hi = Math.ceil(max / step) * step, ticks = [];
    for (var v = lo; v <= hi + step / 2; v += step) ticks.push(v);
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    function X(t) { return pts.length === 1 ? (L + w - R) / 2 : L + (t - t0) / (t1 - t0) * (w - L - R); }
    function Y(val) { return T + (hi - val) / (hi - lo) * (h - T - B); }
    chartPts = pts.map(function (p) { return { x: X(p.t), y: Y(p[key]), p: p }; });
    var line = chartPts.map(function (c, i) { return (i ? "L" : "M") + c.x.toFixed(1) + " " + c.y.toFixed(1); }).join(" ");
    var area = line + " L" + chartPts[chartPts.length - 1].x.toFixed(1) + " " + (h - B) + " L" + chartPts[0].x.toFixed(1) + " " + (h - B) + " Z";
    var s = '<svg width="' + w + '" height="' + h + '" role="img" aria-label="Evolução de ' + esc(evoEx) + '">';
    ticks.forEach(function (tk) { var y = Y(tk); s += '<line x1="' + L + '" x2="' + (w - R) + '" y1="' + y + '" y2="' + y + '" stroke="var(--rule)" stroke-width="1"/><text x="' + (L - 7) + '" y="' + (y + 4) + '" text-anchor="end" font-size="12" fill="var(--muted)">' + fmt(tk, 1) + "</text>"; });
    if (pts.length > 1) { s += '<path d="' + area + '" fill="var(--accent)" fill-opacity=".12"/><path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'; }
    chartPts.forEach(function (c, i) { var e = i === chartPts.length - 1; s += '<circle cx="' + c.x + '" cy="' + c.y + '" r="' + (e ? 5.5 : 4) + '" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>'; });
    var lastC = chartPts[chartPts.length - 1];
    s += '<text x="' + Math.min(lastC.x, w - R) + '" y="' + (lastC.y - 11) + '" text-anchor="' + (pts.length === 1 ? "middle" : "end") + '" font-size="14" font-weight="600" fill="var(--ink)">' + fmt(lastC.p[key], 1) + unit + "</text>";
    s += '<text x="' + (pts.length === 1 ? lastC.x : L) + '" y="' + (h - 8) + '" text-anchor="' + (pts.length === 1 ? "middle" : "start") + '" font-size="12" fill="var(--muted)">' + curta(t0) + "</text>";
    if (pts.length > 1) s += '<text x="' + (w - R) + '" y="' + (h - 8) + '" text-anchor="end" font-size="12" fill="var(--muted)">' + curta(t1) + "</text>";
    s += '<line id="cross" y1="' + T + '" y2="' + (h - B) + '" stroke="var(--muted)" stroke-width="1" visibility="hidden"/></svg><div id="tip" hidden></div>';
    box.innerHTML = s;
    function show(ev) {
      var r = box.getBoundingClientRect(), mx = ev.clientX - r.left, near = chartPts[0];
      chartPts.forEach(function (c) { if (Math.abs(c.x - mx) < Math.abs(near.x - mx)) near = c; });
      var cross = box.querySelector("#cross"), tip = box.querySelector("#tip");
      cross.setAttribute("x1", near.x); cross.setAttribute("x2", near.x); cross.setAttribute("visibility", "visible");
      tip.hidden = false; tip.textContent = curta(near.p.t) + " · " + fmt(near.p[key], 1) + unit;
      tip.style.left = Math.max(0, Math.min(near.x - tip.offsetWidth / 2, w - tip.offsetWidth)) + "px";
    }
    box.onpointermove = show; box.onpointerdown = show;
    box.onpointerleave = function () { var c = box.querySelector("#cross"), t = box.querySelector("#tip"); if (c) c.setAttribute("visibility", "hidden"); if (t) t.hidden = true; };
  }

  function historicoHTML() {
    var f = finished();
    if (!f.length) return '<p class="empty">Seus treinos concluídos aparecem aqui.</p>';
    return '<div class="list">' + f.map(function (s) {
      var dur = s.fim && s.inicio ? Math.round((s.fim - s.inicio) / 6e4) : 0;
      var h = '<details class="h ' + s.treino + '" data-h="' + esc(s.id) + '"' + (openH[s.id] ? " open" : "") + '><summary><span class="badge">' + s.treino + '</span><span><b style="font-weight:600">' + esc(dia(s.inicio)) + " · " + esc(s.titulo) + '</b><br><span class="meta num">' + dur + " min · " + series_(setCount(s)) + " · " + fmt(volume(s), 0) + ' kg</span></span></summary><div class="h-body">';
      s.exercicios.forEach(function (ex) { var d = done(ex); if (d.length) h += '<div class="h-ex num"><b>' + esc(ex.nome) + "</b><br><span>" + d.map(function (x) { return setText(x, ex); }).join(", ") + "</span></div>"; });
      if (confirmDel === s.id) h += '<div class="btn-row"><button class="btn danger" data-act="del-yes" data-id="' + esc(s.id) + '">Excluir treino</button><button class="btn quiet" style="background:var(--surface-2)" data-act="del-no">Manter</button></div>';
      else h += '<button class="link h-del" style="padding-left:0" data-act="del" data-id="' + esc(s.id) + '">Excluir este treino</button>';
      return h + "</div></details>";
    }).join("") + "</div>";
  }

  /* ---------- descanso ---------- */
  var restEl = document.getElementById("rest"), rEnd = 0, rTotal = 0, rTick = null, rHide = null, rWarned = false, rInfo = null;
  function restLabel(fim) {
    var el = document.getElementById("rest-label"), b = document.createElement("b"), sp = document.createElement("span");
    b.textContent = rInfo ? rInfo.feito : "Descanso";
    sp.textContent = fim ? "Agora: " + (rInfo && rInfo.prox ? rInfo.prox : "próxima série") : (rInfo && rInfo.prox ? "Próxima: " + rInfo.prox : "Descanso");
    el.textContent = ""; el.appendChild(b); el.appendChild(sp);
  }
  function startRest(sec, info) { rTotal = sec; rEnd = Date.now() + sec * 1000; rWarned = sec <= 12; rInfo = info || null; clearTimeout(rHide); restEl.hidden = false; restEl.classList.remove("alarm"); restLabel(false); document.getElementById("rest-add").hidden = false; clearInterval(rTick); rTick = setInterval(tickRest, 250); tickRest(); }
  function tickRest() {
    var left = (rEnd - Date.now()) / 1000;
    document.getElementById("rest-time").textContent = mmss(left);
    document.getElementById("rest-bar").style.transform = "scaleX(" + Math.max(0, Math.min(1, left / rTotal)) + ")";
    if (!rWarned && left <= 10 && left > 0) { rWarned = true; tone([0], 660, 0.12, 0.35); }
    if (left <= 0) { clearInterval(rTick); beep(); restEl.classList.add("alarm"); restLabel(true); document.getElementById("rest-add").hidden = true; rHide = setTimeout(stopRest, 12000); }
  }
  function stopRest() { clearInterval(rTick); clearTimeout(rHide); restEl.hidden = true; restEl.classList.remove("alarm"); }
  function primeAudio() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) {} }
  function beep() {
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
    tone([0, 0.3, 0.6, 1.2, 1.5, 1.8], 1050, 0.22, 0.9);
  }
  function tone(delays, freq, dur, vol) {
    try {
      if (!audio) return; if (audio.state === "suspended") audio.resume();
      var comp = audio.createDynamicsCompressor(); comp.connect(audio.destination);
      delays.forEach(function (d) {
        var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + d;
        o.type = "square"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol, t + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(comp); o.start(t); o.stop(t + dur + 0.02);
      });
    } catch (e) {}
  }
  async function requestWake() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", function () { wake = null; }); } } catch (e) {} }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && active) requestWake(); });
  document.getElementById("rest-add").onclick = function () { rEnd += 15000; rTotal += 15; tickRest(); };
  document.getElementById("rest-skip").onclick = stopRest;

  /* ---------- ações ---------- */
  function finish() {
    var sess = active, prevs = finished().filter(function (s) { return s.treino === sess.treino && s.id !== sess.id; });
    stopRest();
    if (!setCount(sess)) { put("sessoes/" + sess.id, null); active = null; return; }
    var prs = [];
    sess.exercicios.forEach(function (ex) {
      var d = done(ex); if (!d.length || ex.unidade === "seg") return;
      var maxNow = Math.max.apply(null, d.map(function (s) { return s.kg || 0; })); if (!maxNow) return;
      var before = 0, seen = false;
      finished().forEach(function (s) { if (s.id === sess.id) return; s.exercicios.forEach(function (e) { if (e.nome === ex.nome) done(e).forEach(function (x) { seen = true; before = Math.max(before, x.kg || 0); }); }); });
      if (seen && maxNow > before) prs.push(ex.nome + " " + fmt(maxNow) + " kg");
    });
    sess.fim = Date.now(); saveActive();
    var vol = volume(sess), pv = prevs[0] ? volume(prevs[0]) : 0;
    resumo = { treino: sess.treino, min: Math.max(1, Math.round((sess.fim - sess.inicio) / 6e4)), series: setCount(sess), vol: vol, delta: pv ? (vol / pv - 1) * 100 : null, prs: prs };
    active = null; drafts = {};
    if (wake) { try { wake.release(); } catch (e) {} wake = null; }
    letter = LETTERS[(LETTERS.indexOf(sess.treino) + 1) % 4];
    window.scrollTo(0, 0);
  }
  function syncPlanToSession(id, removed) {
    delete drafts[letter];
    if (!active || active.treino !== letter) return;
    var ex = active.exercicios.filter(function (e) { return e.id === id; })[0], pe = planEx(letter, id);
    if (removed && ex && !done(ex).length) active.exercicios = active.exercicios.filter(function (e) { return e !== ex; });
    else if (ex && pe) { ex.nome = pe.nome; ex.grupo = pe.grupo; }
    else if (!ex && pe) active.exercicios.push(buildDraft(letter).exercicios.filter(function (e) { return e.id === id; })[0]);
    saveActive();
  }
  document.querySelector(".views").addEventListener("click", function (e) { var b = e.target.closest("[data-view]"); if (!b) return; view = b.dataset.view; editing = null; adding = false; render(true); window.scrollTo(0, 0); });
  main.addEventListener("input", function (e) {
    var t = e.target; if (!t.dataset.f) return;
    var sess = current(), s = sess.exercicios[+t.dataset.i].series[+t.dataset.j];
    s[t.dataset.f] = num(t.value);
    if (sess === active) { clearTimeout(inputTimer); inputTimer = setTimeout(saveActive, 700); }
  });
  main.addEventListener("change", function (e) { if (e.target.id === "evo-ex") { evoEx = e.target.value; render(true); } });
  main.addEventListener("toggle", function (e) { var d = e.target; if (d.dataset && d.dataset.h) openH[d.dataset.h] = d.open; }, true);
  main.addEventListener("submit", function (e) {
    if (e.target.id !== "edit-form") return;
    e.preventDefault();
    var g = function (id) { return document.getElementById(id).value; }, nome = g("e-nome").trim(); if (!nome) return;
    var ints = function (id, d) { var n = Math.round(num(g(id))); return n > 0 ? n : d; };
    var t = plan.treinos[letter], id = editing;
    var data = { nome: nome, grupo: g("e-grupo").trim(), series: ints("e-series", 3), repsMin: ints("e-min", 8), repsMax: ints("e-max", 12), desc: ints("e-desc", 90), inc: num(g("e-inc")) || 2.5 };
    if (data.repsMax < data.repsMin) data.repsMax = data.repsMin;
    if (id) Object.assign(planEx(letter, id), data); else { id = "x" + Date.now(); data.id = id; t.exercicios.push(data); }
    savePlan(); syncPlanToSession(id); editing = null; adding = false; render(true);
  });
  main.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var a = b.dataset.act, i = +b.dataset.i, j = +b.dataset.j, sess, ex;
    if (a === "letter") { letter = b.dataset.l; editing = null; adding = false; erro = null; confirmDiscard = false; }
    else if (a === "check") {
      primeAudio(); sess = current(); ex = sess.exercicios[i]; var s = ex.series[j];
      if (s.feito) { s.feito = false; if (sess === active) saveActive(); }
      else {
        var pe = planEx(letter, ex.id) || { nome: ex.nome, series: ex.series.length, repsMin: 8, repsMax: 12, desc: 90 }, ph = placeholder(sess, i, j, pe);
        if (s.kg == null && ph.kg != null) s.kg = ph.kg;
        if (s.reps == null && ph.reps != null) s.reps = ph.reps;
        if (s.kg == null && pe.corpo) s.kg = 0;
        if (s.reps == null || s.kg == null) { erro = { i: i, j: j }; render(true); return; }
        erro = null; s.feito = true;
        if (!active) { active = sess; active.inicio = Date.now(); delete drafts[letter]; requestWake(); }
        saveActive();
        var un = ex.unidade === "seg" ? " s" : " reps", feitoTxt = ex.nome + " · " + (s.kg ? fmt(s.kg) + " kg × " : "") + fmt(s.reps, 0) + un, prox = null;
        var nj = ex.series.findIndex(function (x) { return !x.feito; });
        if (nj >= 0) prox = "série " + (nj + 1) + " de " + ex.series.length;
        else { var nx = sess.exercicios.filter(function (e2, k) { return k > i && e2.series.some(function (x) { return !x.feito; }); })[0] || sess.exercicios.filter(function (e2) { return e2.series.some(function (x) { return !x.feito; }); })[0]; prox = nx ? nx.nome : "concluir o treino"; }
        startRest(pe.desc || 90, { feito: feitoTxt, prox: prox });
      }
    }
    else if (a === "add-set") { sess = current(); sess.exercicios[i].series.push({ kg: null, reps: null, feito: false }); if (sess === active) saveActive(); }
    else if (a === "rm-set") { sess = current(); sess.exercicios[i].series.pop(); if (sess === active) saveActive(); }
    else if (a === "edit") { editing = b.dataset.id; adding = false; }
    else if (a === "edit-cancel") { editing = null; adding = false; }
    else if (a === "add-ex") { adding = true; editing = null; }
    else if (a === "edit-remove") { var id = b.dataset.id, t = plan.treinos[letter]; t.exercicios = t.exercicios.filter(function (x) { return x.id !== id; }); savePlan(); syncPlanToSession(id, true); editing = null; }
    else if (a === "finish") finish();
    else if (a === "discard") confirmDiscard = true;
    else if (a === "discard-no") confirmDiscard = false;
    else if (a === "discard-yes") { put("sessoes/" + active.id, null); active = null; drafts = {}; confirmDiscard = false; stopRest(); }
    else if (a === "close-resumo") resumo = null;
    else if (a === "metric") evoMetric = b.dataset.m;
    else if (a === "del") confirmDel = b.dataset.id;
    else if (a === "del-no") confirmDel = null;
    else if (a === "del-yes") { put("sessoes/" + b.dataset.id, null); confirmDel = null; }
    render(true);
  });
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(drawChart, 120); });

  /* ---------- ajustes: conta e backup ---------- */
  /* ---------- criar ficha: questionário + IA ---------- */
  var onb = { ativo: false, r: { objetivo: "hipertrofia", nivel: "iniciante", dias: "4", minutos: "60", local: "academia", limitacoes: "", idade: "", sexo: "" }, busy: false, erro: null, previa: null };
  try { var savedR = JSON.parse(localStorage.getItem("ficha_onb") || "null"); if (savedR) Object.assign(onb.r, savedR); } catch (e) {}
  function sel(id, k, opts) { return '<label class="f wide">' + esc(id) + '<select id="onb-' + k + '" data-onb="' + k + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(onb.r[k]) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; }
  function onbHTML() {
    var h = '<div class="panel"><h2>' + (plan && plan.treinos ? "Refazer minha ficha" : "Vamos montar sua ficha") + '</h2><div class="meta">Responda e a IA monta um treino ABCD para você. Os treinos seguem em rodízio: A, B, C, D, A…</div></div>';
    if (onb.previa) {
      h += '<div class="panel"><h2>Sua ficha</h2>';
      LETTERS.forEach(function (l) {
        var t = onb.previa.treinos[l];
        h += '<div class="' + l + '" style="display:grid;gap:4px"><div style="display:flex;gap:10px;align-items:center"><span class="badge">' + l + '</span><b style="font-weight:600">' + esc(t.titulo) + '</b></div>' +
          t.exercicios.map(function (e) { return '<div class="h-ex num">' + esc(e.nome) + ' <span>· ' + e.series + " × " + e.repsMin + "–" + e.repsMax + (e.unidade === "seg" ? "s" : "") + "</span></div>"; }).join("") + "</div>";
      });
      h += '<div class="note">Ficha gerada por IA. Ela não substitui a orientação de um profissional de educação física; ajuste cargas e exercícios ao que você sente.</div>';
      h += '<button class="btn primary" style="--plate:var(--accent);--on-plate:var(--surface)" data-act="onb-usar">Usar esta ficha</button><div class="btn-row"><button class="btn quiet" style="background:var(--surface-2)" data-act="onb-gerar">Gerar outra</button><button class="btn quiet" style="background:var(--surface-2)" data-act="onb-voltar">Mudar respostas</button></div></div>';
      return h;
    }
    h += '<form class="panel" id="onb-form"><div class="field-grid">' +
      sel("Objetivo", "objetivo", OPCOES.objetivo) + sel("Experiência", "nivel", OPCOES.nivel) + sel("Onde treina", "local", OPCOES.local) +
      sel("Dias por semana", "dias", [["2", "2 dias"], ["3", "3 dias"], ["4", "4 dias"], ["5", "5 dias"], ["6", "6 dias"]]) +
      sel("Tempo por treino", "minutos", [["40", "40 min"], ["50", "50 min"], ["60", "1 hora"], ["75", "1h15"], ["90", "1h30"]]) +
      '<label class="f half">Idade (opcional)<input id="onb-idade" data-onb="idade" inputmode="numeric" value="' + esc(onb.r.idade) + '"></label>' +
      sel("Sexo (opcional)", "sexo", [["", "Prefiro não dizer"], ["feminino", "Feminino"], ["masculino", "Masculino"]]).replace('class="f wide"', 'class="f half"') +
      '<label class="f wide">Lesões ou limitações (opcional)<input id="onb-limitacoes" data-onb="limitacoes" placeholder="ex.: dor no joelho direito" value="' + esc(onb.r.limitacoes) + '"></label></div>';
    h += '<button class="btn primary" style="--plate:var(--accent);--on-plate:var(--surface)" type="submit"' + (onb.busy ? " disabled" : "") + ">" + (onb.busy ? "Montando sua ficha… (até 1 min)" : "Gerar minha ficha com IA") + "</button>" ;
    if (onb.erro) h += '<div class="err-line">' + esc(onb.erro) + "</div>";
    if (plan && plan.treinos) h += '<button class="link" type="button" style="justify-self:start;padding-left:0" data-act="onb-cancelar">Cancelar e manter a ficha atual</button>';
    return h + "</form>";
  }
  function onbSaveR() { try { localStorage.setItem("ficha_onb", JSON.stringify(onb.r)); } catch (e) {} }
  async function onbGerar() {
    onb.busy = true; onb.erro = null; render(true);
    try { var res = await STORE.gerarFicha(onb.r); onb.previa = normalizePlan(res); }
    catch (e) { onb.erro = (e && e.message) || "Não consegui gerar a ficha."; }
    onb.busy = false; render(true); window.scrollTo(0, 0);
  }
  main.addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.onb) { onb.r[t.dataset.onb] = t.value; onbSaveR(); }
  }, true);
  main.addEventListener("change", function (e) { var t = e.target; if (t.dataset.onb) { onb.r[t.dataset.onb] = t.value; onbSaveR(); } }, true);
  main.addEventListener("submit", function (e) { if (e.target.id !== "onb-form") return; e.preventDefault(); e.stopImmediatePropagation(); if (!onb.busy) onbGerar(); }, true);
  main.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b || b.dataset.act.indexOf("onb-") !== 0) return;
    e.stopImmediatePropagation();
    var a = b.dataset.act;
    if (a === "onb-abrir") { onb.ativo = true; onb.previa = null; onb.erro = null; view = "treino"; }
    else if (a === "onb-cancelar") { onb.ativo = false; onb.previa = null; onb.erro = null; }
    else if (a === "onb-gerar") { onb.previa = null; onbGerar(); return; }
    else if (a === "onb-voltar") { onb.previa = null; }
    else if (a === "onb-usar") {
      plan = clone(onb.previa); savePlan(); planLoaded = true; drafts = {};
      onb = Object.assign(onb, { ativo: false, previa: null, erro: null }); letter = null; view = "treino";
    }
    render(true); window.scrollTo(0, 0);
  }, true);

  var importMsg = null, importData = null;
  function ajustesHTML() {
    var f = finished();
    var h = '<div class="panel"><h2>Conta</h2><div class="meta">' + esc(STORE.email || "") + '</div>' +
      '<div class="meta">' + (pending.size ? pending.size + " alteração(ões) esperando conexão para sincronizar." : "Tudo sincronizado com a nuvem.") + '</div>' +
      '<button class="btn quiet" style="background:var(--surface-2)" data-act="sync">Sincronizar agora</button></div>';
    h += '<div class="panel"><h2>Backup</h2><div class="meta">' + f.length + ' treinos concluídos. Baixe uma cópia em JSON de vez em quando.</div>' +
      '<button class="btn primary" style="--plate:var(--accent);--on-plate:var(--surface)" data-act="export">Exportar backup</button>' +
      '<label class="f">Importar backup (.json)<input type="file" id="import-file" accept="application/json,.json"></label>';
    if (importData) h += '<div class="note">Importar ' + importData.n + ' treino(s)' + (importData.plano ? " e a ficha" : "") + '? Treinos com o mesmo código serão substituídos.</div><div class="btn-row"><button class="btn danger" data-act="import-yes">Importar</button><button class="btn quiet" style="background:var(--surface-2)" data-act="import-no">Cancelar</button></div>';
    if (importMsg) h += '<div class="note">' + esc(importMsg) + '</div>';
    h += '</div><div class="panel"><h2>Ficha</h2><div class="meta">Monte uma ficha nova respondendo algumas perguntas. Seu histórico de treinos é mantido.</div><button class="btn quiet" style="background:var(--surface-2)" data-act="onb-abrir">Refazer minha ficha</button></div>';
    h += '<div class="panel"><h2>Sair</h2><div class="meta">Seus treinos ficam salvos na nuvem.</div><button class="btn quiet" style="background:var(--surface-2)" data-act="logout">Sair da conta</button></div>';
    return h;
  }
  function exportBackup() {
    var docs = {};
    if (plan) docs["plano/atual"] = plan;
    sessions().forEach(function (s) { docs["sessoes/" + s.id] = s; });
    var blob = new Blob([JSON.stringify({ app: "ficha-abcd", versao: 1, exportado: new Date().toISOString().slice(0, 10), docs: docs }, null, 1)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ficha-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  main.addEventListener("change", function (e) {
    if (e.target.id !== "import-file" || !e.target.files[0]) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var j = JSON.parse(fr.result), docs = j && j.docs, n = 0, ok = {};
        if (!docs || typeof docs !== "object") throw 0;
        Object.keys(docs).forEach(function (k) {
          var v = docs[k];
          if (k === "plano/atual" && v && v.treinos) ok[k] = v;
          else if (/^sessoes\/[A-Za-z0-9_\-.~:@+]{1,200}$/.test(k) && v && Array.isArray(v.exercicios) && v.treino) { ok[k] = v; n++; }
        });
        importData = { docs: ok, n: n, plano: !!ok["plano/atual"] }; importMsg = null;
      } catch (err) { importData = null; importMsg = "Esse arquivo não é um backup da ficha. Escolha o .json exportado pelo app."; }
      render(true);
    };
    fr.readAsText(e.target.files[0]);
  });
  main.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var a = b.dataset.act;
    if (a === "export") exportBackup();
    else if (a === "sync") { STORE.refresh(); pump(); }
    else if (a === "logout") STORE.signOut();
    else if (a === "import-no") { importData = null; render(true); }
    else if (a === "import-yes" && importData) {
      var d = importData.docs;
      Object.keys(d).forEach(function (k) { var v = clone(d[k]); if (k.indexOf("sessoes/") === 0) v.id = k.slice(8); put(k, v); });
      if (d["plano/atual"]) { plan = clone(d["plano/atual"]); planLoaded = true; drafts = {}; }
      importMsg = importData.n + " treino(s) importado(s)" + (importData.plano ? " e a ficha atualizada." : ".");
      importData = null; letter = null; render(true);
    }
  }, true);

  /* ---------- dados ---------- */
  function onSessions(list) {
    remote = list; sessLoaded = true;
    if (active) {
      var rem = list.filter(function (s) { return s.id === active.id; })[0];
      var gone = !rem && !pending.has("sessoes/" + active.id) && Date.now() - (active.atualizado || 0) > 15000;
      if ((rem && rem.fim) || gone) { active = null; drafts = {}; stopRest(); }
    }
    var open = sessions().filter(function (s) { return !s.fim; })[0], changed = false;
    if (!active && open) { active = clone(open); letter = active.treino; changed = true; }
    else if (active && open && open.id === active.id && !pending.has("sessoes/" + active.id) && (open.atualizado || 0) > (active.atualizado || 0)) { active = clone(open); changed = true; }
    if (view !== "treino" || changed || !active) { if (!editing && !adding) render(false); }
  }
  async function start() {
    var q = load("ficha_fila"); if (Array.isArray(q)) pending = new Map(q);
    db = STORE.db;
    var slow = setTimeout(function () { if (!planLoaded || !sessLoaded) setStatus("Não consegui carregar seus dados ainda. Confira a conexão.", true); }, 10000);
    function loaded() { if (planLoaded && sessLoaded) clearTimeout(slow); }
    function bad() { failed = "Não consegui abrir seus dados. Recarregue a página."; render(true); }
    db.doc("plano/atual").onSnapshot(function (snap) {
      if (pending.has("plano/atual")) { planLoaded = true; loaded(); return; }
      plan = snap.exists ? clone(snap.data()) : null; planLoaded = true; loaded();
      if (!editing && !adding && !active) { drafts = {}; render(false); }
    }, bad);
    db.collection("sessoes").orderBy("inicio", "desc").limit(1000).onSnapshot(function (snap) {
      onSessions(snap.docs.map(function (d) { var o = clone(d.data()); o.id = d.id; return o; })); loaded();
    }, bad);
    pump();
  }
  start();
}
