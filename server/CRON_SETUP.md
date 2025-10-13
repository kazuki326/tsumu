# 通知バッチ処理のセットアップ

## 概要
`send-notifications.js`を定期実行して、ユーザーが設定した時刻に日次リマインダーを送信します。

## 実行方法

### 手動実行（テスト用）
```bash
cd server
npm run send-notifications
```

## 定期実行の設定

### 1. cron（Linux/Mac）

crontabを編集:
```bash
crontab -e
```

以下を追加（5分ごとに実行）:
```cron
*/5 * * * * cd /path/to/tsumu/server && /usr/bin/node send-notifications.js >> /var/log/tsumu-notifications.log 2>&1
```

または、毎時0分に実行:
```cron
0 * * * * cd /path/to/tsumu/server && /usr/bin/node send-notifications.js >> /var/log/tsumu-notifications.log 2>&1
```

### 2. GitHub Actions（無料枠で利用可能）

`.github/workflows/send-notifications.yml`を作成:

```yaml
name: Send Notifications

on:
  schedule:
    # 毎時0分に実行（UTC）
    - cron: '0 * * * *'
  workflow_dispatch: # 手動実行も可能

jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd server && npm install
      - run: cd server && npm run send-notifications
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          VAPID_PUBLIC_KEY: ${{ secrets.VAPID_PUBLIC_KEY }}
          VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY }}
```

### 3. Render Cron Jobs

Render.comでCron Jobsを作成:

1. Renderダッシュボードで「New +」→「Cron Job」を選択
2. 設定:
   - **Name**: tsumu-notifications
   - **Command**: `cd server && npm run send-notifications`
   - **Schedule**: `0 * * * *` (毎時0分)
   - **Environment**: 本番環境と同じ環境変数を設定

### 4. Node.js スケジューラー（node-cron）

サーバーと同じプロセス内で実行したい場合:

```bash
cd server
npm install node-cron
```

`index.js`に追加:
```javascript
import cron from 'node-cron';
import { exec } from 'child_process';

// 毎時0分に実行
cron.schedule('0 * * * *', () => {
  console.log('[cron] Running notification batch');
  exec('node send-notifications.js', (error, stdout, stderr) => {
    if (error) {
      console.error('[cron] Error:', error);
      return;
    }
    console.log('[cron] Output:', stdout);
    if (stderr) console.error('[cron] Stderr:', stderr);
  });
});
```

## 環境変数

バッチ処理には以下の環境変数が必要です:

```bash
# データベース
DATABASE_URL=postgresql://... # PostgreSQLの場合
# または
DB_PATH=./coins.db # SQLiteの場合

# VAPID
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-email@example.com
```

## 実行頻度の推奨

- **5分ごと**: `*/5 * * * *` - 時刻指定の精度が高い（推奨）
- **毎時**: `0 * * * *` - サーバー負荷が少ない
- **15分ごと**: `*/15 * * * *` - バランス型

## ログ確認

```bash
# cronログ（Linux）
tail -f /var/log/tsumu-notifications.log

# Renderログ
Renderダッシュボード → Cron Job → Logs
```

## トラブルシューティング

### 通知が送信されない場合

1. バッチ処理が実行されているか確認
2. 環境変数が正しく設定されているか確認
3. VAPIDキーが正しいか確認
4. ユーザーが通知設定を有効にしているか確認
5. プッシュ購読が有効か確認（410エラーの場合は再購読が必要）

### デバッグモード

スクリプトに詳細ログを追加:
```javascript
console.log('Settings:', settings);
console.log('Current time:', currentTime);
```
