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
import webpush from "web-push";

/* ===================== 基本設定 ===================== */
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const TZ = "Asia/Tokyo";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DATABASE_URL = process.env.DATABASE_URL || ""; // Render Postgres の接続文字列
const USE_PG = !!DATABASE_URL;
const DB_PATH = process.env.DB_PATH || "./coins.db";

// VAPID設定
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:noreply@tsumu-coins.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// 過去編集のポリシー（/api/status と PATCH で利用）
const ALLOW_PAST_EDITS = process.env.ALLOW_PAST_EDITS === "1";
const PAST_EDIT_MAX_DAYS = parseInt(process.env.PAST_EDIT_MAX_DAYS || "30", 10); // 0=無制限

/* ===================== CORS ===================== */
const ALLOWLIST = [
  "https://kazuki326.github.io", // GitHub Pages
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5176",
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
      spent INTEGER NOT NULL DEFAULT 0,
      gacha INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, date_ymd)
    );
    -- 既存テーブルへのカラム追加（存在しない場合のみ）
    DO $$ BEGIN
      ALTER TABLE coin_logs ADD COLUMN spent INTEGER NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE coin_logs ADD COLUMN gacha INTEGER NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;

    -- パフォーマンス向上用インデックス
    CREATE INDEX IF NOT EXISTS idx_coin_logs_user_date ON coin_logs(user_id, date_ymd);
    CREATE INDEX IF NOT EXISTS idx_coin_logs_user_date_desc ON coin_logs(user_id, date_ymd DESC);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, endpoint)
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      daily_reminder BOOLEAN NOT NULL DEFAULT false,
      reminder_time TEXT NOT NULL DEFAULT '20:00',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
      spent INTEGER NOT NULL DEFAULT 0,
      gacha INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, date_ymd),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, endpoint),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      user_id INTEGER PRIMARY KEY,
      daily_reminder INTEGER NOT NULL DEFAULT 0,
      reminder_time TEXT NOT NULL DEFAULT '20:00',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  // 既存テーブルへの spent カラム追加（存在しない場合のみ）
  try {
    db.exec("ALTER TABLE coin_logs ADD COLUMN spent INTEGER NOT NULL DEFAULT 0");
  } catch (e) {
    // カラムが既に存在する場合は無視
  }
  // 既存テーブルへの gacha カラム追加（存在しない場合のみ）
  try {
    db.exec("ALTER TABLE coin_logs ADD COLUMN gacha INTEGER NOT NULL DEFAULT 0");
  } catch (e) {
    // カラムが既に存在する場合は無視
  }
  // パフォーマンス向上用インデックス
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_coin_logs_user_date ON coin_logs(user_id, date_ymd);
    CREATE INDEX IF NOT EXISTS idx_coin_logs_user_date_desc ON coin_logs(user_id, date_ymd DESC);
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
// 開発用: ALWAYS_OPEN=1 で常に編集可能にする
const ALWAYS_OPEN = process.env.ALWAYS_OPEN === "1";

app.get("/api/status", (_req, res) => {
  const today = jstDateYMD();
  const now = jstNow();
  // ALWAYS_OPEN が true なら常に編集可能
  const canEditToday = ALWAYS_OPEN || !(now.getHours() === 23 && now.getMinutes() >= 59);
  res.json({
    today_ymd: today,
    canEditToday,
    board_date_ymd: today,
    allowPastEdits: ALLOW_PAST_EDITS || ALWAYS_OPEN,
    pastEditMaxDays: ALWAYS_OPEN ? 365 : PAST_EDIT_MAX_DAYS,
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

// ガチャ1回あたりのコイン消費
const GACHA_COST = 30000;

// 純粋な稼ぎを計算（ガチャ・spent消費を補正）
function calcEarned(diff, gacha, spent) {
  const gachaCost = gacha * GACHA_COST;
  const adjustedDiff = diff + gachaCost + spent;
  return Math.max(0, adjustedDiff);
}

// コイン登録/更新（当日JST。1日内なら上書き可）
app.post("/api/coins", auth, async (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0)
    return res.status(400).json({ error: "coins must be non-negative integer" });
  const spent = Number(req.body?.spent || 0);
  if (!Number.isInteger(spent) || spent < 0)
    return res.status(400).json({ error: "spent must be non-negative integer" });
  const gacha = Number(req.body?.gacha || 0);
  if (!Number.isInteger(gacha) || gacha < 0)
    return res.status(400).json({ error: "gacha must be non-negative integer" });
  const date_ymd = (req.body?.date || jstDateYMD()).slice(0, 10);

  try {
    if (USE_PG) {
      await sqlRun(
        `INSERT INTO coin_logs(user_id, date_ymd, coins, spent, gacha, created_at)
         VALUES (?, ?, ?, ?, ?, now())
         ON CONFLICT (user_id, date_ymd)
         DO UPDATE SET coins=EXCLUDED.coins, spent=EXCLUDED.spent, gacha=EXCLUDED.gacha, created_at=EXCLUDED.created_at`,
        [req.user.uid, date_ymd, coins, spent, gacha]
      );
    } else {
      const ex = await sqlGet(
        "SELECT id FROM coin_logs WHERE user_id=? AND date_ymd=?",
        [req.user.uid, date_ymd]
      );
      if (ex) {
        await sqlRun("UPDATE coin_logs SET coins=?, spent=?, gacha=?, created_at=? WHERE id=?", [
          coins,
          spent,
          gacha,
          nowISO(),
          ex.id,
        ]);
      } else {
        await sqlRun(
          "INSERT INTO coin_logs(user_id, date_ymd, coins, spent, gacha, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [req.user.uid, date_ymd, coins, spent, gacha, nowISO()]
        );
      }
    }

    clearCache(); // ランキングに即反映
    const prev = await sqlGet(
      "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd < ? ORDER BY date_ymd DESC LIMIT 1",
      [req.user.uid, date_ymd]
    );
    const diff = prev ? coins - prev.coins : 0;
    const gachaCost = gacha * GACHA_COST;
    // 稼いだ額の計算:
    // - ガチャありの場合: マイナス増減は0として扱う（ガチャ消費で既にカウント）
    // - ガチャなしでコインが減った場合: 減った分も稼いだ額に加算（使ったということは稼いだ）
    const earned = gacha > 0
      ? Math.max(0, diff) + spent + gachaCost
      : Math.abs(diff) + spent;
    res.json({ date_ymd, coins, spent, gacha, diff, earned });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// 自分の履歴（最新→過去）
app.get("/api/coins", auth, async (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 365);
  const rows = await sqlAll(
    "SELECT date_ymd, coins, spent, gacha FROM coin_logs WHERE user_id=? ORDER BY date_ymd DESC LIMIT ?",
    [req.user.uid, days]
  );
  const normed = rows.map((r) => ({
    date_ymd: normYMD(r.date_ymd),
    coins: r.coins,
    spent: r.spent || 0,
    gacha: r.gacha || 0
  }));
  const withDiff = normed.map((r, i) => {
    const diff = i === normed.length - 1 ? 0 : r.coins - normed[i + 1].coins;
    const earned = calcEarned(diff, r.gacha, r.spent);
    return { ...r, diff, earned };
  });
  res.json(withDiff);
});

// 直近の自分の記録（修正用の一覧）
app.get("/api/my_latest", auth, async (req, res) => {
  const limit = Math.max(1, Math.min(30, Number(req.query.limit || 7)));
  try {
    const rows = await sqlAll(
      "SELECT date_ymd, coins, spent, gacha FROM coin_logs WHERE user_id=? ORDER BY date_ymd DESC LIMIT ?",
      [req.user.uid, limit]
    );
    res.json(rows.map((r) => ({
      date_ymd: normYMD(r.date_ymd),
      coins: Number(r.coins) || 0,
      spent: Number(r.spent) || 0,
      gacha: Number(r.gacha) || 0
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// 記録の修正（今日のみ or 環境変数で過去も許可）
// upsert: 存在しなければ作成、存在すれば更新
app.patch("/api/coins/:date", auth, async (req, res) => {
  const date_ymd = String(req.params.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_ymd))
    return res.status(400).json({ error: "invalid date" });

  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0)
    return res.status(400).json({ error: "coins must be non-negative integer" });
  const spent = Number(req.body?.spent || 0);
  if (!Number.isInteger(spent) || spent < 0)
    return res.status(400).json({ error: "spent must be non-negative integer" });
  const gacha = Number(req.body?.gacha || 0);
  if (!Number.isInteger(gacha) || gacha < 0)
    return res.status(400).json({ error: "gacha must be non-negative integer" });

  const today = jstDateYMD();
  const now = jstNow();
  const canEditToday = ALWAYS_OPEN || !(now.getHours() === 23 && now.getMinutes() >= 59);

  // ALWAYS_OPEN が有効なら時間制限をスキップ
  if (!ALWAYS_OPEN) {
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
  }

  try {
    // upsert: 存在チェックして insert or update
    const exist = await sqlGet(
      "SELECT id FROM coin_logs WHERE user_id=? AND date_ymd=?",
      [req.user.uid, date_ymd]
    );

    if (exist) {
      // 既存レコードを更新
      if (USE_PG) {
        await sqlRun("UPDATE coin_logs SET coins=?, spent=?, gacha=?, created_at=now() WHERE id=?", [
          coins,
          spent,
          gacha,
          exist.id,
        ]);
      } else {
        await sqlRun("UPDATE coin_logs SET coins=?, spent=?, gacha=?, created_at=? WHERE id=?", [
          coins,
          spent,
          gacha,
          nowISO(),
          exist.id,
        ]);
      }
    } else {
      // 新規レコードを作成
      if (USE_PG) {
        await sqlRun(
          "INSERT INTO coin_logs(user_id, date_ymd, coins, spent, gacha, created_at) VALUES (?, ?, ?, ?, ?, now())",
          [req.user.uid, date_ymd, coins, spent, gacha]
        );
      } else {
        await sqlRun(
          "INSERT INTO coin_logs(user_id, date_ymd, coins, spent, gacha, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [req.user.uid, date_ymd, coins, spent, gacha, nowISO()]
        );
      }
    }

    clearCache();
    res.json({ date_ymd, coins, spent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

/* ============= ランキング（数値）：/api/board =============
   クエリ:
     date=YYYY-MM-DD（省略時は JST 今日）
     mode=raw|daily|period|earned|gacha（既定: daily）
     periodDays=7（mode=period|earned|gacha の窓幅）
   定義:
     raw    = 指定日までの最新値
     daily  = 指定日の前日比
     period = 期間内に"存在する記録同士"の前日差(diff)を合計
     earned = 期間内に純粋に稼いだ額（diff + spent）を合計
     gacha  = 期間内のガチャ回数合計
   ※ N+1 問題を解消：全データを2クエリで取得しメモリ上で計算
============================================================= */
app.get("/api/board", async (req, res) => {
  const date = (req.query.date || jstDateYMD()).slice(0, 10);
  const mode = String(req.query.mode || "daily").toLowerCase();
  const periodDays = Math.max(1, Number(req.query.periodDays || 7));
  const startDate = addDays(date, -(periodDays - 1));

  const cacheKey = `board:${date}:${mode}:${periodDays}`;
  const skipCache = req.query.skipCache === "true";
  const cached = !skipCache && getCache(cacheKey);
  if (cached) return res.json({ ...cached, _fromCache: true });

  try {
    // 1. 全ユーザー取得
    const users = await sqlAll("SELECT id, name FROM users ORDER BY id", []);

    // 2. 必要なログを一括取得（期間内 + 直前の1件）
    const allLogs = await sqlAll(
      `SELECT user_id, date_ymd, coins, spent, gacha FROM coin_logs
       WHERE date_ymd <= ? ORDER BY user_id, date_ymd ASC`,
      [date]
    );

    // 3. user_id ごとにグループ化
    const logsByUser = new Map();
    for (const log of allLogs) {
      if (!logsByUser.has(log.user_id)) logsByUser.set(log.user_id, []);
      logsByUser.get(log.user_id).push({
        date_ymd: normYMD(log.date_ymd),
        coins: Number(log.coins) || 0,
        spent: Number(log.spent) || 0,
        gacha: Number(log.gacha) || 0
      });
    }

    // 4. 各ユーザーのスコアを計算
    const board = users.map(u => {
      const logs = logsByUser.get(u.id) || [];
      let value = 0;

      if (mode === "raw") {
        // 最新のコイン数
        value = logs.length > 0 ? logs[logs.length - 1].coins : 0;
      } else if (mode === "daily") {
        // 前日比
        const last = logs.length > 0 ? logs[logs.length - 1].coins : 0;
        const prev = logs.length > 1 ? logs[logs.length - 2].coins : 0;
        value = last - prev;
      } else if (mode === "gacha") {
        // 期間内のガチャ回数合計
        const periodLogs = logs.filter(l => l.date_ymd >= startDate && l.date_ymd <= date);
        value = periodLogs.reduce((sum, r) => sum + r.gacha, 0);
      } else if (mode === "period" || mode === "earned") {
        // 期間の1日前からフィルタ（期間最初の日のdiff計算用）
        const dayBefore = addDays(startDate, -1);
        const periodLogs = logs.filter(l => l.date_ymd >= dayBefore && l.date_ymd <= date);
        let prev = null;
        let sum = 0;
        for (const r of periodLogs) {
          if (r.date_ymd < startDate) {
            // 期間前のデータはprevを設定するだけ（sumには加算しない）
            prev = r;
            continue;
          }
          if (prev !== null) {
            const diff = r.coins - prev.coins;
            if (mode === "earned") {
              sum += calcEarned(diff, r.gacha, r.spent);
            } else {
              sum += diff;
            }
          }
          // prev === null の場合は前日データがないので計算不可（何も加算しない）
          prev = r;
        }
        value = sum;
      }

      return { name: u.name, value };
    });

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
     mode=raw|daily|period|earned|gacha（既定: daily）
     periodDays=7（mode=period|earned|gacha の窓幅）
     days=14（系列に含める日数）
     top=5（上位N名）
     date=YYYY-MM-DD（終端日。省略時は lastFinalizedYmd()）
   ※ N+1 問題を解消：全データを2クエリで取得しメモリ上で計算
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
    const skipCache = req.query.skipCache === "true";
    const cached = !skipCache && getCache(cacheKey);
    if (cached) return res.json({ ...cached, _fromCache: true });

    // 1. 全ユーザー取得
    const users = await sqlAll("SELECT id, name FROM users ORDER BY id", []);

    // 2. 全ログを一括取得
    const allLogs = await sqlAll(
      `SELECT user_id, date_ymd, coins, spent, gacha FROM coin_logs
       WHERE date_ymd <= ? ORDER BY user_id, date_ymd ASC`,
      [endYmd]
    );

    // 3. user_id ごとにグループ化
    const logsByUser = new Map();
    for (const log of allLogs) {
      if (!logsByUser.has(log.user_id)) logsByUser.set(log.user_id, []);
      logsByUser.get(log.user_id).push({
        date_ymd: normYMD(log.date_ymd),
        coins: Number(log.coins) || 0,
        spent: Number(log.spent) || 0,
        gacha: Number(log.gacha) || 0
      });
    }

    // 4. 各ユーザーの系列を計算
    const seriesAll = users.map(u => {
      const logs = logsByUser.get(u.id) || [];

      // その日までの最新値（キャリー）
      let idx = 0, last = 0;
      const valuesRaw = [];
      const spentByDate = [];
      const gachaByDate = [];
      const logMap = new Map(logs.map(l => [l.date_ymd, l]));

      for (const d of dates) {
        while (idx < logs.length && logs[idx].date_ymd <= d) {
          last = logs[idx].coins;
          idx++;
        }
        valuesRaw.push(last);
        const logForDate = logMap.get(d);
        spentByDate.push(logForDate ? logForDate.spent : 0);
        gachaByDate.push(logForDate ? logForDate.gacha : 0);
      }

      const valuesDaily = valuesRaw.map((v, i) => (i === 0 ? 0 : v - valuesRaw[i - 1]));
      const valuesPeriod = valuesRaw.map((_, i) => {
        let sum = 0;
        const from = Math.max(0, i - (periodDays - 1));
        for (let j = from; j <= i; j++) sum += j === 0 ? 0 : valuesRaw[j] - valuesRaw[j - 1];
        return sum;
      });
      const valuesEarned = valuesRaw.map((_, i) => {
        let sum = 0;
        const from = Math.max(0, i - (periodDays - 1));
        for (let j = from; j <= i; j++) {
          if (j === 0) continue; // 最初の日は前日データがないのでスキップ
          const diff = valuesRaw[j] - valuesRaw[j - 1];
          sum += calcEarned(diff, gachaByDate[j], spentByDate[j]);
        }
        return sum;
      });

      // ガチャ回数の期間合計
      const valuesGacha = gachaByDate.map((_, i) => {
        let sum = 0;
        const from = Math.max(0, i - (periodDays - 1));
        for (let j = from; j <= i; j++) sum += gachaByDate[j];
        return sum;
      });

      const picked =
        mode === "raw" ? valuesRaw :
        mode === "daily" ? valuesDaily :
        mode === "earned" ? valuesEarned :
        mode === "gacha" ? valuesGacha :
        valuesPeriod;

      return {
        name: u.name,
        points: dates.map((d, i) => ({ date_ymd: d, value: picked[i] || 0 })),
        score: picked[picked.length - 1] || 0,
      };
    });

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

/* ================= 通知機能 API ================= */

// VAPID公開鍵取得
app.get("/api/notifications/vapid-public-key", (_req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: "VAPID not configured" });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// プッシュ通知購読登録
app.post("/api/notifications/subscribe", auth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "invalid subscription data" });
    }

    // 既存の購読を削除（同じendpointがあれば更新）
    await sqlRun("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?", [
      req.user.uid,
      endpoint,
    ]);

    // 新規登録
    if (USE_PG) {
      await sqlRun(
        "INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, now())",
        [req.user.uid, endpoint, keys.p256dh, keys.auth]
      );
    } else {
      await sqlRun(
        "INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)",
        [req.user.uid, endpoint, keys.p256dh, keys.auth, nowISO()]
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error("[subscribe]", e);
    res.status(500).json({ error: "server error" });
  }
});

// プッシュ通知購読解除
app.post("/api/notifications/unsubscribe", auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: "endpoint required" });
    }

    await sqlRun("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?", [
      req.user.uid,
      endpoint,
    ]);

    res.json({ success: true });
  } catch (e) {
    console.error("[unsubscribe]", e);
    res.status(500).json({ error: "server error" });
  }
});

// 通知設定取得
app.get("/api/notifications/settings", auth, async (req, res) => {
  try {
    let settings = await sqlGet(
      "SELECT daily_reminder, reminder_time FROM notification_settings WHERE user_id=?",
      [req.user.uid]
    );

    if (!settings) {
      // デフォルト値を返す
      settings = {
        daily_reminder: USE_PG ? false : 0,
        reminder_time: "20:00",
      };
    }

    // SQLiteの場合は0/1をbooleanに変換
    const daily_reminder = USE_PG ? !!settings.daily_reminder : !!settings.daily_reminder;

    res.json({
      daily_reminder,
      reminder_time: settings.reminder_time,
    });
  } catch (e) {
    console.error("[get settings]", e);
    res.status(500).json({ error: "server error" });
  }
});

// 通知設定更新
app.post("/api/notifications/settings", auth, async (req, res) => {
  try {
    const { daily_reminder, reminder_time } = req.body;

    // バリデーション
    if (typeof daily_reminder !== "boolean") {
      return res.status(400).json({ error: "daily_reminder must be boolean" });
    }
    if (typeof reminder_time !== "string" || !/^\d{2}:\d{2}$/.test(reminder_time)) {
      return res.status(400).json({ error: "reminder_time must be HH:mm format" });
    }

    const existing = await sqlGet(
      "SELECT user_id FROM notification_settings WHERE user_id=?",
      [req.user.uid]
    );

    if (existing) {
      // 更新
      if (USE_PG) {
        await sqlRun(
          "UPDATE notification_settings SET daily_reminder=?, reminder_time=?, updated_at=now() WHERE user_id=?",
          [daily_reminder, reminder_time, req.user.uid]
        );
      } else {
        await sqlRun(
          "UPDATE notification_settings SET daily_reminder=?, reminder_time=?, updated_at=? WHERE user_id=?",
          [daily_reminder ? 1 : 0, reminder_time, nowISO(), req.user.uid]
        );
      }
    } else {
      // 新規作成
      if (USE_PG) {
        await sqlRun(
          "INSERT INTO notification_settings(user_id, daily_reminder, reminder_time, created_at, updated_at) VALUES (?, ?, ?, now(), now())",
          [req.user.uid, daily_reminder, reminder_time]
        );
      } else {
        const now = nowISO();
        await sqlRun(
          "INSERT INTO notification_settings(user_id, daily_reminder, reminder_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          [req.user.uid, daily_reminder ? 1 : 0, reminder_time, now, now]
        );
      }
    }

    res.json({ success: true, daily_reminder, reminder_time });
  } catch (e) {
    console.error("[update settings]", e);
    res.status(500).json({ error: "server error" });
  }
});

// テスト通知送信（開発用）
app.post("/api/notifications/test", auth, async (req, res) => {
  try {
    const subscriptions = await sqlAll(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?",
      [req.user.uid]
    );

    if (subscriptions.length === 0) {
      return res.status(404).json({ error: "no subscriptions found" });
    }

    const payload = JSON.stringify({
      title: "テスト通知",
      body: "これはテスト通知です。通知機能が正常に動作しています！",
      icon: "/tsumu/icon-192.png",
      badge: "/tsumu/badge-72.png",
      tag: "test-notification",
      url: "/tsumu/",
    });

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
        sent++;
      } catch (e) {
        console.error("[test notification failed]", e);
        failed++;
        // 410 Gone = 購読が無効になっている場合は削除
        if (e.statusCode === 410) {
          await sqlRun("DELETE FROM push_subscriptions WHERE endpoint=?", [sub.endpoint]);
        }
      }
    }

    res.json({ sent, failed, total: subscriptions.length });
  } catch (e) {
    console.error("[test notification]", e);
    res.status(500).json({ error: "server error" });
  }
});

/* ===================== 起動 ===================== */
app.listen(PORT, () =>
  console.log(
    `API server listening on :${PORT} (DB=${USE_PG ? "Postgres" : "SQLite"})`
  )
);
