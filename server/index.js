// server/index.js
// Tsumu Coins API (Postgres 優先 / SQLite フォールバック)
// - JWT 認証（名前 + PIN）
// - 今日入力（23:59 までは上書き可）/ 過去日の修正（環境変数で制御）
// - 自分の履歴、直近記録一覧、ランキング（raw/daily/period）
// - ラインチャート用 series 取得
// - CORS（GitHub Pages / localhost 許可）+ 軽量メモリキャッシュ

import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

/* ===================== 基本設定 ===================== */
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const TZ = "Asia/Tokyo";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DATABASE_URL = process.env.DATABASE_URL || ""; // Render Postgres の接続文字列
const USE_PG = !!DATABASE_URL;
const DB_PATH = process.env.DB_PATH || "./coins.db";

// 過去編集のポリシー（/api/status と PATCH で利用）
const ALLOW_PAST_EDITS = process.env.ALLOW_PAST_EDITS === "1";
const PAST_EDIT_MAX_DAYS = parseInt(process.env.PAST_EDIT_MAX_DAYS || "30", 10); // 0=無制限

/* ===================== CORS ===================== */
const ALLOWLIST = [
  "https://kazuki326.github.io", // GitHub Pages
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const corsDelegate = (req, cb) => {
  const origin = req.header("Origin") || "";
  const ok =
    ALLOWLIST.includes(origin) ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1");
  cb(null, {
    origin: ok ? origin : false,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Timezone"],
    optionsSuccessStatus: 204,
  });
};
app.use(cors(corsDelegate));
app.options("*", cors(corsDelegate));

/* ===================== 日付ユーティリティ ===================== */
const nowISO = () => new Date().toISOString();
const jstNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
const jstDateYMD = (d = new Date()) =>
  new Date(d.toLocaleString("en-US", { timeZone: TZ })).toISOString().slice(0, 10);

const toDate = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (ymd, n) => {
  const dt = toDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const daysDiff = (aYmd, bYmd) =>
  Math.floor((toDate(bYmd) - toDate(aYmd)) / 86_400_000);

const listDates = (startYmd, endYmd) => {
  const out = [];
  let d = startYmd;
  while (d <= endYmd) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
};
// グラフの終端既定値（23:59 確定前は前日を返したい時はこれを利用）
const lastFinalizedYmd = () => {
  const n = jstNow();
  if (n.getHours() < 23 || (n.getHours() === 23 && n.getMinutes() < 59)) {
    return addDays(jstDateYMD(n), -1);
  }
  return jstDateYMD(n);
};
// PG/SQLite の日付を YYYY-MM-DD にそろえる
const normYMD = (v) =>
  typeof v === "string" ? v.slice(0, 10) : v?.toISOString?.().slice(0, 10);

/* ===================== DB（PG 優先 / SQLite フォールバック） ===================== */
let db = null;     // better-sqlite3 のインスタンス
let pgPool = null; // pg.Pool

if (USE_PG) {
  const { Pool } = await import("pg");
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_ci ON users(lower(name));

    CREATE TABLE IF NOT EXISTS coin_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date_ymd DATE NOT NULL,
      coins INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, date_ymd)
    );
  `);
} else {
  let Database;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch (e) {
    console.error(
      "better-sqlite3 が見つかりません。ローカルで SQLite を使う場合は `npm i` で依存を入れるか、DATABASE_URL を設定して Postgres を使ってください。"
    );
    process.exit(1);
  }
  db = new Database(DB_PATH);
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
      date_ymd TEXT NOT NULL,
      coins INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, date_ymd),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

// PG の ? → $1 変換
const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};
// SELECT 1行
const sqlGet = async (sql, params = []) => {
  if (USE_PG) {
    const { rows } = await pgPool.query(toPg(sql), params);
    return rows[0] || null;
  }
  return db.prepare(sql).get(...params) || null;
};
// SELECT 複数行
const sqlAll = async (sql, params = []) => {
  if (USE_PG) {
    const { rows } = await pgPool.query(toPg(sql), params);
    return rows;
  }
  return db.prepare(sql).all(...params);
};
// 実行（INSERT/UPDATE/DELETE）
const sqlRun = async (sql, params = []) => {
  if (USE_PG) {
    const r = await pgPool.query(toPg(sql), params);
    return { changes: r.rowCount };
  }
  const info = db.prepare(sql).run(...params);
  return { changes: info.changes, lastID: info.lastInsertRowid };
};

/* ===================== 軽量キャッシュ ===================== */
const CACHE = new Map(); // key -> { at, ttl, data }
const getCache = (key) => {
  const e = CACHE.get(key);
  if (!e) return null;
  if (Date.now() - e.at > e.ttl) return (CACHE.delete(key), null);
  return e.data;
};
const setCache = (key, data, ttlMs = 60_000) => {
  CACHE.set(key, { at: Date.now(), ttl: ttlMs, data });
};
const clearCache = () => CACHE.clear();

/* ===================== 認証 ===================== */
const issueToken = (user) =>
  jwt.sign({ uid: user.id, name: user.name }, JWT_SECRET, { expiresIn: "30d" });

const auth = (req, res, next) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
};

/* ===================== API ===================== */

// 健康チェック
app.get("/", (_req, res) => res.json({ ok: true }));

// ステータス（今日/締切、過去編集ポリシー）
app.get("/api/status", (_req, res) => {
  const today = jstDateYMD();
  const now = jstNow();
  const canEditToday = !(now.getHours() === 23 && now.getMinutes() >= 59);
  res.json({
    today_ymd: today,
    canEditToday,
    board_date_ymd: today,
    allowPastEdits: ALLOW_PAST_EDITS,
    pastEditMaxDays: PAST_EDIT_MAX_DAYS,
  });
});

// 新規登録
app.post("/api/register", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pin = String(req.body?.pin || "").trim();
  if (!name || pin.length < 4)
    return res.status(400).json({ error: "name and 4+ digit pin required" });
  const pin_hash = bcrypt.hashSync(pin, 10);
  try {
    if (USE_PG) {
      const row = await sqlGet(
        "INSERT INTO users(name, pin_hash, created_at) VALUES (?, ?, now()) RETURNING id, name",
        [name, pin_hash]
      );
      res.json({ token: issueToken(row), user: row });
    } else {
      const r = await sqlRun(
        "INSERT INTO users(name, pin_hash, created_at) VALUES (?, ?, ?)",
        [name, pin_hash, nowISO()]
      );
      const user = await sqlGet("SELECT id, name FROM users WHERE id=?", [r.lastID]);
      res.json({ token: issueToken(user), user });
    }
  } catch (e) {
    const msg = String(e).toLowerCase();
    if (msg.includes("unique"))
      return res.status(409).json({ error: "name already taken" });
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// ログイン
app.post("/api/login", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pin = String(req.body?.pin || "").trim();
  const user = await sqlGet("SELECT * FROM users WHERE lower(name)=lower(?)", [name]);
  if (!user) return res.status(404).json({ error: "user not found" });
  if (!bcrypt.compareSync(pin, user.pin_hash))
    return res.status(401).json({ error: "invalid pin" });
  res.json({ token: issueToken(user), user: { id: user.id, name: user.name } });
});

// 自分
app.get("/api/me", auth, (req, res) => {
  res.json({ id: req.user.uid, name: req.user.name });
});

// コイン登録/更新（当日JST。1日内なら上書き可）
app.post("/api/coins", auth, async (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0)
    return res.status(400).json({ error: "coins must be non-negative integer" });
  const date_ymd = (req.body?.date || jstDateYMD()).slice(0, 10);

  try {
    if (USE_PG) {
      await sqlRun(
        `INSERT INTO coin_logs(user_id, date_ymd, coins, created_at)
         VALUES (?, ?, ?, now())
         ON CONFLICT (user_id, date_ymd)
         DO UPDATE SET coins=EXCLUDED.coins, created_at=EXCLUDED.created_at`,
        [req.user.uid, date_ymd, coins]
      );
    } else {
      const ex = await sqlGet(
        "SELECT id FROM coin_logs WHERE user_id=? AND date_ymd=?",
        [req.user.uid, date_ymd]
      );
      if (ex) {
        await sqlRun("UPDATE coin_logs SET coins=?, created_at=? WHERE id=?", [
          coins,
          nowISO(),
          ex.id,
        ]);
      } else {
        await sqlRun(
          "INSERT INTO coin_logs(user_id, date_ymd, coins, created_at) VALUES (?, ?, ?, ?)",
          [req.user.uid, date_ymd, coins, nowISO()]
        );
      }
    }

    clearCache(); // ランキングに即反映
    const prev = await sqlGet(
      "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd < ? ORDER BY date_ymd DESC LIMIT 1",
      [req.user.uid, date_ymd]
    );
    res.json({ date_ymd, coins, diff: prev ? coins - prev.coins : 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// 自分の履歴（最新→過去）
app.get("/api/coins", auth, async (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 365);
  const rows = await sqlAll(
    "SELECT date_ymd, coins FROM coin_logs WHERE user_id=? ORDER BY date_ymd DESC LIMIT ?",
    [req.user.uid, days]
  );
  const normed = rows.map((r) => ({ date_ymd: normYMD(r.date_ymd), coins: r.coins }));
  const withDiff = normed.map((r, i) => ({
    ...r,
    diff: i === normed.length - 1 ? 0 : r.coins - normed[i + 1].coins,
  }));
  res.json(withDiff);
});

// 直近の自分の記録（修正用の一覧）
app.get("/api/my_latest", auth, async (req, res) => {
  const limit = Math.max(1, Math.min(30, Number(req.query.limit || 7)));
  try {
    const rows = await sqlAll(
      "SELECT date_ymd, coins FROM coin_logs WHERE user_id=? ORDER BY date_ymd DESC LIMIT ?",
      [req.user.uid, limit]
    );
    res.json(rows.map((r) => ({ date_ymd: normYMD(r.date_ymd), coins: Number(r.coins) || 0 })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// 記録の修正（今日のみ or 環境変数で過去も許可）
app.patch("/api/coins/:date", auth, async (req, res) => {
  const date_ymd = String(req.params.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_ymd))
    return res.status(400).json({ error: "invalid date" });

  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0)
    return res.status(400).json({ error: "coins must be non-negative integer" });

  const today = jstDateYMD();
  const now = jstNow();
  const canEditToday = !(now.getHours() === 23 && now.getMinutes() >= 59);

  if (date_ymd === today) {
    if (!canEditToday) return res.status(403).json({ error: "today is already finalized" });
  } else {
    if (!ALLOW_PAST_EDITS) return res.status(403).json({ error: "editing past days is locked" });
    const diff = Math.abs(daysDiff(date_ymd, today));
    if (PAST_EDIT_MAX_DAYS > 0 && diff > PAST_EDIT_MAX_DAYS) {
      return res
        .status(403)
        .json({ error: `only past ${PAST_EDIT_MAX_DAYS} days can be edited` });
    }
  }

  try {
    const exist = await sqlGet(
      "SELECT id FROM coin_logs WHERE user_id=? AND date_ymd=?",
      [req.user.uid, date_ymd]
    );
    if (!exist) return res.status(404).json({ error: "record not found for that date" });

    if (USE_PG) {
      await sqlRun("UPDATE coin_logs SET coins=?, created_at=now() WHERE id=?", [
        coins,
        exist.id,
      ]);
    } else {
      await sqlRun("UPDATE coin_logs SET coins=?, created_at=? WHERE id=?", [
        coins,
        nowISO(),
        exist.id,
      ]);
    }

    clearCache();
    res.json({ date_ymd, coins });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

/* ============= ランキング（数値）：/api/board =============
   クエリ:
     date=YYYY-MM-DD（省略時は JST 今日）
     mode=raw|daily|period（既定: daily）
     periodDays=7（mode=period の窓幅）
   定義:
     raw    = 指定日までの最新値
     daily  = 指定日の前日比
     period = 期間内に“存在する記録同士”の前日差(diff)を合計
              └ 期間開始日前の基準値は使わない（最初の1件は差分0）
============================================================= */
app.get("/api/board", async (req, res) => {
  const date = (req.query.date || jstDateYMD()).slice(0, 10);
  const mode = String(req.query.mode || "daily").toLowerCase(); // raw|daily|period
  const periodDays = Math.max(1, Number(req.query.periodDays || 7));
  const startDate = addDays(date, -(periodDays - 1));

  const cacheKey = `board:${date}:${mode}:${periodDays}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ ...cached, _fromCache: true });

  try {
    const users = await sqlAll("SELECT id, name FROM users ORDER BY id", []);
    const board = [];

    for (const u of users) {
      // 指定日までの最新値と、その直前
      const lastOnOrBefore = await sqlGet(
        "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd <= ? ORDER BY date_ymd DESC LIMIT 1",
        [u.id, date]
      );
      const prevBeforeDate = await sqlGet(
        "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd < ? ORDER BY date_ymd DESC LIMIT 1",
        [u.id, date]
      );

      let value = 0;

      if (mode === "raw") {
        value = lastOnOrBefore?.coins || 0;
      } else if (mode === "daily") {
        const vLast = lastOnOrBefore?.coins || 0;
        const vPrev = prevBeforeDate?.coins || 0;
        value = vLast - vPrev;
      } else {
        // period: 期間内“に存在する記録同士”の差分のみ合計（= 履歴画面のやり方）
        const rows = await sqlAll(
          "SELECT date_ymd, coins FROM coin_logs WHERE user_id=? AND date_ymd >= ? AND date_ymd <= ? ORDER BY date_ymd ASC",
          [u.id, startDate, date]
        );

        let prev = null; // 期間内の直前レコード（期間外は見ない）
        let sum = 0;
        for (const r of rows) {
          if (prev !== null) {
            sum += (Number(r.coins) || 0) - (Number(prev.coins) || 0);
          }
          prev = r;
        }
        value = sum;
      }

      board.push({ name: u.name, value });
    }

    board.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const payload = { date_ymd: date, mode, periodDays, board };
    setCache(cacheKey, payload, 60_000);
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});


/* =========== ランキング（折れ線グラフ）：/api/board_series ===========
   クエリ:
     mode=raw|daily|period（既定: daily）
     periodDays=7（mode=period の窓幅）
     days=14（系列に含める日数）
     top=5（上位N名）
     date=YYYY-MM-DD（終端日。省略時は lastFinalizedYmd()）
   ロジック:
     valuesRaw   = その日までの最新値（キャリー）
     valuesDaily = 前日差
     valuesPeriod= 前日差のローリング合計（窓幅 periodDays）
======================================================================= */
app.get("/api/board_series", async (req, res) => {
  try {
    const mode = (req.query.mode || "daily").toLowerCase();
    const periodDays = Math.max(1, Number(req.query.periodDays || 7));
    const days = Math.max(1, Math.min(90, Number(req.query.days || 14)));
    const top = Math.max(1, Math.min(50, Number(req.query.top || 5)));
    const endYmd = (req.query.date || lastFinalizedYmd()).slice(0, 10);
    const startYmd = addDays(endYmd, -(days - 1));
    const dates = listDates(startYmd, endYmd);

    const cacheKey = `series:${endYmd}:${mode}:${periodDays}:${days}:${top}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, _fromCache: true });

    const users = await sqlAll("SELECT id, name FROM users ORDER BY id", []);
    const seriesAll = [];

    for (const u of users) {
      const logsAsc = await sqlAll(
        "SELECT date_ymd, coins FROM coin_logs WHERE user_id=? AND date_ymd <= ? ORDER BY date_ymd ASC",
        [u.id, endYmd]
      );
      const logs = logsAsc.map((r) => ({ date_ymd: normYMD(r.date_ymd), coins: r.coins }));

      // その日までの最新値（キャリー）
      let idx = 0,
        last = 0;
      const valuesRaw = dates.map((d) => {
        while (idx < logs.length && logs[idx].date_ymd <= d) {
          last = logs[idx].coins;
          idx++;
        }
        return last;
      });

      const valuesDaily = valuesRaw.map((v, i) => (i === 0 ? 0 : v - valuesRaw[i - 1]));
      const valuesPeriod = valuesRaw.map((_, i) => {
        let sum = 0;
        const from = Math.max(0, i - (periodDays - 1));
        for (let j = from; j <= i; j++) sum += j === 0 ? 0 : valuesRaw[j] - valuesRaw[j - 1];
        return sum;
      });

      const picked =
        mode === "raw" ? valuesRaw : mode === "daily" ? valuesDaily : valuesPeriod;

      seriesAll.push({
        name: u.name,
        points: dates.map((d, i) => ({ date_ymd: d, value: picked[i] || 0 })),
        score: picked[picked.length - 1] || 0,
      });
    }

    const topSeries = seriesAll
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, top)
      .map(({ name, points }) => ({ name, points }));

    const payload = {
      date_ymd: endYmd,
      mode,
      periodDays,
      days: dates.length,
      top,
      series: topSeries,
    };
    setCache(cacheKey, payload, 60_000);
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

/* ===================== 起動 ===================== */
app.listen(PORT, () =>
  console.log(
    `API server listening on :${PORT} (DB=${USE_PG ? "Postgres" : "SQLite"})`
  )
);
