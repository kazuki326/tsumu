// src/api.js
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
const getToken = () => localStorage.getItem("token");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });

async function req(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, opts);
  // CORS/ネットワークで落ちた場合にも備える
  if (!r.ok) {
    let msg = "";
    try { msg = (await r.json()).error || ""; } catch {}
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return r.json();
}

export const api = {
  async status() { return req("/api/status"); },

  async register(name, pin) {
    return req("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin })
    });
  },

  async login(name, pin) {
    return req("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin })
    });
  },

  async postCoins(coins) {
    return req("/api/coins", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ coins })
    });
  },

  async patchCoins(date_ymd, coins) {
    return req(`/api/coins/${date_ymd}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ coins })
    });
  },

  async myCoins(days = 30) {
    return req(`/api/coins?days=${days}`, {
      headers: { ...authHeader() }
    });
  },

  async myLatest(limit = 7) {
    return req(`/api/my_latest?limit=${limit}`, {
      headers: { ...authHeader() }
    });
  },

  async board(params = {}) {
    const q = new URLSearchParams(params).toString();
    return req(`/api/board${q ? `?${q}` : ""}`);
  },

  async boardSeries(params = {}) {
    const q = new URLSearchParams(params).toString();
    return req(`/api/board_series${q ? `?${q}` : ""}`);
  },

  // 通知機能
  getVapidPublicKey() {
    return req("/api/notifications/vapid-public-key");
  },
  subscribeNotifications(subscription) {
    return req("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(subscription),
    });
  },
  unsubscribeNotifications(endpoint) {
    return req("/api/notifications/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ endpoint }),
    });
  },
  getNotificationSettings() {
    return req("/api/notifications/settings", {
      headers: { ...authHeader() }
    });
  },
  updateNotificationSettings(settings) {
    return req("/api/notifications/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(settings),
    });
  },
  testNotification() {
    return req("/api/notifications/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
    });
  }
};
