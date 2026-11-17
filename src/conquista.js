// Tela de conquista ao concluir o treino: troféu, confete e o peso do dia comparado a animais, motos e carros.

// Pesos aproximados (kg). Fontes: National Geographic Brasil (capivara), Petz (elefante-africano),
// Carzin (Honda Biz 125), Ficha Completa (VW Gol, Chevrolet Onix). Cavalo, vaca e CG 160: médias usuais.
const ITENS = {
  animal: [
    { nome: "capivara", plural: "capivaras", kg: 55, emoji: "🦫" },
    { nome: "cavalo", plural: "cavalos", kg: 500, emoji: "🐎" },
    { nome: "vaca", plural: "vacas", kg: 600, emoji: "🐄" },
    { nome: "elefante-africano", plural: "elefantes-africanos", kg: 6000, emoji: "🐘" },
  ],
  moto: [
    { nome: "Honda Biz", plural: "Honda Biz", kg: 98, emoji: "🛵" },
    { nome: "Honda CG 160", plural: "Honda CG 160", kg: 120, emoji: "🏍️" },
  ],
  carro: [
    { nome: "VW Gol", plural: "VW Gol", kg: 901, emoji: "🚗" },
    { nome: "Chevrolet Onix", plural: "Chevrolet Onix", kg: 1019, emoji: "🚙" },
  ],
};

const APP_URL = "https://paulogsiqueira.github.io/ficha-abcd/";

function fmtN(n, casas) { return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: casas == null ? 0 : casas }); }
function qtd(n) { return n >= 10 ? fmtN(Math.round(n)) : fmtN(Math.round(n * 10) / 10, 1); }

// Em cada categoria, o item que dá o número mais "gostoso" de ler (perto de 5).
export function equivalencias(kg) {
  if (!(kg > 0)) return [];
  return Object.keys(ITENS).map((cat) => {
    let best = null, bestD = Infinity;
    ITENS[cat].forEach((it) => {
      const n = kg / it.kg, d = Math.abs(Math.log(n / 5));
      if (n >= 0.5 && d < bestD) { best = it; bestD = d; }
    });
    if (!best) return null;
    const n = kg / best.kg;
    return { ...best, n, texto: qtd(n) + " " + (n >= 1.5 ? best.plural : best.nome) };
  }).filter(Boolean);
}

function mensagem(r, eqs) {
  const linhas = [
    `🏆 Treino ${r.treino} – ${r.titulo} concluído!`,
    r.vol > 0 ? `💪 Levantei ${fmtN(r.vol)} kg hoje (${r.series} séries em ${r.min} min).` : `💪 ${r.series} séries em ${r.min} min.`,
  ];
  if (eqs.length) { linhas.push("Isso equivale a:"); eqs.forEach((e) => linhas.push(`${e.emoji} ${e.texto}`)); }
  if (r.prs && r.prs.length) linhas.push(`📈 Recorde: ${r.prs.join("; ")}`);
  linhas.push("", `Monte sua ficha grátis: ${APP_URL}`);
  return linhas.join("\n");
}

const TROFEU = `<svg class="cq-trofeu" viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <linearGradient id="cqOuro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset=".55" stop-color="#f2b81b"/><stop offset="1" stop-color="#c98a06"/></linearGradient>
    <linearGradient id="cqBrilho" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="cqTaca"><path d="M32 16h56v18c0 20-12 34-28 34S32 54 32 34z"/></clipPath>
  </defs>
  <path d="M32 24H18c0 16 8 26 20 28M88 24h14c0 16-8 26-20 28" fill="none" stroke="url(#cqOuro)" stroke-width="7" stroke-linecap="round"/>
  <path d="M32 16h56v18c0 20-12 34-28 34S32 54 32 34z" fill="url(#cqOuro)"/>
  <rect class="cq-brilho" x="-30" y="10" width="24" height="70" fill="url(#cqBrilho)" transform="skewX(-20)" clip-path="url(#cqTaca)"/>
  <path d="M60 28l4.1 8.3 9.2 1.3-6.6 6.5 1.6 9.1-8.3-4.3-8.3 4.3 1.6-9.1-6.6-6.5 9.2-1.3z" fill="#fff8d6"/>
  <rect x="53" y="67" width="14" height="14" fill="url(#cqOuro)"/>
  <rect x="40" y="81" width="40" height="9" rx="2" fill="url(#cqOuro)"/>
  <rect x="34" y="90" width="52" height="14" rx="3" fill="#3b2a12"/>
  <rect x="44" y="94" width="32" height="6" rx="1" fill="#f2b81b"/>
</svg>`;

function confete(canvas, cores) {
  const ctx = canvas.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (canvas.width = canvas.clientWidth * dpr), H = (canvas.height = canvas.clientHeight * dpr);
  const ps = Array.from({ length: 140 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.2, y: H * 0.35,
    vx: (Math.random() - 0.5) * 16 * dpr, vy: (-6 - Math.random() * 12) * dpr,
    r: (3 + Math.random() * 4) * dpr, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: cores[(Math.random() * cores.length) | 0], forma: Math.random() < 0.5,
  }));
  const t0 = performance.now();
  (function frame(t) {
    const dt = Math.min(2, (t - (frame.last || t)) / 16.7); frame.last = t;
    ctx.clearRect(0, 0, W, H);
    ps.forEach((p) => {
      p.vy += 0.35 * dpr * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      if (p.forma) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.7, 0, 7); ctx.fill(); }
      ctx.restore();
    });
    if (t - t0 < 3200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(t0);
}

function contar(el, alvo, ms) {
  const t0 = performance.now();
  (function f(t) {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtN(alvo * e);
    if (k < 1) requestAnimationFrame(f);
  })(t0);
}

export function showConquista(r) {
  const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const eqs = equivalencias(r.vol);
  const msg = mensagem(r, eqs);
  const wrap = document.createElement("div");
  wrap.className = "cq " + r.treino;
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-labelledby", "cq-titulo");
  wrap.innerHTML = `
    <canvas class="cq-confete" aria-hidden="true"></canvas>
    <div class="cq-card">
      <div class="cq-topo">${TROFEU}<div class="cq-selo">Treino concluído</div></div>
      <h2 id="cq-titulo">Treino ${r.treino} · ${esc(r.titulo)}</h2>
      <div class="cq-total"><b class="cq-kg">${r.vol > 0 ? "0" : fmtN(r.series)}</b><span>${r.vol > 0 ? "kg levantados hoje" : "séries concluídas"}</span></div>
      <div class="cq-sub">${r.series} séries · ${r.min} min${r.delta != null ? ` · ${r.delta >= 0 ? "+" : "−"}${fmtN(Math.abs(r.delta))}% contra o último ${r.treino}` : ""}</div>
      ${eqs.length ? `<div class="cq-eq-titulo">Hoje você levantou o equivalente a</div><ul class="cq-eq">${eqs.map((e, i) => `<li style="--i:${i}"><span class="cq-ico" aria-hidden="true">${e.emoji}</span><b>${esc(qtd(e.n))}</b> ${esc(e.n >= 1.5 ? e.plural : e.nome)}</li>`).join("")}</ul>` : ""}
      ${r.prs && r.prs.length ? `<div class="cq-pr">Novo recorde: ${esc(r.prs.join("; "))}</div>` : ""}
      <a class="cq-zap" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Compartilhar no WhatsApp</a>
      <button type="button" class="cq-fechar">Fechar</button>
      <div class="cq-nota">Pesos aproximados: capivara 55 kg, cavalo 500 kg, vaca 600 kg, elefante 6 t, Biz 98 kg, CG 160 120 kg, Gol 901 kg, Onix 1.019 kg.</div>
    </div>`;
  document.body.appendChild(wrap);
  const fechar = () => { wrap.classList.add("sai"); setTimeout(() => wrap.remove(), reduz ? 0 : 220); document.removeEventListener("keydown", tecla); };
  const tecla = (e) => { if (e.key === "Escape") fechar(); };
  document.addEventListener("keydown", tecla);
  wrap.querySelector(".cq-fechar").onclick = fechar;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) fechar(); });
  wrap.querySelector(".cq-fechar").focus({ preventScroll: true });
  const kgEl = wrap.querySelector(".cq-kg");
  if (r.vol > 0) { if (reduz) kgEl.textContent = fmtN(r.vol); else contar(kgEl, r.vol, 1400); }
  if (!reduz) {
    const css = getComputedStyle(document.documentElement);
    const cores = ["--red", "--blue", "--yellow", "--green"].map((v) => css.getPropertyValue(v).trim() || "#f2b81b");
    requestAnimationFrame(() => confete(wrap.querySelector(".cq-confete"), cores));
  }
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
