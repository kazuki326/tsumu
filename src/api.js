// src/api.js — 本番はAPI、ローカル(127.0.0.1/localhost)はモックデータを使用
// モック：ユーザA/B/Cの3日分データでランキング＆折れ線グラフが動きます

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
const CACHE_NAME = "tsumu-board-v1";

// ローカル判定（localhost/127.0.0.1 のときにモックを使う）
const IS_LOCAL = typeof window !== "undefined" &&
  (location.hostname === "localhost" || location.hostname === "127.0.0.1");

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

/* ===================== モックデータ（ローカルのみ） ===================== */
function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function makeMock() {
  const d0 = ymd(addDays(new Date(), -2));
  const d1 = ymd(addDays(new Date(), -1));
  const d2 = ymd(new Date());

  // 合計コイン（その日までの最新値）を記録
  const users = [
    { name: "A", logs: { [d0]: 1000, [d1]: 2300, [d2]: 3100 } },
    { name: "B", logs: { [d0]:  800, [d1]:  800, [d2]: 1500 } },
    { name: "C", logs: { [d0]:  400, [d1]: 1200, [d2]:  900 } },
  ];
  return { dates: [d0, d1, d2], users };
}
const MOCK = IS_LOCAL ? makeMock() : null;

// 前日比（prevがない最初の記録日は 0）。その日までの最新値をキャリー。
function mockDailyDiffAt(user, date, allDates) {
  const idx = allDates.indexOf(date);
  if (idx < 0) return 0;
  const prevDate = allDates[idx - 1];
  const cur = mockLatestValueUntil(user, date);
  if (!prevDate) return 0;
  const prev = mockLatestValueUntil(user, prevDate);
  return cur - prev;
}
function mockLatestValueUntil(user, date) {
  const ds = Object.keys(user.logs).sort();
  let last = 0;
  for (const d of ds) {
    if (d <= date) last = user.logs[d];
  }
  return last;
}

function lastFinalized() {
  const now = new Date();
  const hh = now.getHours(), mm = now.getMinutes();
  // 本家と同じルール（23:59まで暫定）
  if (hh < 23 || (hh === 23 && mm < 59)) return ymd(addDays(now, -1));
  return ymd(now);
}

function mockBoardCalc({ mode = "daily", periodDays = 7, date }) {
  const allDates = MOCK.dates.slice().sort();
  const target = date || lastFinalized();
  const end = target;
  const start = ymd(addDays(new Date(end), -(periodDays - 1)));

  const board = MOCK.users.map(u => {
    let value = 0;
    if (mode === "raw") {
      value = mockLatestValueUntil(u, end);
    } else if (mode === "daily") {
      value = mockDailyDiffAt(u, end, allDates);
    } else {
      // period（増減の合計：±をそのまま合算）
      value = allDates
        .filter(d => d >= start && d <= end)
        .map(d => mockDailyDiffAt(u, d, allDates))
        .reduce((a, b) => a + b, 0);
    }
    return { name: u.name, value };
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return { date_ymd: end, mode, periodDays, board };
}

function mockSeriesCalc({ mode = "daily", periodDays = 7, days = 14, top = 5, date }) {
  const allDates = MOCK.dates.slice().sort();
  const end = date || lastFinalized();

  // グラフの開始日は指定days分（モックは3日分しかないので最小化）
  let startIdx = 0;
  const endIdx = allDates.indexOf(end) >= 0 ? allDates.indexOf(end) : (allDates.length - 1);
  startIdx = Math.max(0, endIdx - (days - 1));
  const dates = allDates.slice(startIdx, endIdx + 1);

  // board基準でトップNを選ぶ
  const topBoard = mockBoardCalc({ mode, periodDays, date: end }).board.slice(0, top);
  const topNames = new Set(topBoard.map(b => b.name));

  const series = MOCK.users
    .filter(u => topNames.has(u.name))
    .map(u => {
      const points = dates.map(d => {
        let value = 0;
        if (mode === "raw") value = mockLatestValueUntil(u, d);
        else if (mode === "daily") value = mockDailyDiffAt(u, d, allDates);
        else {
          // ローリング合計（periodDays）
          const dIdx = allDates.indexOf(d);
          const winStart = Math.max(0, dIdx - (periodDays - 1));
          const winDates = allDates.slice(winStart, dIdx + 1);
          value = winDates.map(x => mockDailyDiffAt(u, x, allDates)).reduce((a, b) => a + b, 0);
        }
        return { date_ymd: d, value };
      });
      return { name: u.name, points };
    });

  return { date_ymd: end, mode, periodDays, days: dates.length, top, series };
}

/* ===================== 公開API ===================== */

export const api = {
  // ログイン等は常にサーバーへ（ローカルでもそのまま使える）
  status:       ()            => IS_LOCAL ? Promise.resolve({
    canEditToday: true,
    today_ymd: ymd(),
    board_date_ymd: lastFinalized(),
  }) : req("/api/status"),

  register:     (name, pin)   => req("/api/register", { method: "POST", body: JSON.stringify({ name, pin }) }),
  login:        (name, pin)   => req("/api/login",    { method: "POST", body: JSON.stringify({ name, pin }) }),
  postCoins:    (coins)       => req("/api/coins",    { method: "POST", body: JSON.stringify({ coins }) }),
  myCoins:      (days=30)     => req(`/api/coins?days=${days}`),

  // ランキング（ローカル=モック、本番=API + キャッシュ）
  board: async (opts = {}) => {
    if (IS_LOCAL && MOCK) {
      const mode = typeof opts === "string" ? "daily" : (opts.mode || "daily");
      const date = typeof opts === "string" ? opts : opts.date;
      const periodDays = typeof opts === "string" ? 7 : (opts.periodDays || 7);
      return { ...mockBoardCalc({ mode, periodDays, date }), _fromCache: false };
    }

    const params = new URLSearchParams();
    if (typeof opts === "string") params.set("date", opts);
    else {
      if (opts.date) params.set("date", opts.date);
      if (opts.mode) params.set("mode", opts.mode);
      if (opts.periodDays) params.set("periodDays", String(opts.periodDays));
    }
    const url = `${BASE}/api/board${params.toString() ? `?${params.toString()}` : ""}`;

    try {
      const res = await fetchWithTimeout(url, { headers: { "X-Timezone": tz } }, 4000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.clone().json();
      if ("caches" in window) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(url, new Response(JSON.stringify(json), { headers: { "Content-Type": "application/json" } }));
        } catch {}
      }
      return { ...json, _fromCache: false };
    } catch {
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
      return { board: [], _fromCache: true, error: "offline" };
    }
  },

  // 折れ線グラフ（ローカル=モック、本番=API）
  boardSeries: async ({ mode="daily", periodDays=7, days=14, top=5, date } = {}) => {
    if (IS_LOCAL && MOCK) {
      return mockSeriesCalc({ mode, periodDays, days, top, date });
    }
    const p = new URLSearchParams();
    p.set("mode", mode);
    if (periodDays) p.set("periodDays", String(periodDays));
    if (days) p.set("days", String(days));
    if (top) p.set("top", String(top));
    if (date) p.set("date", date);
    return req(`/api/board_series?${p.toString()}`);
  }
};
