// src/api.js
// GET では余計なヘッダを付けずプリフライトを避ける。POST系は Content-Type を付与。
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

const getToken = () => localStorage.getItem("token");
const auth = () => (getToken() ? { Authorization: `Bearer ${getToken()}` } : {});

async function req(path, init = {}) {
  const isGet = !init.method || init.method.toUpperCase() === "GET";
  const headers = {
    ...(isGet ? {} : { "Content-Type": "application/json" }),
    ...auth(),
    ...(init.headers || {}),
  };
  const r = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await r.text();
  const json = text ? JSON.parse(text) : {};
  if (!r.ok) return { error: json.error || r.statusText, status: r.status };
  return json;
}

export const api = {
  // 認証まわり
  register(name, pin) {
    return req("/api/register", {
      method: "POST",
      body: JSON.stringify({ name, pin }),
    });
  },
  login(name, pin) {
    return req("/api/login", {
      method: "POST",
      body: JSON.stringify({ name, pin }),
    });
  },

  // 自分情報・履歴
  status() {
    return req("/api/status");
  },
  myCoins(days = 30) {
    return req(`/api/coins?days=${days}`);
  },
  postCoins(coins) {
    return req("/api/coins", {
      method: "POST",
      body: JSON.stringify({ coins }),
    });
  },

  // ランキング（数値）
  board(opts = {}) {
    const p = new URLSearchParams();
    if (opts.date) p.set("date", opts.date);
    if (opts.mode) p.set("mode", String(opts.mode));
    if (opts.periodDays) p.set("periodDays", String(opts.periodDays));
    const qs = p.toString();
    return req(`/api/board${qs ? `?${qs}` : ""}`);
  },

  // ランキング（グラフ）
  boardSeries({ mode = "daily", periodDays = 7, days = 14, top = 5, date } = {}) {
    const p = new URLSearchParams();
    p.set("mode", mode);
    p.set("periodDays", String(periodDays));
    p.set("days", String(days));
    p.set("top", String(top));
    if (date) p.set("date", date);
    return req(`/api/board_series?${p.toString()}`);
  },

  // 通知機能
  getVapidPublicKey() {
    return req("/api/notifications/vapid-public-key");
  },
  subscribeNotifications(subscription) {
    return req("/api/notifications/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
    });
  },
  unsubscribeNotifications(endpoint) {
    return req("/api/notifications/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    });
  },
  getNotificationSettings() {
    return req("/api/notifications/settings");
  },
  updateNotificationSettings(settings) {
    return req("/api/notifications/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    });
  },
  testNotification() {
    return req("/api/notifications/test", {
      method: "POST",
    });
  },
};
