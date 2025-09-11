// src/api.js — X-Timezone ヘッダ付き / ランキング拡張対応

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";

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

export const api = {
  status:       ()            => req("/api/status"),
  register:     (name, pin)   => req("/api/register", { method: "POST", body: JSON.stringify({ name, pin }) }),
  login:        (name, pin)   => req("/api/login",    { method: "POST", body: JSON.stringify({ name, pin }) }),
  postCoins:    (coins)       => req("/api/coins",    { method: "POST", body: JSON.stringify({ coins }) }),
  myCoins:      (days = 30)   => req(`/api/coins?days=${days}`),
  board:        (opts = {})   => {
    if (typeof opts === "string") return req(`/api/board?date=${opts}`);
    const params = new URLSearchParams();
    if (opts.date) params.set("date", opts.date);
    if (opts.mode) params.set("mode", opts.mode);
    if (opts.periodDays) params.set("periodDays", String(opts.periodDays));
    const q = params.toString();
    return req(`/api/board${q ? `?${q}` : ""}`);
  },
};
