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
    dailyEarned: 55000,   // 1日あたりの平均稼ぎ
    earnedVariance: 20000, // 稼ぎのランダム変動幅
    spentChance: 0.3,      // コインを使う確率
    spentMin: 5000,        // 使う額の最小値
    spentMax: 30000        // 使う額の最大値
  },
  {
    name: "テストユーザー2",
    pin: "1234",
    baseCoins: 300000,
    dailyEarned: 35000,
    earnedVariance: 15000,
    spentChance: 0.4,
    spentMin: 3000,
    spentMax: 20000
  },
  {
    name: "テストユーザー3",
    pin: "1234",
    baseCoins: 800000,
    dailyEarned: 90000,
    earnedVariance: 30000,
    spentChance: 0.2,
    spentMin: 10000,
    spentMax: 50000
  },
  {
    name: "あなた",
    pin: "1234",
    baseCoins: 450000,
    dailyEarned: 50000,
    earnedVariance: 18000,
    spentChance: 0.35,
    spentMin: 5000,
    spentMax: 25000
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
    let totalEarned = 0;
    let totalSpent = 0;

    for (let i = 29; i >= 0; i--) {
      const date = addDays(today, -i);

      // 稼いだ額（ランダム変動あり）
      const earnedVariation = Math.floor((Math.random() - 0.5) * 2 * testUser.earnedVariance);
      const earned = Math.max(0, testUser.dailyEarned + earnedVariation);

      // 使った額（確率で発生）
      let spent = 0;
      if (Math.random() < testUser.spentChance) {
        spent = Math.floor(testUser.spentMin + Math.random() * (testUser.spentMax - testUser.spentMin));
      }

      // コイン数を計算: 前日 + 稼いだ額 - 使った額
      currentCoins = currentCoins + earned - spent;

      // 負の値にならないように
      currentCoins = Math.max(0, currentCoins);

      records.push({ date, coins: currentCoins, spent });
      totalEarned += earned;
      totalSpent += spent;
    }

    // データベースに挿入
    const insertStmt = db.prepare(
      "INSERT INTO coin_logs(user_id, date_ymd, coins, spent, created_at) VALUES (?, ?, ?, ?, ?)"
    );

    for (const record of records) {
      insertStmt.run(userId, record.date, record.coins, record.spent, new Date().toISOString());
    }

    console.log(`   📊 ${records.length}日分のデータを作成しました`);
    console.log(`   💰 最新のコイン数: ${currentCoins.toLocaleString()}`);
    console.log(`   📈 30日間の稼ぎ合計: ${totalEarned.toLocaleString()}`);
    console.log(`   📉 30日間の使用合計: ${totalSpent.toLocaleString()}`);
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
