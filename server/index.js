import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

const app = express();
app.use(express.json());

// ====== CORS ======

const allowOrigin = (origin) => {
  if (!origin) return true;
  return (
    origin === "https://kazuki326.github.io" ||  // ← Pages のオリジン
    origin.includes("localhost")
  );
};
app.use(
  cors({
    origin: (origin, cb) => cb(null, allowOrigin(origin)),
    credentials: false
  })
);

// ====== 設定 ======
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DB_PATH = process.env.DB_PATH || "./coins.db";
const PORT = process.env.PORT || 3001;
const TZ = "Asia/Tokyo";

// ====== DB ======
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,              -- ユーザー表示名（ユニーク）
  pin_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_ci ON users(lower(name));

CREATE TABLE IF NOT EXISTS coin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date_ymd TEXT NOT NULL,                 -- 'YYYY-MM-DD'（JST）
  coins INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, date_ymd),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// ====== Utils ======
const nowISO = () => new Date().toISOString();
// JSTのYYYY-MM-DD（ズレ防止のためローカル変換→ISO）
const jstDateYMD = (d = new Date()) =>
  new Date(d.toLocaleString("en-US", { timeZone: TZ }))
    .toISOString()
    .slice(0, 10);

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

// ====== API ======

// 健康チェック
app.get("/", (_req, res) => res.json({ ok: true }));

// 新規登録
app.post("/api/register", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const pin = String(req.body?.pin || "").trim();
  if (!name || pin.length < 4) return res.status(400).json({ error: "name and 4+ digit pin required" });
  const pin_hash = bcrypt.hashSync(pin, 10);
  try {
    const info = db
      .prepare("INSERT INTO users(name, pin_hash, created_at) VALUES (?, ?, ?)")
      .run(name, pin_hash, nowISO());
    const user = { id: info.lastInsertRowid, name };
    res.json({ token: issueToken(user), user });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "name already taken" });
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

// 自分
app.get("/api/me", auth, (req, res) => {
  res.json({ id: req.user.uid, name: req.user.name });
});

// コイン登録/更新（デフォルトは当日のJST）
app.post("/api/coins", auth, (req, res) => {
  const coins = Number(req.body?.coins);
  if (!Number.isInteger(coins) || coins < 0) return res.status(400).json({ error: "coins must be non-negative integer" });
  const date_ymd = (req.body?.date || jstDateYMD()).slice(0, 10);

  const existing = db
    .prepare("SELECT id FROM coin_logs WHERE user_id=? AND date_ymd=?")
    .get(req.user.uid, date_ymd);

  if (existing) {
    db.prepare("UPDATE coin_logs SET coins=?, created_at=? WHERE id=?")
      .run(coins, nowISO(), existing.id);
  } else {
    db.prepare("INSERT INTO coin_logs(user_id, date_ymd, coins, created_at) VALUES (?, ?, ?, ?)")
      .run(req.user.uid, date_ymd, coins, nowISO());
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
    .prepare("SELECT date_ymd, coins FROM coin_logs WHERE user_id=? ORDER BY date_ymd DESC LIMIT ?")
    .all(req.user.uid, days);

  const withDiff = rows.map((r, i) => ({
    ...r,
    diff: i === rows.length - 1 ? 0 : r.coins - rows[i + 1].coins
  }));
  res.json(withDiff);
});

// 全体ランキング（指定日の前日比）
app.get("/api/board", (req, res) => {
  const date = (req.query.date || jstDateYMD()).slice(0, 10);
  const rows = db
    .prepare(
      `SELECT u.name, c.coins AS today,
        (SELECT coins FROM coin_logs WHERE user_id=c.user_id AND date_ymd < c.date_ymd ORDER BY date_ymd DESC LIMIT 1) AS prev
       FROM coin_logs c
       JOIN users u ON u.id=c.user_id
       WHERE c.date_ymd=?`
    )
    .all(date);

  const board = rows
    .map((r) => ({ name: r.name, diff: (r.today ?? 0) - (r.prev ?? 0) }))
    .sort((a, b) => b.diff - a.diff);

  res.json({ date_ymd: date, board });
});

app.listen(PORT, () => console.log(`API server listening on :${PORT}`));
