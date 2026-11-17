// Camada de dados: mesma interface que a ficha usava no Claude (doc/collection/onSnapshot),
// gravando na tabela `docs` do Supabase e mantendo uma cópia local para funcionar offline.

function load(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento cheio ou bloqueado */ } }

function storeError(res) {
  const status = res && res.status;
  const code = status === 400 || status === 413 || status === 422 ? "invalid_argument" : "unavailable";
  return { code, message: (res && res.error && res.error.message) || "falha de rede" };
}

export function makeStore(sb, userId) {
  const CACHE = "ficha_cache_" + userId;
  const LOADED = "ficha_loaded_" + userId;
  let cache = load(CACHE) || {};
  let loaded = !!load(LOADED);
  const docSubs = new Map();   // path -> Set(fn)
  const colSubs = new Map();   // collection -> Set(fn)

  const freeze = (o) => o;
  function docSnap(path) {
    const body = cache[path];
    return { id: path.split("/").pop(), exists: body != null, data: () => freeze(body), metadata: { fromCache: !navigator.onLine, hasPendingWrites: false } };
  }
  function colSnap(col) {
    const docs = Object.keys(cache).filter((k) => k.startsWith(col + "/") && k.split("/").length === 2).map(docSnap);
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: !navigator.onLine, hasPendingWrites: false } };
  }
  function emit() {
    if (!loaded) return;
    docSubs.forEach((fns, path) => fns.forEach((fn) => fn(docSnap(path))));
    colSubs.forEach((fns, col) => fns.forEach((fn) => fn(colSnap(col))));
  }
  function persist() { save(CACHE, cache); }

  let refreshing = null;
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const res = await sb.from("docs").select("path,data");
      if (res.error) throw storeError(res);
      const next = {};
      res.data.forEach((r) => { next[r.path] = r.data; });
      cache = next; loaded = true; save(LOADED, true); persist(); emit();
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  function softRefresh() { refresh().catch(() => {}); }

  function subscribe(map, key, fn, snap) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(fn);
    if (loaded) setTimeout(() => fn(snap()), 0);
    return () => map.get(key).delete(fn);
  }

  const db = {
    doc(path) {
      return {
        async set(body) {
          const res = await sb.from("docs").upsert({ user_id: userId, path, data: body, updated_at: new Date().toISOString() }, { onConflict: "user_id,path" });
          if (res.error) throw storeError(res);
          cache[path] = body; persist(); emit();
        },
        async delete() {
          const res = await sb.from("docs").delete().eq("path", path);
          if (res.error) throw storeError(res);
          delete cache[path]; persist(); emit();
        },
        onSnapshot(next) { return subscribe(docSubs, path, next, () => docSnap(path)); },
      };
    },
    collection(col) {
      const q = {
        orderBy: () => q,
        limit: () => q,
        onSnapshot(next) { return subscribe(colSubs, col, next, () => colSnap(col)); },
      };
      return q;
    },
  };

  softRefresh();
  setInterval(() => { if (!document.hidden) softRefresh(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) softRefresh(); });
  window.addEventListener("online", softRefresh);

  return {
    db,
    refresh: softRefresh,
    clear() { try { localStorage.removeItem(CACHE); localStorage.removeItem(LOADED); localStorage.removeItem("ficha_fila"); } catch { /* ignore */ } },
  };
}
