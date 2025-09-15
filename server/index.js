// server/index.js — TSUMU COINS API (Postgres) + series API
// ・Render Postgres (DATABASE_URL)
// ・前日比：初回は 0
// ・ランキング：
//    - raw …「コイン数」= 各ユーザーの“最後の記録”（日付を問わない）
//    - daily … 指定日の前日比（初回は 0）
//    - period … 期間内の日々の前日差を合計（±の“増減”合計）
// ・/api/board_series … 各モードに対応した時系列（折れ線グラフ用）
// ・JST 23:59 までは当日編集OK（日中は「今日(暫定)」で表示）
// ・/api/board に軽いキャッシュヘッダ

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
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
    origin === "https://kazuki326.github.io" ||
    origin === "http://localhost:5173" ||
    origin === "http://127.0.0.1:5173" ||
    origin?.includes("localhost")
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined
});

// ===== Migrate =====
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
  return { h: Number(parts.find(p => p.type==="hour").value), m: Number(parts.find(p => p.type==="minute").value) };
};
const canEditToday = (tz = DEFAULT_TZ) => {
  const { h, m } = hmInTZ(tz);
  return h < 23 || (h === 23 && m < 59);
};
const lastFinalizedDate = (tz = DEFAULT_TZ) => {
  if (canEditToday(tz)) {
    const d = new Date(); d.setDate(d.getDate()-1);
    return ymdInTZ(tz, d);
  }
  return ymdInTZ(tz);
};

const issueToken = (user) =>
  jwt.sign({ uid: user.id, name: user.name }, JWT_SECRET, { expiresIn: "30d" });

const auth = (req, res, next) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "unauthorized" }); }
};

// ===== API =====
app.get("/", (_req, res) => res.json({ ok: true }));

app.get("/api/status", (req, res) => {
  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  res.json({
    canEditToday: canEditToday(tz),
    today_ymd: ymdInTZ(tz),
    board_date_ymd: lastFinalizedDate(tz),
  });
});

// Register / Login
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
    if (String(e).includes("idx_users_name_ci")) return res.status(409).json({ error: "name already taken" });
    console.error(e); res.status(500).json({ error: "server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pin = String(req.body?.pin || "").trim();
  const { rows } = await pool.query("SELECT * FROM users WHERE lower(name)=lower($1)", [name]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "user not found" });
  if (!bcrypt.compareSync(pin, user.pin_hash)) return res.status(401).json({ error: "invalid pin" });
  res.json({ token: issueToken(user), user: { id: user.id, name: user.name } });
});

app.get("/api/me", auth, (req, res) => res.json({ id: req.user.uid, name: req.user.name }));

// 当日登録/更新（JST当日中のみ）
app.post("/api/coins", auth, async (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0) return res.status(400).json({ error: "coins must be non-negative integer" });

  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  if (!canEditToday(tz)) return res.status(403).json({ error: "today is finalized at 23:59" });

  const date_ymd = ymdInTZ(tz);
  await pool.query(
    `INSERT INTO coin_logs(user_id, date_ymd, coins, created_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, date_ymd)
     DO UPDATE SET coins=EXCLUDED.coins, created_at=EXCLUDED.created_at`,
    [req.user.uid, date_ymd, coins, nowISO()]
  );

  const { rows: prevRows } = await pool.query(
    `SELECT coins FROM coin_logs WHERE user_id=$1 AND date_ymd < $2
     ORDER BY date_ymd DESC LIMIT 1`, [req.user.uid, date_ymd]
  );
  const prev = prevRows[0]?.coins;
  res.json({ date_ymd, coins, diff: prev == null ? 0 : (coins - prev) });
});

// 自分の履歴（直近N日）— 初回のdiffは0
app.get("/api/coins", auth, async (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 365);
  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  const today = ymdInTZ(tz);
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

// ランキング（raw/daily/period）
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
             COALESCE((
               SELECT coins FROM coin_logs
               WHERE user_id=u.id
               ORDER BY date_ymd DESC
               LIMIT 1
             ), 0) AS value
      FROM u
      ORDER BY value DESC, name ASC
      `
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
      WITH u AS (SELECT id, name FROM users),
      series AS (
        SELECT generate_series($1::date, $2::date, '1 day')::date AS d
      ),
      diffs AS (
        SELECT
          u.name,
          CASE
            WHEN p.prev IS NULL THEN 0
            ELSE (COALESCE(c.cur, p.prev) - p.prev)
          END AS diff
        FROM u
        CROSS JOIN series s
        LEFT JOIN LATERAL (
          SELECT coins AS prev FROM coin_logs
          WHERE user_id=u.id AND date_ymd < s.d
          ORDER BY date_ymd DESC LIMIT 1
        ) p ON TRUE
        LEFT JOIN LATERAL (
          SELECT coins AS cur FROM coin_logs
          WHERE user_id=u.id AND date_ymd <= s.d
          ORDER BY date_ymd DESC LIMIT 1
        ) c ON TRUE
      )
      SELECT name, COALESCE(SUM(diff), 0) AS value
      FROM diffs
      GROUP BY name
      ORDER BY value DESC, name ASC
      `,
      [start, date]
    );
    rows = r.rows;
  }

  const board = rows.map((r) => ({ name: r.name, value: Number(r.value) || 0 }));
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=86400");
  res.json({ date_ymd: date, mode, periodDays, board, finalized_date: finalized });
});

// 折れ線グラフ用シリーズ（トップNの時系列）
app.get("/api/board_series", async (req, res) => {
  const tz = req.header("X-Timezone") || DEFAULT_TZ;
  const finalized = lastFinalizedDate(tz);
  const date = (req.query.date || finalized).slice(0, 10);
  const mode = String(req.query.mode || "daily");             // raw/daily/period
  const periodDays = Math.min(Math.max(Number(req.query.periodDays || 7), 2), 365);
  const days = Math.min(Math.max(Number(req.query.days || (mode==="raw"||mode==="daily"?14:Math.max(14, periodDays+6))), 2), 365);
  const top = Math.min(Math.max(Number(req.query.top || 5), 1), 50);

  // グラフの開始日（可変）
  const end = new Date(`${date}T00:00:00`);
  const startD = new Date(end); startD.setDate(end.getDate() - (days - 1));
  const start = startD.toISOString().slice(0, 10);

  // まず「現行boardの順位」でトップNユーザーを確定
  let topUsersQuery = "";
  let topUsersParams = [];
  if (mode === "raw") {
    topUsersQuery = `
      WITH last AS (
        SELECT u.id, u.name,
               (SELECT coins FROM coin_logs WHERE user_id=u.id ORDER BY date_ymd DESC LIMIT 1) AS v
        FROM users u
      )
      SELECT id, name FROM last ORDER BY v DESC NULLS LAST, name ASC LIMIT $1
    `;
    topUsersParams = [top];
  } else if (mode === "daily") {
    topUsersQuery = `
      WITH u AS (SELECT id, name FROM users),
      diff AS (
        SELECT u.id, u.name,
          CASE
            WHEN (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd < $1 ORDER BY date_ymd DESC LIMIT 1) IS NULL
              THEN 0
            ELSE (
              COALESCE(
                (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd=$1),
                (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd < $1 ORDER BY date_ymd DESC LIMIT 1)
              )
              -
              (SELECT coins FROM coin_logs WHERE user_id=u.id AND date_ymd < $1 ORDER BY date_ymd DESC LIMIT 1)
            )
          END AS v
        FROM u
      )
      SELECT id, name FROM diff ORDER BY v DESC, name ASC LIMIT $2
    `;
    topUsersParams = [date, top];
  } else {
    topUsersQuery = `
      WITH u AS (SELECT id, name FROM users),
      series AS (SELECT generate_series($1::date, $2::date, '1 day')::date AS d),
      diffs AS (
        SELECT u.id, u.name,
          CASE WHEN p.prev IS NULL THEN 0 ELSE (COALESCE(c.cur, p.prev) - p.prev) END AS diff
        FROM u
        CROSS JOIN series s
        LEFT JOIN LATERAL (
          SELECT coins AS prev FROM coin_logs WHERE user_id=u.id AND date_ymd < s.d ORDER BY date_ymd DESC LIMIT 1
        ) p ON TRUE
        LEFT JOIN LATERAL (
          SELECT coins AS cur FROM coin_logs WHERE user_id=u.id AND date_ymd <= s.d ORDER BY date_ymd DESC LIMIT 1
        ) c ON TRUE
      ),
      agg AS (
        SELECT id, name,
               SUM(diff) FILTER (WHERE d BETWEEN $1 AND $2) AS v
        FROM diffs
        GROUP BY id, name
      )
      SELECT id, name FROM agg ORDER BY v DESC, name ASC LIMIT $3
    `;
    topUsersParams = [start, date, top];
  }
  const topUsers = (await pool.query(topUsersQuery, topUsersParams)).rows;
  if (topUsers.length === 0) return res.json({ date_ymd: date, mode, periodDays, days, top, series: [] });

  // 時系列を生成
  const ids = topUsers.map(u => u.id);
  const idList = ids.map((_, i) => `$${i+1}`).join(","); // $1,$2,...
  const paramsBase = [...ids, start, date, periodDays];

  let sql = "";
  if (mode === "raw") {
    sql = `
      WITH topu AS (
        SELECT id, name FROM users WHERE id IN (${idList})
      ),
      series AS (SELECT generate_series($${ids.length+1}::date, $${ids.length+2}::date, '1 day')::date AS d),
      cur AS (
        SELECT tu.id, tu.name, s.d,
               (SELECT coins FROM coin_logs WHERE user_id=tu.id AND date_ymd <= s.d ORDER BY date_ymd DESC LIMIT 1) AS v
        FROM topu tu CROSS JOIN series s
      )
      SELECT name, to_char(d,'YYYY-MM-DD') AS date_ymd, COALESCE(v,0) AS value
      FROM cur
      ORDER BY name, date_ymd
    `;
  } else if (mode === "daily") {
    sql = `
      WITH topu AS (
        SELECT id, name FROM users WHERE id IN (${idList})
      ),
      series AS (SELECT generate_series($${ids.length+1}::date, $${ids.length+2}::date, '1 day')::date AS d),
      base AS (
        SELECT tu.id, tu.name, s.d,
          (SELECT coins FROM coin_logs WHERE user_id=tu.id AND date_ymd < s.d ORDER BY date_ymd DESC LIMIT 1) AS prev,
          (SELECT coins FROM coin_logs WHERE user_id=tu.id AND date_ymd <= s.d ORDER BY date_ymd DESC LIMIT 1) AS cur
        FROM topu tu CROSS JOIN series s
      )
      SELECT name, to_char(d,'YYYY-MM-DD') AS date_ymd,
             CASE WHEN prev IS NULL THEN 0 ELSE (COALESCE(cur,prev) - prev) END AS value
      FROM base
      ORDER BY name, date_ymd
    `;
  } else {
    sql = `
      WITH topu AS (
        SELECT id, name FROM users WHERE id IN (${idList})
      ),
      series AS (SELECT generate_series($${ids.length+1}::date, $${ids.length+2}::date, '1 day')::date AS d),
      base AS (
        SELECT tu.id, tu.name, s.d,
          (SELECT coins FROM coin_logs WHERE user_id=tu.id AND date_ymd < s.d ORDER BY date_ymd DESC LIMIT 1) AS prev,
          (SELECT coins FROM coin_logs WHERE user_id=tu.id AND date_ymd <= s.d ORDER BY date_ymd DESC LIMIT 1) AS cur
        FROM topu tu CROSS JOIN series s
      ),
      diffs AS (
        SELECT id, name, d,
               CASE WHEN prev IS NULL THEN 0 ELSE (COALESCE(cur,prev) - prev) END AS diff
        FROM base
      ),
      roll AS (
        SELECT name, d,
               SUM(diff) OVER (PARTITION BY name ORDER BY d ROWS BETWEEN $${ids.length+3} PRECEDING AND CURRENT ROW) AS value
        FROM diffs
      )
      SELECT name, to_char(d,'YYYY-MM-DD') AS date_ymd, value
      FROM roll
      ORDER BY name, date_ymd
    `;
  }
  const rows = (await pool.query(sql, paramsBase)).rows;

  // まとめて返す
  const byName = {};
  for (const r of rows) {
    if (!byName[r.name]) byName[r.name] = [];
    byName[r.name].push({ date_ymd: r.date_ymd, value: Number(r.value) || 0 });
  }
  const series = topUsers.map(u => ({ name: u.name, points: byName[u.name] || [] }));
  res.json({ date_ymd: date, mode, periodDays, days, top, series });
});

// エラー
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "server error" });
});

// 起動
migrate()
  .then(() => app.listen(PORT, () => console.log(`TSUMU COINS API on http://localhost:${PORT}`)))
  .catch((e) => { console.error("Migration failed:", e); process.exit(1); });
