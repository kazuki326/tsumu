// server/send-notifications.js
// 通知送信バッチ処理
// 定期実行（cron等）で呼び出すことを想定
import webpush from "web-push";

const DATABASE_URL = process.env.DATABASE_URL || "";
const USE_PG = !!DATABASE_URL;
const DB_PATH = process.env.DB_PATH || "./coins.db";

// VAPID設定
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:noreply@tsumu-coins.app";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("VAPID keys are not configured");
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/* ================= DB 抽象化 ================= */
let db = null;
let pgPool = null;

if (USE_PG) {
  const { Pool } = await import("pg");
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  let Database;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch (e) {
    console.error("better-sqlite3 not found");
    process.exit(1);
  }
  db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
}

const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

const sqlAll = async (sql, params = []) => {
  if (USE_PG) {
    const { rows } = await pgPool.query(toPg(sql), params);
    return rows;
  }
  return db.prepare(sql).all(...params);
};

const sqlRun = async (sql, params = []) => {
  if (USE_PG) {
    const r = await pgPool.query(toPg(sql), params);
    return { changes: r.rowCount };
  }
  const info = db.prepare(sql).run(...params);
  return { changes: info.changes };
};

/* ================= 日付ユーティリティ ================= */
const jstNow = () => {
  const TZ = "Asia/Tokyo";
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
};

const jstDateYMD = (d = new Date()) => {
  const TZ = "Asia/Tokyo";
  return new Date(d.toLocaleString("en-US", { timeZone: TZ }))
    .toISOString()
    .slice(0, 10);
};

/* ================= メイン処理 ================= */
async function sendDailyReminders() {
  const now = jstNow();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  const today = jstDateYMD();

  console.log(`[${new Date().toISOString()}] Checking notifications for ${currentTime}`);

  // 通知設定を取得（daily_reminder=trueで、reminder_timeが現在時刻±5分以内）
  const settingsQuery = USE_PG
    ? `SELECT ns.user_id, ns.reminder_time, u.name
       FROM notification_settings ns
       JOIN users u ON ns.user_id = u.id
       WHERE ns.daily_reminder = true`
    : `SELECT ns.user_id, ns.reminder_time, u.name
       FROM notification_settings ns
       JOIN users u ON ns.user_id = u.id
       WHERE ns.daily_reminder = 1`;

  const settings = await sqlAll(settingsQuery, []);

  console.log(`  Found ${settings.length} users with daily reminders enabled`);

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const setting of settings) {
    const reminderTime = setting.reminder_time;
    const currentHour = currentTime.split(':')[0];
    const reminderHour = reminderTime.split(':')[0];

    // 時刻が完全一致するかチェック（時のみ）
    if (currentHour !== reminderHour) {
      console.log(`  Skipping ${setting.name} (reminder time ${reminderTime} != current ${currentTime})`);
      totalSkipped++;
      continue;
    }

    console.log(`  Processing ${setting.name} (reminder time matches: ${reminderTime})`);

    // 今日すでに記録しているかチェック
    const hasRecordToday = await sqlAll(
      "SELECT id FROM coin_logs WHERE user_id=? AND date_ymd=?",
      [setting.user_id, today]
    );

    // すでに記録済みの場合はスキップ
    if (hasRecordToday.length > 0) {
      console.log(`  Skipping ${setting.name} (already recorded today)`);
      totalSkipped++;
      continue;
    }

    // プッシュ購読を取得
    const subscriptions = await sqlAll(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?",
      [setting.user_id]
    );

    if (subscriptions.length === 0) {
      console.log(`  No subscriptions for ${setting.name}`);
      totalSkipped++;
      continue;
    }

    console.log(`  Found ${subscriptions.length} subscription(s) for ${setting.name}`);

    const payload = JSON.stringify({
      title: "TSUMU COINS - リマインダー",
      body: "今日のコインを記録しましょう！",
      icon: "/tsumu/icon-192.png",
      badge: "/tsumu/badge-72.png",
      tag: "daily-reminder",
      url: "/tsumu/",
    });

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
        totalSent++;
        console.log(`  ✓ Sent to ${setting.name}`);
      } catch (e) {
        totalFailed++;
        console.error(`  ✗ Failed to send to ${setting.name}:`, e.message);

        // 410 Gone = 購読が無効になっている場合は削除
        if (e.statusCode === 410) {
          await sqlRun("DELETE FROM push_subscriptions WHERE endpoint=?", [sub.endpoint]);
          console.log(`    Removed invalid subscription`);
        }
      }
    }
  }

  console.log(`[${new Date().toISOString()}] Batch complete: sent=${totalSent}, failed=${totalFailed}, skipped=${totalSkipped}`);

  if (USE_PG) {
    await pgPool.end();
  } else {
    db.close();
  }
}

// 時刻が範囲内かチェック（±windowMinutes）
function isWithinTimeWindow(currentTime, targetTime, windowMinutes) {
  const [curH, curM] = currentTime.split(":").map(Number);
  const [tgtH, tgtM] = targetTime.split(":").map(Number);

  const curMinutes = curH * 60 + curM;
  const tgtMinutes = tgtH * 60 + tgtM;
  const diff = Math.abs(curMinutes - tgtMinutes);

  return diff <= windowMinutes;
}

// 実行
sendDailyReminders().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
