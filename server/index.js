// server/index.js
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

// ================== 基本設定 ==================
const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DB_PATH = process.env.DB_PATH || "./coins.db";
const PORT = process.env.PORT || 3001;
const TZ = "Asia/Tokyo";

// ================== CORS（プリフライト含め強化） ==================
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
    !origin ||
    ALLOWLIST.includes(origin) ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1");
  cb(null, {
    origin: ok,
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Timezone"],
    optionsSuccessStatus: 204,
  });
};

app.use(cors(corsDelegate));
app.options("*", cors(corsDelegate)); // ← OPTIONSにも必ず応答

// ================== DB ==================
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
  date_ymd TEXT NOT NULL,
  coins INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, date_ymd),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// ================== Utils ==================
const nowISO = () => new Date().toISOString();
const jstNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
const jstDateYMD = (d = new Date()) =>
  new Date(d.toLocaleString("en-US", { timeZone: TZ }))
    .toISOString()
    .slice(0, 10);

const addDays = (dateYmd, n) => {
  const d = new Date(dateYmd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const listDates = (startYmd, endYmd) => {
  const out = [];
  let d = startYmd;
  while (d <= endYmd) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
};

// 23:59までは「今日」は暫定。締切済みの最終確定日はそれ以前
const lastFinalizedYmd = () => {
  const now = jstNow();
  const h = now.getHours(), m = now.getMinutes();
  if (h < 23 || (h === 23 && m < 59)) {
    const today = now.toISOString().slice(0, 10);
    return addDays(today, -1);
  }
  return now.toISOString().slice(0, 10);
};

const issueToken = (user) =>
  jwt.sign({ uid: user.id, name: user.name }, JWT_SECRET, { expiresIn: "30d" });

const auth = (req, _res, next) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return next("route");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { uid, name }
    next();
  } catch {
    next("route");
  }
};

// ================== API ==================

// 健康チェック
app.get("/", (_req, res) => res.json({ ok: true }));

// 追加: クライアントの基準日・締切情報
app.get("/api/status", (_req, res) => {
  const today = jstDateYMD();
  const now = jstNow();
  const canEditToday = !(now.getHours() === 23 && now.getMinutes() >= 59);
  res.json({
    today_ymd: today,
    canEditToday,
    board_date_ymd: canEditToday ? today : today, // 表示用。必要に応じて調整
  });
});

// 新規登録
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
  if (!bcrypt.compareSync(pin, user.pin_hash))
    return res.status(401).json({ error: "invalid pin" });
  res.json({ token: issueToken(user), user: { id: user.id, name: user.name } });
});

// 自分
app.get("/api/me", auth, (req, res) => {
  res.json({ id: req.user.uid, name: req.user.name });
});

// コイン登録/更新（当日JST）
app.post("/api/coins", auth, (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0)
    return res.status(400).json({ error: "coins must be non-negative integer" });
  const date_ymd = (req.body?.date || jstDateYMD()).slice(0, 10);

  const existing = db
    .prepare("SELECT id FROM coin_logs WHERE user_id=? AND date_ymd=?")
    .get(req.user.uid, date_ymd);

  if (existing) {
    db.prepare("UPDATE coin_logs SET coins=?, created_at=? WHERE id=?").run(
      coins,
      nowISO(),
      existing.id
    );
  } else {
    db.prepare(
      "INSERT INTO coin_logs(user_id, date_ymd, coins, created_at) VALUES (?, ?, ?, ?)"
    ).run(req.user.uid, date_ymd, coins, nowISO());
  }

  const prev = db
    .prepare(
      "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd < ? ORDER BY date_ymd DESC LIMIT 1"
    )
    .get(req.user.uid, date_ymd);

  res.json({ date_ymd, coins, diff: prev ? coins - prev.coins : 0 });
});

// 自分の履歴（最新→過去）
app.get("/api/coins", auth, (req, res) => {
  const days = Math.min(Number(req.query.days || 30), 365);
  const rows = db
    .prepare(
      "SELECT date_ymd, coins FROM coin_logs WHERE user_id=? ORDER BY date_ymd DESC LIMIT ?"
    )
    .all(req.user.uid, days);

  const withDiff = rows.map((r, i) => ({
    ...r,
    diff: i === rows.length - 1 ? 0 : r.coins - rows[i + 1].coins,
  }));
  res.json(withDiff);
});

// ================== ランキング（数値） ==================
/*
  GET /api/board?date=YYYY-MM-DD&mode=raw|daily|period&periodDays=7
  - raw: 指定日までの最新記録値（コイン数）
  - daily: 指定日の前日比
  - period: 期間増減（指定日までと、起点日前日の差分）
*/
app.get("/api/board", (req, res) => {
  const date = (req.query.date || jstDateYMD()).slice(0, 10);
  const mode = String(req.query.mode || "daily").toLowerCase(); // raw|daily|period
  const periodDays = Math.max(1, Number(req.query.periodDays || 7));
  const startDate = addDays(date, -(periodDays - 1));

  const users = db.prepare("SELECT id, name FROM users").all();

  const board = users
    .map((u) => {
      const lastOnOrBefore = db
        .prepare(
          "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd <= ? ORDER BY date_ymd DESC LIMIT 1"
        )
        .get(u.id, date);
      const prevBeforeDate = db
        .prepare(
          "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd < ? ORDER BY date_ymd DESC LIMIT 1"
        )
        .get(u.id, date);
      const beforeWindow = db
        .prepare(
          "SELECT coins FROM coin_logs WHERE user_id=? AND date_ymd < ? ORDER BY date_ymd DESC LIMIT 1"
        )
        .get(u.id, startDate);

      const vLast = lastOnOrBefore?.coins || 0;
      const vPrev = prevBeforeDate?.coins || 0;
      const vBase = beforeWindow?.coins || 0;

      let value = 0;
      if (mode === "raw") value = vLast;
      else if (mode === "daily") value = vLast - vPrev;
      else value = vLast - vBase; // period = 期間増減（±そのまま）

      return { name: u.name, value };
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  res.json({ date_ymd: date, mode, periodDays, board });
});

// ================== ランキング（折れ線グラフ用データ） ==================
/*
  GET /api/board_series?mode=daily&periodDays=7&days=14&top=5&date=YYYY-MM-DD
  返却: { date_ymd, mode, periodDays, days, top, series: [{name, points:[{date_ymd, value}]}] }
*/
app.get("/api/board_series", (req, res) => {
  try {
    const mode = (req.query.mode || "daily").toLowerCase(); // raw|daily|period
    const periodDays = Math.max(1, Number(req.query.periodDays || 7));
    const days = Math.max(1, Math.min(90, Number(req.query.days || 14)));
    const top = Math.max(1, Math.min(50, Number(req.query.top || 5)));
    const endYmd = (req.query.date || lastFinalizedYmd()).slice(0, 10);
    const startYmd = addDays(endYmd, -(days - 1));
    const dates = listDates(startYmd, endYmd);

    const users = db.prepare("SELECT id, name FROM users ORDER BY id").all();

    const seriesAll = users.map((u) => {
      const logs = db
        .prepare(
          "SELECT date_ymd, coins FROM coin_logs WHERE user_id=? AND date_ymd <= ? ORDER BY date_ymd ASC"
        )
        .all(u.id, endYmd);

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

      // 前日差
      const valuesDaily = valuesRaw.map((v, i) => (i === 0 ? 0 : v - valuesRaw[i - 1]));

      // ローリング期間合計（±合算）
      const valuesPeriod = valuesRaw.map((_, i) => {
        let sum = 0;
        const from = Math.max(0, i - (periodDays - 1));
        for (let j = from; j <= i; j++) sum += j === 0 ? 0 : valuesRaw[j] - valuesRaw[j - 1];
        return sum;
      });

      const pick = (m) => (m === "raw" ? valuesRaw : m === "daily" ? valuesDaily : valuesPeriod);
      const picked = pick(mode);

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

    res.json({ date_ymd: endYmd, mode, periodDays, days: dates.length, top, series: topSeries });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.listen(PORT, () => console.log(`API server listening on :${PORT}`));
