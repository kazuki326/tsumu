# 通知機能セットアップガイド

## 🚀 クイックスタート

通知機能を有効にするには、以下の3ステップが必要です：

### ステップ1: VAPIDキーを生成

```bash
cd server
node generate-vapid-keys.js
```

出力例：
```
=================================
VAPID Keys Generated!
=================================

Add these to your .env file:

VAPID_PUBLIC_KEY=BPkpGPg9Io7f1D04KHnN2W3DDRIFrhLA2YO7sBZc85f1-GB_tJvP37P01ETMSdvKXaTgZdVKihSpQAKFWoOO36I
VAPID_PRIVATE_KEY=4DHcOr9-L60xNMT0C-TlQc5BXtKfBKjwZIpU0UjaIR8

=================================
```

### ステップ2: GitHub Secretsに環境変数を設定

1. GitHubリポジトリページを開く
2. **Settings** タブをクリック
3. 左メニューから **Secrets and variables** → **Actions** を選択
4. **New repository secret** をクリックして、以下を1つずつ追加：

| Name | Value |
|------|-------|
| `DATABASE_URL` | PostgreSQLの接続文字列（Renderから取得） |
| `VAPID_PUBLIC_KEY` | ステップ1で生成した公開鍵 |
| `VAPID_PRIVATE_KEY` | ステップ1で生成した秘密鍵 |
| `VAPID_SUBJECT` | `mailto:your-email@example.com` |

**DATABASE_URLの取得方法**:
- Renderダッシュボード → Web Service → Environment → `DATABASE_URL`をコピー

### ステップ3: ワークフローファイルをコミット・プッシュ

```bash
git add .github/workflows/send-notifications.yml
git commit -m "Add notification workflow"
git push
```

これで完了です！GitHub Actionsが5分ごとに自動実行されます。

---

## ✅ 動作確認

### 1. ワークフローが実行されているか確認

1. GitHubリポジトリページを開く
2. **Actions** タブをクリック
3. 左側のワークフロー一覧から「Send Push Notifications」を選択
4. 実行履歴が表示されればOK

### 2. 手動で実行してテスト

1. **Actions** タブ → 「Send Push Notifications」を選択
2. 右上の **Run workflow** ボタンをクリック
3. **Run workflow** を再度クリック
4. 実行が開始され、ログで結果を確認できます

### 3. 実際に通知を受け取ってテスト

1. アプリにログイン
2. マイページ → **通知設定** をクリック
3. **プッシュ通知を有効にする** をクリックして権限を許可
4. **日次リマインダーを受け取る** にチェック
5. **通知時刻** を現在時刻の5分後に設定（例: 現在14:25なら14:30に設定）
6. **設定を保存** をクリック
7. **テスト通知を送信** をクリックして即座にテスト通知が届くか確認
8. 設定した時刻まで待つ（日次リマインダーが届くはず）

---

## 📊 ログの確認方法

### GitHub Actionsのログ

1. GitHubリポジトリ → **Actions** タブ
2. 実行履歴から確認したいワークフローをクリック
3. **send-notifications** ジョブをクリック
4. **Send notifications** ステップを展開してログを確認

**正常時のログ例**:
```
[2025-10-13T05:00:00.123Z] Checking notifications for 14:00
  ✓ Sent to ユーザー名
[2025-10-13T05:00:00.456Z] Batch complete: sent=1, failed=0
```

**通知対象がいない場合**:
```
[2025-10-13T05:00:00.123Z] Checking notifications for 14:00
[2025-10-13T05:00:00.456Z] Batch complete: sent=0, failed=0
```

---

## 🔧 トラブルシューティング

### 通知が届かない場合

#### 1. ワークフローが実行されているか確認
- GitHub Actions → 実行履歴を確認
- エラーが出ていないか確認

#### 2. Secretsが正しく設定されているか確認
- Settings → Secrets and variables → Actions
- 4つのSecretが全て設定されているか確認
- 値にスペースや改行が入っていないか確認

#### 3. 通知設定が有効か確認
- アプリで通知設定を開く
- 「日次リマインダーを受け取る」にチェックが入っているか
- プッシュ通知が「有効」になっているか
- 権限が「許可済み」になっているか

#### 4. 時刻設定が正しいか確認
- バッチ処理は5分ごとに実行されます
- 設定時刻の±5分以内に実行されたバッチが通知を送信します
- 例: 14:30に設定した場合、14:25～14:35の間に実行されたバッチが送信

#### 5. すでに記録済みではないか確認
- 今日すでにコインを記録している場合、通知は送信されません
- これは「記録忘れリマインダー」なので、正常な動作です

#### 6. ブラウザの通知権限を確認
- ブラウザの設定 → サイトの設定 → 通知
- アプリのURLが「許可」になっているか確認

### よくあるエラー

#### "VAPID keys are not configured"
- Secretsに`VAPID_PUBLIC_KEY`と`VAPID_PRIVATE_KEY`が設定されていません
- ステップ2を再確認してください

#### "better-sqlite3 not found" / "DATABASE_URL"関連エラー
- `DATABASE_URL`が設定されていません
- PostgreSQLの接続文字列をSecretsに追加してください

#### "410 Gone"
- プッシュ購読が無効になっています
- アプリで「プッシュ通知を無効にする」→「有効にする」で再購読してください

---

## ⚙️ カスタマイズ

### 実行頻度を変更

`.github/workflows/send-notifications.yml`の`cron`を編集：

```yaml
schedule:
  # 毎時0分に実行
  - cron: '0 * * * *'

  # 15分ごとに実行
  - cron: '*/15 * * * *'

  # 毎日9時、12時、18時に実行（UTC）
  - cron: '0 0,3,9 * * *'  # JSTの9時、12時、18時
```

**注意**: GitHub Actionsのcronは**UTC時刻**です。
- JST = UTC + 9時間
- JST 20:00 = UTC 11:00 → `0 11 * * *`

### 通知メッセージをカスタマイズ

`server/send-notifications.js`の`payload`を編集：

```javascript
const payload = JSON.stringify({
  title: "TSUMU COINS - リマインダー",
  body: "今日のコインを記録しましょう！",  // ← ここを変更
  icon: "/icon-192.png",
  badge: "/badge-72.png",
  tag: "daily-reminder",
  url: "/",
});
```

---

## 🎯 本番環境へのデプロイ

### Renderの環境変数にも設定

GitHub Actionsとは別に、Render Web Serviceの環境変数にも追加してください：

1. Renderダッシュボード → Web Service → Environment
2. 以下を追加：
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`

これにより、テスト通知機能（`POST /api/notifications/test`）が動作します。

---

## 📈 モニタリング

### 通知送信状況を確認

- GitHub Actions → 実行履歴でログを確認
- `sent=X, failed=Y`で送信数・失敗数がわかります

### 定期的なチェック

週に1回程度、以下を確認することをおすすめします：

1. GitHub Actions → 実行履歴でエラーがないか
2. アプリで「テスト通知を送信」が正常に動作するか
3. 実際に通知が届いているか（自分のアカウントで確認）

---

## 💡 ヒント

- **テスト時**: 手動実行（Run workflow）を使うと便利です
- **デバッグ**: GitHub Actionsのログで詳細な実行内容を確認できます
- **iOS**: PWA（ホーム画面に追加）してから通知を有効化してください
- **マルチデバイス**: PC・スマホ両方で購読可能です

---

## 📚 参考資料

- [Web Push API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [GitHub Actions - Scheduled events](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)
- [Service Worker - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

**セットアップが完了したら、このファイルは削除してOKです！**
