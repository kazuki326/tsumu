// server/index.js — TSUMU COINS API (Postgres)
// ・Render Postgres (DATABASE_URL) に保存
// ・「前日比」…初回日は 0 に補正
// ・ランキング…raw/daily/period(7日/30日 等)
// ・JST 23:59 までは当日編集OK。日中はフロントから「今日(暫定)」でランキング取得

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pkg from "pg";

const { Pool } = pkg;

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
    credentials: false
  })
);

// ===== Config =====
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PORT = Number(process.env.PORT || 3001);
const DEFAULT_TZ = "Asia/Tokyo";

// ===== Postgres =====
// Render の外部 URL を DATABASE_URL に設定しておく
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined
});

// 起動時にスキーマ作成
async function migrate() {
  const sql = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_ci ON users(lower(name));

  CREATE TABLE IF NOT EXISTS coin_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date_ymd DATE NOT NULL,
    coins INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT coin_logs_user_date UNIQUE (user_id, date_ymd)
  );
  CREATE INDEX IF NOT EXISTS idx_coin_logs_user_date ON coin_logs(user_id, date_ymd);
  `;
  await pool.query(sql);
  await pool.query(`SET TIME ZONE '${DEFAULT_TZ}';`);
  console.log("✅ Migrated & timezone set:", DEFAULT_TZ);
}

// ===== Utils =====
const nowISO = () => new Date().toISOString();
const ymdInTZ = (tz = DEFAULT_TZ, d = new Date()) => {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${day}`;
};
const hmInTZ = (tz = DEFAULT_TZ, d = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit"
  }).formatToParts(d);
  return {
    h: Number(parts.find(p => p.type === "hour").value),
    m: Number(parts.find(p => p.type === "minute").value)
  };
};
const canEditToday = (tz = DEFAULT_TZ) => {
  const { h, m } = hmInTZ(tz);
  return h < 23 || (h === 23 && m < 59);
};
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

// 初期情報（今日/締切、暫定表示に使う）
app.get("/api/status", (req, res) => {
  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  res.json({
    canEditToday: canEditToday(tz),
    today_ymd: ymdInTZ(tz),
    board_date_ymd: lastFinalizedDate(tz),
  });
});

// 新規登録
app.post("/api/register", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pin = String(req.body?.pin || "").trim();
  if (!name || pin.length < 4) return res.status(400).json({ error: "name and 4+ digit pin required" });

  const pin_hash = bcrypt.hashSync(pin, 10);
  try {
    const { rows } = await pool.query(
      "INSERT INTO users(name, pin_hash, created_at) VALUES ($1,$2,$3) RETURNING id,name",
      [name, pin_hash, nowISO()]
    );
    const user = rows[0];
    res.json({ token: issueToken(user), user });
  } catch (e) {
    if (String(e).includes("idx_users_name_ci")) {
      return res.status(409).json({ error: "name already taken" });
    }
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// ログイン
app.post("/api/login", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pin = String(req.body?.pin || "").trim();

  const { rows } = await pool.query("SELECT * FROM users WHERE lower(name)=lower($1)", [name]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "user not found" });
  if (!bcrypt.compareSync(pin, user.pin_hash)) return res.status(401).json({ error: "invalid pin" });
  res.json({ token: issueToken(user), user: { id: user.id, name: user.name } });
});

// 自分
app.get("/api/me", auth, (req, res) => {
  res.json({ id: req.user.uid, name: req.user.name });
});

// 当日コイン登録/更新（JST基準・当日中のみOK）
app.post("/api/coins", auth, async (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0)
    return res.status(400).json({ error: "coins must be non-negative integer" });

  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  if (!canEditToday(tz)) return res.status(403).json({ error: "today is finalized at 23:59" });

  const date_ymd = ymdInTZ(tz);

  // UPSERT
  await pool.query(
    `INSERT INTO coin_logs(user_id, date_ymd, coins, created_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, date_ymd)
     DO UPDATE SET coins=EXCLUDED.coins, created_at=EXCLUDED.created_at`,
    [req.user.uid, date_ymd, coins, nowISO()]
  );

  // 直前の値を取得（初回は NULL → diff=0）
  const { rows: prevRows } = await pool.query(
    `SELECT coins FROM coin_logs WHERE user_id=$1 AND date_ymd < $2
     ORDER BY date_ymd DESC LIMIT 1`,
    [req.user.uid, date_ymd]
  );
  const prev = prevRows[0]?.coins;
  const diff = prev == null ? 0 : (coins - prev);

  res.json({ date_ymd, coins, diff });
});

// 自分の履歴（直近N日）— 初回日の前日比は 0
app.get("/api/coins", auth, async (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 365);
  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  const today = ymdInTZ(tz);

  // generate_series で日付列を作って、当日の値＆前日値を引く
  const { rows } = await pool.query(
    `
    WITH series AS (
      SELECT generate_series(($1::date - ($2 - 1) * INTERVAL '1 day')::date, $1::date, INTERVAL '1 day')::date AS d
    ), base AS (
      SELECT s.d AS date_ymd,
             (SELECT coins FROM coin_logs WHERE user_id=$3 AND date_ymd=s.d) AS coins,
             (SELECT coins FROM coin_logs WHERE user_id=$3 AND date_ymd < s.d ORDER BY date_ymd DESC LIMIT 1) AS prev
      FROM series s
    )
    SELECT to_char(date_ymd,'YYYY-MM-DD') AS date_ymd,
           COALESCE(coins, 0) AS coins,
           CASE WHEN prev IS NULL THEN 0 ELSE (COALESCE(coins, prev) - prev) END AS diff
    FROM base
    ORDER BY date_ymd DESC
    `,
    [today, days, req.user.uid]
  );

  res.json(rows);
});

// ランキング（date, mode, periodDays）
// mode: raw=当日のコイン数 / daily=前日比(初回0) / period=期間合計
app.get("/api/board", async (req, res) => {
  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  const finalized = lastFinalizedDate(tz);
  const date = (req.query.date || finalized).slice(0, 10);
  const mode = String(req.query.mode || "daily");
  const periodDays = Math.min(Math.max(Number(req.query.periodDays || 7), 2), 365);

  // 期間開始日
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - (periodDays - 1));
  const start = d.toISOString().slice(0, 10);

  let rows = [];
  if (mode === "raw") {
    const r = await pool.query(
      `
      WITH u AS (SELECT id, name FROM users)
      SELECT u.name,
             COALESCE((SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd=$1), 0) AS value
      FROM u
      ORDER BY value DESC, name ASC
      `,
      [date]
    );
    rows = r.rows;
  } else if (mode === "daily") {
    const r = await pool.query(
      `
      WITH u AS (SELECT id, name FROM users)
      SELECT u.name,
        CASE
          WHEN (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd < $1 ORDER BY date_ymd DESC LIMIT 1) IS NULL
            THEN 0
          ELSE
            (
              COALESCE(
                (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd=$1),
                (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd < $1 ORDER BY date_ymd DESC LIMIT 1)
              )
              -
              (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd < $1 ORDER BY date_ymd DESC LIMIT 1)
            )
        END AS value
      FROM u
      ORDER BY value DESC, name ASC
      `,
      [date]
    );
    rows = r.rows;
  } else {
    const r = await pool.query(
      `
      WITH u AS (SELECT id, name FROM users)
      SELECT u.name,
             COALESCE((
               SELECT SUM(coins) FROM coin_logs
               WHERE user_id=u.id AND date_ymd BETWEEN $1 AND $2
             ), 0) AS value
      FROM u
      ORDER BY value DESC, name ASC
      `,
      [start, date]
    );
    rows = r.rows;
  }

  const board = rows.map((r) => ({ name: r.name, value: Number(r.value) || 0 }));
  res.json({ date_ymd: date, mode, periodDays, board, finalized_date: finalized });
});

// 共通エラー
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "server error" });
});

// 起動
migrate()
  .then(() => app.listen(PORT, () => console.log(`TSUMU COINS API on http://localhost:${PORT}`)))
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
