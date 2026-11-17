// Questionário -> prompt -> ficha ABCD. A mesma lógica roda na função `gerar-ficha` do Supabase.

export const OPCOES = {
  objetivo: [["hipertrofia", "Ganhar massa muscular"], ["emagrecimento", "Perder gordura e definir"], ["forca", "Ganhar força"], ["saude", "Saúde e condicionamento"]],
  nivel: [["iniciante", "Iniciante (menos de 6 meses)"], ["intermediario", "Intermediário (6 meses a 2 anos)"], ["avancado", "Avançado (mais de 2 anos)"]],
  local: [["academia", "Academia completa"], ["basica", "Academia pequena / condomínio"], ["casa", "Em casa, com halteres"]],
};

export function buildPrompt(r) {
  const pick = (k) => (OPCOES[k].find((o) => o[0] === r[k]) || OPCOES[k][0])[1];
  const dias = Math.min(6, Math.max(2, parseInt(r.dias, 10) || 4));
  const min = Math.min(120, Math.max(30, parseInt(r.minutos, 10) || 60));
  const lim = String(r.limitacoes || "").slice(0, 400).trim() || "nenhuma";
  const extra = [r.idade ? "Idade: " + String(r.idade).slice(0, 3) + " anos." : "", r.sexo ? "Sexo: " + String(r.sexo).slice(0, 20) + "." : ""].filter(Boolean).join(" ");
  return `Você é um profissional de educação física. Monte uma ficha de musculação com 4 treinos (A, B, C, D) que o aluno faz em rodízio: A, B, C, D, A, B…

Aluno:
- Objetivo: ${pick("objetivo")}
- Nível: ${pick("nivel")}
- Treina ${dias} dias por semana, cerca de ${min} minutos por treino
- Local: ${pick("local")}
- Limitações ou lesões: ${lim}
${extra ? "- " + extra + "\n" : ""}
Regras:
- Exatamente 4 treinos: A, B, C e D. Com 2 ou 3 dias por semana, use treinos de corpo inteiro ou superior/inferior alternados; com 4 ou mais, divida por grupos musculares.
- Entre 4 e 7 exercícios por treino, cabendo em ${min} minutos com o descanso.
- Use só equipamentos do local informado e nomes de exercícios comuns em academias brasileiras.
- Respeite as limitações: evite ou substitua exercícios que forcem a região afetada.
- Iniciante: mais máquinas, 2 a 3 séries. Intermediário/avançado: 3 a 4 séries nos compostos.
- "grupo" é o músculo principal em português (Peito, Costas, Ombros, Bíceps, Tríceps, Quadríceps, Posterior, Glúteos, Panturrilha, Abdômen, Trapézio).
- "desc" é o descanso em segundos (60 a 180). "inc" é o salto de carga em kg (halteres 2, barra 2.5, máquinas 5).
- "corpo": true quando o exercício usa só o peso do corpo. Para isométricos (prancha), use "unidade": "seg" e repsMin/repsMax em segundos.
- "titulo" curto, ex.: "Peito e tríceps", "Corpo inteiro 1".

Responda SOMENTE com JSON válido, sem texto antes ou depois, neste formato:
{"treinos":{"A":{"titulo":"...","exercicios":[{"nome":"...","grupo":"...","series":3,"repsMin":8,"repsMax":12,"desc":90,"inc":2,"corpo":false,"unidade":"reps"}]},"B":{...},"C":{...},"D":{...}}}`;
}

export function extractJson(text) {
  const s = String(text || "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("A resposta não tem JSON.");
  return JSON.parse(s.slice(a, b + 1));
}

const num = (v, lo, hi, d) => { const n = Number(String(v).replace(",", ".")); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const txt = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

export function normalizePlan(obj) {
  const t = obj && (obj.treinos || obj);
  if (!t || typeof t !== "object") throw new Error("Formato inválido.");
  const out = { treinos: {}, origem: "ia", criado: Date.now() };
  ["A", "B", "C", "D"].forEach((L) => {
    const tr = t[L] || t[L.toLowerCase()];
    if (!tr || !Array.isArray(tr.exercicios) || !tr.exercicios.length) throw new Error("Faltou o treino " + L + ".");
    const ex = tr.exercicios.slice(0, 9).map((e, i) => {
      const seg = e.unidade === "seg";
      const mn = Math.round(num(e.repsMin, 1, seg ? 300 : 50, seg ? 30 : 8));
      const mx = Math.round(num(e.repsMax, mn, seg ? 300 : 60, Math.max(mn, seg ? 45 : 12)));
      const o = { id: L.toLowerCase() + (i + 1), nome: txt(e.nome, 60) || "Exercício " + (i + 1), grupo: txt(e.grupo, 30), series: Math.round(num(e.series, 1, 6, 3)), repsMin: mn, repsMax: mx, desc: Math.round(num(e.desc, 30, 300, 90)), inc: num(e.inc, 0.5, 20, 2.5) };
      if (e.corpo === true) o.corpo = true;
      if (seg) o.unidade = "seg";
      return o;
    });
    out.treinos[L] = { titulo: txt(tr.titulo, 40) || "Treino " + L, exercicios: ex };
  });
  return out;
}
