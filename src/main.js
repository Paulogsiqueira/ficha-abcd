import "./style.css";
import { createClient } from "@supabase/supabase-js";
import { makeStore } from "./store.js";
import { boot } from "./app.js";

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const USER_KEY = "ficha_usuario";

const authEl = document.getElementById("auth");
const appEl = document.getElementById("app");
const msg = document.getElementById("auth-msg");

function say(text, err) { msg.textContent = text; msg.className = "msg" + (err ? " err" : ""); }
function remember(u) { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch { /* ignore */ } }
function remembered() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }

let started = false;
function startApp(sb, user) {
  if (started) return;
  started = true;
  remember({ id: user.id, email: user.email });
  const store = makeStore(sb, user.id);
  authEl.hidden = true;
  appEl.hidden = false;
  boot({
    db: store.db,
    email: user.email,
    refresh: store.refresh,
    async signOut() {
      store.clear();
      try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
      try { await sb.auth.signOut(); } catch { /* offline: a sessão local já foi descartada */ }
      location.reload();
    },
  });
}

function showLogin(sb) {
  authEl.hidden = false;
  let creating = false;
  const go = document.getElementById("auth-go");
  document.getElementById("auth-toggle").onclick = () => {
    creating = !creating;
    go.textContent = creating ? "Criar conta" : "Entrar";
    document.getElementById("auth-toggle").textContent = creating ? "Já tenho conta" : "Criar conta";
    document.getElementById("auth-pass").autocomplete = creating ? "new-password" : "current-password";
    say("");
  };
  document.getElementById("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-pass").value;
    go.disabled = true;
    say(creating ? "Criando conta…" : "Entrando…");
    try {
      if (creating) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (data.session) startApp(sb, data.user);
        else say("Conta criada. Abra o e-mail de confirmação, toque no link e depois entre aqui com a mesma senha.");
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        startApp(sb, data.user);
      }
    } catch (err) {
      const m = String((err && err.message) || "");
      if (/invalid login/i.test(m)) say("E-mail ou senha incorretos.", true);
      else if (/not confirmed/i.test(m)) say("Confirme o e-mail antes de entrar: procure a mensagem do Supabase na sua caixa de entrada.", true);
      else if (/already registered/i.test(m)) say("Esse e-mail já tem conta. Toque em “Já tenho conta” para entrar.", true);
      else if (!navigator.onLine || /fetch/i.test(m)) say("Sem internet. Conecte-se para entrar pela primeira vez.", true);
      else say("Não consegui " + (creating ? "criar a conta" : "entrar") + ": " + m, true);
    } finally {
      go.disabled = false;
    }
  };
}

async function main() {
  if (!URL_ || !KEY) {
    authEl.hidden = false;
    say("O app foi publicado sem as chaves do Supabase. Cadastre VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis do repositório e rode o deploy de novo.", true);
    document.getElementById("auth-form").hidden = true;
    return;
  }
  const sb = createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  let user = null;
  try {
    const { data } = await sb.auth.getSession();
    user = data.session && data.session.user;
  } catch { /* offline */ }
  // Na academia sem internet: abre com os dados guardados no aparelho; a sessão é renovada quando a conexão voltar.
  if (!user) {
    const r = remembered();
    let hasToken = false;
    try { hasToken = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)); } catch { /* ignore */ }
    if (r && (hasToken || !navigator.onLine)) user = r;
  }
  if (user) startApp(sb, user);
  else showLogin(sb);
  sb.auth.onAuthStateChange((_ev, session) => { if (session && !started) startApp(sb, session.user); });
}

main();
