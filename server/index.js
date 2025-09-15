// server/index.js
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// ========= 基本設定 =========
const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PORT = process.env.PORT || 3001;
const TZ = "Asia/Tokyo";

// ========= CORS（強化・全ルート＆OPTIONS） =========
const ALLOWLIST = [
  "https://kazuki326.github.io", // GitHub Pages
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
const corsDelegate = (req, cb) => {
  const origin = req.header("Origin") || "";
  const ok =
    !origin ||
    ALLOWLIST.includes(origin) ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1");

  cb(null, {
    origin: ok,
    credentials: false,
    methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization","X-Timezone"],
    optionsSuccessStatus: 204
  });
};
app.use(cors(corsDelegate));
app.options("*", cors(corsDelegate));

// ========= 時刻ユーティリティ =========
const nowISO = () => new Date().toISOString();
const jstNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
const jstDateYMD = (d = new Date()) =>
  new Date(d.toLocaleString("en-US", { timeZone: TZ })).toISOString().slice(0, 10);

const addDays = (ymd, n) => {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const listDates = (startYmd, endYmd) => {
  const out = [];
  let d = startYmd;
  while (d <= endYmd) { out.push(d); d = addDays(d, 1); }
  return out;
};
const lastFinalizedYmd = () => {
  const now = jstNow();
  const h = now.getHours(), m = now.getMinutes();
  if (h < 23 || (h === 23 && m < 59)) return addDays(now.toISOString().slice(0,10), -1);
  return now.toISOString().slice(0,10);
};

// ========= DB 抽象レイヤー（Postgres 優先 / SQLite フォールバック） =========
const DATABASE_URL = process.env.DATABASE_URL || "";
const USE_PG = !!DATABASE_URL;

let db = null;           // SQLite のとき: better-sqlite3 のインスタンス
let pgPool = null;       // Postgres のとき: pg.Pool
let DB_PATH = process.env.DB_PATH || "./coins.db";

// Postgres 接続
if (USE_PG) {
  // Render Postgres は SSL 必須なことが多い
  const { Pool } = await import("pg");
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  // テーブル作成（IF NOT EXISTS）
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_ci ON users (lower(name));
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
  // SQLite（ローカル用フォールバック）
  let Database;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch (e) {
    console.error("better-sqlite3 が見つかりません。ローカルで SQLite を使う場合は `npm i` で optional を入れるか、DATABASE_URL を設定して Postgres を使ってください。");
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

// ? を $1, $2 … に変換（PG用）
const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

// SELECT 1行
const sqlGet = async (sql, params = []) => {
  if (USE_PG) {
    const { rows } = await pgPool.query(toPg(sql), params);
    return rows[0] || null;
  } else {
    return db.prepare(sql).get(...params) || null;
  }
};
// SELECT 複数行
const sqlAll = async (sql, params = []) => {
  if (USE_PG) {
    const { rows } = await pgPool.query(toPg(sql), params);
    return rows;
  } else {
    return db.prepare(sql).all(...params);
  }
};
// 実行（INSERT/UPDATE/DELETE）
const sqlRun = async (sql, params = []) => {
  if (USE_PG) {
    const r = await pgPool.query(toPg(sql), params);
    return { changes: r.rowCount };
  } else {
    const info = db.prepare(sql).run(...params);
    return { changes: info.changes, lastID: info.lastInsertRowid };
  }
};

// ========= Auth =========
const issueToken = (user) =>
  jwt.sign({ uid: user.id, name: user.name }, JWT_SECRET, { expiresIn: "30d" });

const auth = (req, res, next) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { uid, name }
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
};

// ========= API =========

// ヘルス
app.get("/", (_req, res) => res.json({ ok: true }));

// ステータス（基準日など）
app.get("/api/status", (_req, res) => {
  const today = jstDateYMD();
  const now = jstNow();
  const canEditToday = !(now.getHours() === 23 && now.getMinutes() >= 59);
  res.json({ today_ymd: today, canEditToday, board_date_ymd: canEditToday ? today : today });
});

// 新規登録
app.post("/api/register", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pin = String(req.body?.pin || "").trim();
  if (!name || pin.length < 4) return res.status(400).json({ error: "name and 4+ digit pin required" });
  const pin_hash = bcrypt.hashSync(pin, 10);
  try {
    if (USE_PG) {
      const row = await sqlGet(
        "INSERT INTO users(name, pin_hash, created_at) VALUES (?, ?, now()) RETURNING id, name",
        [name, pin_hash]
      );
      res.json({ token: issueToken(row), user: row });
    } else {
      const r = await sqlRun("INSERT INTO users(name, pin_hash, created_at) VALUES (?, ?, ?)", [name, pin_hash, nowISO()]);
      const user = await sqlGet("SELECT id, name FROM users WHERE id = ?", [r.lastID]);
      res.json({ token: issueToken(user), user });
    }
  } catch (e) {
    const msg = String(e).toLowerCase();
    if (msg.includes("unique")) return res.status(409).json({ error: "name already taken" });
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
  if (!bcrypt.compareSync(pin, user.pin_hash)) return res.status(401).json({ error: "invalid pin" });
  res.json({ token: issueToken(user), user: { id: user.id, name: user.name } });
});

// 自分
app.get("/api/me", auth, (req, res) => {
  res.json({ id: req.user.uid, name: req.user.name });
});

// コイン登録/更新（当日JST）
app.post("/api/coins", auth, async (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0) return res.status(400).json({ error: "coins must be non-negative integer" });
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
      const ex = await sqlGet("SELECT id FROM coin_logs WHERE user_id=? AND date_ymd=?", [req.user.uid, date_ymd]);
      if (ex) {
        await sqlRun("UPDATE coin_logs SET coins=?, created_at=? WHERE id=?", [coins, nowISO(), ex.id]);
      } else {
        await sqlRun("INSERT INTO coin_logs(user_id, date_ymd, coins, created_at) VALUES (?, ?, ?, ?)", [req.user.uid, date_ymd, coins, nowISO()]);
      }
    }

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

// 自分の履歴
app.get("/api/coins", auth, async (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 365);
  const rows = await sqlAll(
    "SELECT date_ymd, coins FROM coin_logs WHERE user_id=? ORDER BY date_ymd DESC LIMIT ?",
    [req.user.uid, days]
  );
  const withDiff = rows.map((r, i) => ({
    ...r,
    date_ymd: typeof r.date_ymd === "string" ? r.date_ymd : (r.date_ymd?.toISOString?.().slice(0,10) || r.date_ymd),
    diff: i === rows.length - 1 ? 0 : r.coins - rows[i + 1].coins
  }));
  res.json(withDiff);
});

// ランキング（数値）: /api/board?date=YYYY-MM-DD&mode=raw|daily|period&periodDays=7
app.get("/api/board", async (req, res) => {
  const date = (req.query.date || jstDateYMD()).slice(0, 10);
  const mode = String(req.query.mode || "daily").toLowerCase(); // raw|daily|period
  const periodDays = Math.max(1, Number(req.query.periodDays || 7));
  const startDate = addDays(date, -(periodDays - 1));

  try {
    const users = await sqlAll("SELECT id, name FROM users ORDER BY id", []);
    const board = [];
    for (const u of users) {
      const lastOnOrBefore = await sqlGet(
        "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd <= ? ORDER BY date_ymd DESC LIMIT 1",
        [u.id, date]
      );
      const prevBeforeDate = await sqlGet(
        "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd < ? ORDER BY date_ymd DESC LIMIT 1",
        [u.id, date]
      );
      const beforeWindow = await sqlGet(
        "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd < ? ORDER BY date_ymd DESC LIMIT 1",
        [u.id, startDate]
      );
      const vLast = lastOnOrBefore?.coins || 0;
      const vPrev = prevBeforeDate?.coins || 0;
      const vBase = beforeWindow?.coins || 0;
      const value = mode === "raw" ? vLast : mode === "daily" ? vLast - vPrev : vLast - vBase;
      board.push({ name: u.name, value });
    }
    board.sort((a,b)=> b.value - a.value || a.name.localeCompare(b.name));
    res.json({ date_ymd: date, mode, periodDays, board });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// ランキング（折れ線グラフ）: /api/board_series
app.get("/api/board_series", async (req, res) => {
  try {
    const mode = (req.query.mode || "daily").toLowerCase(); // raw|daily|period
    const periodDays = Math.max(1, Number(req.query.periodDays || 7));
    const days = Math.max(1, Math.min(90, Number(req.query.days || 14)));
    const top = Math.max(1, Math.min(50, Number(req.query.top || 5)));
    const endYmd = (req.query.date || lastFinalizedYmd()).slice(0,10);
    const startYmd = addDays(endYmd, -(days - 1));
    const dates = listDates(startYmd, endYmd);

    const users = await sqlAll("SELECT id, name FROM users ORDER BY id", []);
    const seriesAll = [];

    for (const u of users) {
      const logs = await sqlAll(
        "SELECT date_ymd, coins FROM coin_logs WHERE user_id=? AND date_ymd <= ? ORDER BY date_ymd ASC",
        [u.id, endYmd]
      );
      // その日までの最新値（キャリー）
      let idx = 0, last = 0;
      const valuesRaw = dates.map((d) => {
        while (idx < logs.length && (typeof logs[idx].date_ymd === "string" ? logs[idx].date_ymd : logs[idx].date_ymd.toISOString().slice(0,10)) <= d) {
          last = logs[idx].coins;
          idx++;
        }
        return last;
      });
      const valuesDaily = valuesRaw.map((v,i)=> i===0 ? 0 : v - valuesRaw[i-1]);
      const valuesPeriod = valuesRaw.map((_,i)=>{
        let sum = 0;
        const from = Math.max(0, i - (periodDays - 1));
        for (let j = from; j <= i; j++) sum += j===0 ? 0 : valuesRaw[j] - valuesRaw[j-1];
        return sum;
      });
      const pick = mode === "raw" ? valuesRaw : mode === "daily" ? valuesDaily : valuesPeriod;
      seriesAll.push({
        name: u.name,
        points: dates.map((d,i)=> ({ date_ymd: d, value: pick[i] || 0 })),
        score: pick[pick.length-1] || 0
      });
    }

    const topSeries = seriesAll
      .sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, top)
      .map(({name, points})=>({name, points}));

    res.json({ date_ymd: endYmd, mode, periodDays, days: dates.length, top, series: topSeries });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.listen(PORT, () => console.log(`API server listening on :${PORT} (DB=${USE_PG ? "Postgres" : "SQLite"})`));
