// server/seed-local.js
// ローカル環境（SQLite）用のテストデータ作成スクリプト

import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const DB_PATH = process.env.DB_PATH || "./coins.db";

console.log("🌱 ローカル環境にテストデータを作成します...");
console.log(`📁 データベース: ${DB_PATH}\n`);

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

// 今日の日付（JST）
const jstDateYMD = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return d.toISOString().slice(0, 10);
};

// 日付計算
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

const today = jstDateYMD();

// テストユーザーデータ
const testUsers = [
  {
    name: "テストユーザー1",
    pin: "1234",
    baseCoins: 500000,
    dailyGrowth: 50000, // 1日あたりの平均増加量
    variance: 20000     // ランダムな変動幅
  },
  {
    name: "テストユーザー2",
    pin: "1234",
    baseCoins: 300000,
    dailyGrowth: 30000,
    variance: 15000
  },
  {
    name: "テストユーザー3",
    pin: "1234",
    baseCoins: 800000,
    dailyGrowth: 80000,
    variance: 30000
  },
  {
    name: "あなた",
    pin: "1234",
    baseCoins: 450000,
    dailyGrowth: 45000,
    variance: 18000
  }
];

try {
  // 既存のテストユーザーのデータを削除（名前が一致する場合）
  const existingUsers = db.prepare("SELECT id, name FROM users").all();
  for (const user of existingUsers) {
    if (testUsers.some(tu => tu.name === user.name)) {
      console.log(`🗑️  既存のユーザー「${user.name}」とそのデータを削除...`);
      db.prepare("DELETE FROM coin_logs WHERE user_id = ?").run(user.id);
      db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(user.id);
      db.prepare("DELETE FROM notification_settings WHERE user_id = ?").run(user.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    }
  }

  // テストユーザーとデータを作成
  for (const testUser of testUsers) {
    console.log(`\n👤 ユーザー「${testUser.name}」を作成中...`);

    const pinHash = bcrypt.hashSync(testUser.pin, 10);
    const result = db.prepare(
      "INSERT INTO users(name, pin_hash, created_at) VALUES (?, ?, ?)"
    ).run(testUser.name, pinHash, new Date().toISOString());

    const userId = result.lastInsertRowid;
    console.log(`   ✅ ユーザーID: ${userId}`);
    console.log(`   🔑 PIN: ${testUser.pin}`);

    // 過去30日分のデータを生成
    let currentCoins = testUser.baseCoins;
    const records = [];

    for (let i = 29; i >= 0; i--) {
      const date = addDays(today, -i);

      // ランダムな変動を追加（±variance）
      const randomChange = Math.floor((Math.random() - 0.5) * 2 * testUser.variance);
      const dailyChange = testUser.dailyGrowth + randomChange;
      currentCoins += dailyChange;

      // 負の値にならないように
      currentCoins = Math.max(0, currentCoins);

      records.push({ date, coins: currentCoins });
    }

    // データベースに挿入
    const insertStmt = db.prepare(
      "INSERT INTO coin_logs(user_id, date_ymd, coins, created_at) VALUES (?, ?, ?, ?)"
    );

    for (const record of records) {
      insertStmt.run(userId, record.date, record.coins, new Date().toISOString());
    }

    console.log(`   📊 ${records.length}日分のデータを作成しました`);
    console.log(`   💰 最新のコイン数: ${currentCoins.toLocaleString()}`);
  }

  console.log("\n" + "=".repeat(50));
  console.log("✨ テストデータの作成が完了しました！");
  console.log("=".repeat(50));
  console.log("\n📝 作成されたテストユーザー:");
  for (const user of testUsers) {
    console.log(`   • ${user.name} (PIN: ${user.pin})`);
  }
  console.log("\n🚀 アプリを起動してログインしてください！");
  console.log("   npm run dev\n");

} catch (error) {
  console.error("❌ エラーが発生しました:", error);
  process.exit(1);
} finally {
  db.close();
}
