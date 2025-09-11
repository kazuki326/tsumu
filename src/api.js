// src/api.js — 共通APIラッパ（TZ送信・エラーハンドリング込み）

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
  status:        ()           => req("/api/status"),
  register:      (name, pin)  => req("/api/register", { method: "POST", body: JSON.stringify({ name, pin }) }),
  login:         (name, pin)  => req("/api/login",    { method: "POST", body: JSON.stringify({ name, pin }) }),
  postCoins:     (coins)      => req("/api/coins",    { method: "POST", body: JSON.stringify({ coins }) }),
  myCoins:       (days = 30)  => req(`/api/coins?days=${days}`),
  board:         (date)       => req(`/api/board${date ? `?date=${date}` : ""}`),
};
