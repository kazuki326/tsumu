// server/index.js — TSUMU COINS API（前日比の初回補正＆ランキングモード）

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

const app = express();
app.use(express.json());
app.use(helmet());

// ===== CORS =====
const allowOrigin = (origin) => {
  if (!origin) return true;
  return (
    origin === "https://kazuki326.github.io" || // GitHub Pages
    origin === "http://localhost:5173" ||
    origin === "http://127.0.0.1:5173" ||
    origin.includes("localhost")
  );
};
app.use(
  cors({
    origin: (origin, cb) => cb(null, allowOrigin(origin)),
    credentials: false,
  })
);

// ===== Config =====
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DB_PATH = process.env.DB_PATH || "./coins.db";
const PORT = Number(process.env.PORT || 3001);
const DEFAULT_TZ = "Asia/Tokyo";

// レート制限
const limiter = rateLimit({ windowMs: 60_000, limit: 60 });
app.use("/api/", limiter);

// ===== DB =====
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_ci ON users(lower(name));

CREATE TABLE IF NOT EXISTS coin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date_ymd TEXT NOT NULL,   -- YYYY-MM-DD（ユーザーTZ基準）
  coins INTEGER NOT NULL,   -- その日のコイン数
  created_at TEXT NOT NULL,
  UNIQUE(user_id, date_ymd),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_coin_logs_user_date ON coin_logs(user_id, date_ymd);
`);

const nowISO = () => new Date().toISOString();

// 任意TZの YYYY-MM-DD 文字列
const ymdInTZ = (tz = DEFAULT_TZ, d = new Date()) => {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${day}`;
};

// 時刻（時:分）
const hmInTZ = (tz = DEFAULT_TZ, d = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit"
  }).formatToParts(d);
  const h = Number(parts.find(p => p.type === "hour").value);
  const m = Number(parts.find(p => p.type === "minute").value);
  return { h, m };
};

// 23:59 までは当日編集可
const canEditToday = (tz = DEFAULT_TZ) => {
  const { h, m } = hmInTZ(tz);
  return h < 23 || (h === 23 && m < 59);
};

// 直近の「締切済み日」（日中は前日、23:59以降は当日）
const lastFinalizedDate = (tz = DEFAULT_TZ) => {
  if (canEditToday(tz)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return ymdInTZ(tz, d);
  }
  return ymdInTZ(tz);
};

const issueToken = (user) =>
  jwt.sign({ uid: user.id, name: user.name }, JWT_SECRET, { expiresIn: "30d" });

const auth = (req, res, next) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
};

// ===== API =====
app.get("/", (_req, res) => res.json({ ok: true }));

// クライアント初期情報
app.get("/api/status", (req, res) => {
  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  res.json({
    canEditToday: canEditToday(tz),
    today_ymd: ymdInTZ(tz),
    board_date_ymd: lastFinalizedDate(tz),
  });
});

// 登録
app.post("/api/register", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pin = String(req.body?.pin || "").trim();
  if (!name || pin.length < 4)
    return res.status(400).json({ error: "name and 4+ digit pin required" });

  const pin_hash = bcrypt.hashSync(pin, 10);
  try {
    const info = db
      .prepare("INSERT INTO users(name, pin_hash, created_at) VALUES (?, ?, ?)")
      .run(name, pin_hash, nowISO());
    const user = { id: info.lastInsertRowid, name };
    res.json({ token: issueToken(user), user });
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      return res.status(409).json({ error: "name already taken" });
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// ログイン
app.post("/api/login", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pin = String(req.body?.pin || "").trim();
  const user = db.prepare("SELECT * FROM users WHERE lower(name)=lower(?)").get(name);
  if (!user) return res.status(404).json({ error: "user not found" });
  if (!bcrypt.compareSync(pin, user.pin_hash)) return res.status(401).json({ error: "invalid pin" });
  res.json({ token: issueToken(user), user: { id: user.id, name: user.name } });
});

// 自分情報
app.get("/api/me", auth, (req, res) => {
  res.json({ id: req.user.uid, name: req.user.name });
});

// 当日コイン（当日中のみ上書き可）
app.post("/api/coins", auth, (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0)
    return res.status(400).json({ error: "coins must be non-negative integer" });

  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  if (!canEditToday(tz)) return res.status(403).json({ error: "today is finalized at 23:59" });

  const date_ymd = ymdInTZ(tz);
  const existing = db.prepare(
    "SELECT id FROM coin_logs WHERE user_id=? AND date_ymd=?"
  ).get(req.user.uid, date_ymd);

  if (existing) {
    db.prepare("UPDATE coin_logs SET coins=?, created_at=? WHERE id=?")
      .run(coins, nowISO(), existing.id);
  } else {
    db.prepare("INSERT INTO coin_logs(user_id, date_ymd, coins, created_at) VALUES (?, ?, ?, ?)")
      .run(req.user.uid, date_ymd, coins, nowISO());
  }

  const prev = db.prepare(
    "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd < ? ORDER BY date_ymd DESC LIMIT 1"
  ).get(req.user.uid, date_ymd);

  // 初回日は prev = null → 差分は 0 にする
  const diff = prev ? coins - prev.coins : 0;
  res.json({ date_ymd, coins, diff });
});

// 自分の履歴（直近N日）— 初回日の前日比は 0
app.get("/api/coins", auth, (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 365);
  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  const today = ymdInTZ(tz);

  const rows = db.prepare(`
    WITH RECURSIVE seq(d) AS (
      SELECT date(@today)
      UNION ALL
      SELECT date(d, '-1 day') FROM seq
      WHERE d > date(@today, '-'||(@days-1)||' day')
    ),
    base AS (
      SELECT s.d AS date_ymd,
             (SELECT coins FROM coin_logs WHERE user_id=@uid AND date_ymd=s.d) AS coins,
             (SELECT coins FROM coin_logs WHERE user_id=@uid AND date_ymd < s.d ORDER BY date_ymd DESC LIMIT 1) AS prev
      FROM seq s
    )
    SELECT date_ymd,
           COALESCE(coins, 0) AS coins,
           CASE WHEN prev IS NULL THEN 0 ELSE (COALESCE(coins, prev) - prev) END AS diff
    FROM base
    ORDER BY date_ymd DESC
  `).all({ uid: req.user.uid, today, days });

  res.json(rows);
});

// ランキング（date, mode, periodDays）
// mode: raw=「その日のコイン数」 / daily=「前日比」 / period=期間合計
app.get("/api/board", (req, res) => {
  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  const finalized = lastFinalizedDate(tz);
  const date = (req.query.date || finalized).slice(0, 10);
  const mode = String(req.query.mode || "daily");
  const periodDays = Math.min(Math.max(Number(req.query.periodDays || 7), 2), 365);

  // 期間開始日
  const start = (() => {
    const local = new Date(`${date}T00:00:00`);
    local.setDate(local.getDate() - (periodDays - 1));
    return local.toISOString().slice(0, 10);
  })();

  let rows = [];
  if (mode === "raw") {
    rows = db.prepare(`
      WITH u AS (SELECT id, name FROM users)
      SELECT u.name,
             COALESCE((SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd=@date), 0) AS value
      FROM u
      ORDER BY value DESC, name ASC
    `).all({ date });
  } else if (mode === "daily") {
    // 前日が無いユーザーは 0（初回補正）
    rows = db.prepare(`
      WITH u AS (SELECT id, name FROM users)
      SELECT
        u.name,
        CASE
          WHEN (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd < @date ORDER BY date_ymd DESC LIMIT 1) IS NULL
            THEN 0
          ELSE
            (
              COALESCE(
                (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd=@date),
                (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd < @date ORDER BY date_ymd DESC LIMIT 1)
              )
              -
              (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd < @date ORDER BY date_ymd DESC LIMIT 1)
            )
        END AS value
      FROM u
      ORDER BY value DESC, name ASC
    `).all({ date });
  } else {
    // 期間合計（start..date の SUM）
    rows = db.prepare(`
      WITH u AS (SELECT id, name FROM users)
      SELECT u.name,
             COALESCE((SELECT SUM(coins) FROM coin_logs WHERE user_id=u.id AND date_ymd BETWEEN @start AND @date), 0) AS value
      FROM u
      ORDER BY value DESC, name ASC
    `).all({ start, date });
  }

  const board = rows.map(r => ({ name: r.name, value: r.value || 0 }));
  res.json({ date_ymd: date, mode, periodDays, board, finalized_date: finalized });
});

// 共通エラー
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "server error" });
});

app.listen(PORT, () =>
  console.log(`TSUMU COINS API listening on http://localhost:${PORT}`)
);
