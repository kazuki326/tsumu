// src/api.js — /api/board をブラウザにキャッシュ（stale fallback）

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
const CACHE_NAME = "tsumu-board-v1";

const getToken = () => localStorage.getItem("token");
const authHeader = () => (getToken() ? { Authorization: `Bearer ${getToken()}` } : {});

async function req(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Timezone": tz,
      ...(init.headers || {}),
      ...authHeader(),
    },
  });
  const text = await r.text();
  const json = text ? JSON.parse(text) : {};
  if (!r.ok) return { error: json.error || r.statusText, status: r.status };
  return json;
}

async function fetchWithTimeout(url, init, ms = 4000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export const api = {
  status:       ()            => req("/api/status"),
  register:     (name, pin)   => req("/api/register", { method: "POST", body: JSON.stringify({ name, pin }) }),
  login:        (name, pin)   => req("/api/login",    { method: "POST", body: JSON.stringify({ name, pin }) }),
  postCoins:    (coins)       => req("/api/coins",    { method: "POST", body: JSON.stringify({ coins }) }),
  myCoins:      (days=30)     => req(`/api/coins?days=${days}`),

  // ★ ランキングは“キャッシュ優先”：ネット(4s)→成功なら保存／失敗はキャッシュ
  board: async (opts = {}) => {
    const params = new URLSearchParams();
    if (typeof opts === "string") {
      params.set("date", opts);
    } else {
      if (opts.date) params.set("date", opts.date);
      if (opts.mode) params.set("mode", opts.mode);
      if (opts.periodDays) params.set("periodDays", String(opts.periodDays));
    }
    const q = params.toString();
    const url = `${BASE}/api/board${q ? `?${q}` : ""}`;

    // 1) ネット（4秒だけ待つ）
    try {
      const res = await fetchWithTimeout(url, { headers: { "X-Timezone": tz } }, 4000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.clone().json();

      // 2) 成功したらキャッシュ更新（対応ブラウザのみ）
      if ("caches" in window) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(
            url,
            new Response(JSON.stringify(json), { headers: { "Content-Type": "application/json" } })
          );
        } catch {}
      }
      return { ...json, _fromCache: false };
    } catch {
      // 3) ネットがダメ → キャッシュ返す
      if ("caches" in window) {
        try {
          const cache = await caches.open(CACHE_NAME);
          const hit = await cache.match(url);
          if (hit) {
            const json = await hit.json();
            return { ...json, _fromCache: true };
          }
        } catch {}
      }
      // 4) キャッシュも無ければ空リスト
      return { board: [], date_ymd: typeof opts === "string" ? opts : (opts?.date || ""), _fromCache: true, error: "offline" };
    }
  }
};
