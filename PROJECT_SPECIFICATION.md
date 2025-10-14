# TSUMU COINS - プロジェクト仕様書

## 概要

TSUMU COINSは、日々のコイン数（ポイントや数値）を記録・管理し、ユーザー間でランキングを競うWebアプリケーションです。

**プロジェクト名**: tsumu-coins
**バージョン**: 1.0.0
**作成日**: 2025年（推定）
**最終更新**: ver6.7.4 (プッシュ通知機能完成)

## 技術スタック

### フロントエンド
- **フレームワーク**: React 18.3.1
- **ビルドツール**: Vite 5.4.8
- **言語**: JavaScript (JSX)
- **UI**: カスタムCSS
- **ホスティング**: GitHub Pages (https://kazuki326.github.io)

### バックエンド
- **ランタイム**: Node.js (ES Modules)
- **フレームワーク**: Express 4.19.2
- **言語**: JavaScript
- **認証**: JWT (jsonwebtoken 9.0.2)
- **パスワードハッシュ**: bcryptjs 2.4.3
- **CORS**: cors 2.8.5
- **プッシュ通知**: web-push 3.6.7
- **デプロイ**: Render (render.yaml設定あり)

### データベース
- **本番環境**: PostgreSQL (pg 8.11.3)
- **開発環境**: SQLite (better-sqlite3 9.4.0 - optional dependency)
- **データベース切り替え**: `DATABASE_URL` 環境変数の有無で自動切り替え

## プロジェクト構造

```
tsumu/
├── .github/
│   └── workflows/
│       ├── pages.yml                    # GitHub Pagesデプロイ
│       └── send-notifications.yml       # プッシュ通知定期実行
├── src/                                  # フロントエンドソースコード
│   ├── App.jsx                          # メインアプリケーションコンポーネント
│   ├── App.css                          # メインスタイルシート
│   ├── api.js                           # APIクライアント
│   ├── main.jsx                         # エントリーポイント
│   ├── index.css                        # グローバルスタイル
│   ├── NotificationSettings.jsx         # 通知設定コンポーネント
│   └── assets/                          # 静的アセット
├── server/                               # バックエンドソースコード
│   ├── index.js                         # APIサーバーメインファイル
│   ├── send-notifications.js            # 通知バッチ処理スクリプト
│   ├── generate-vapid-keys.js           # VAPID鍵生成ツール
│   ├── package.json                     # サーバー依存関係
│   ├── coins.db                         # SQLiteデータベース（開発用）
│   ├── CRON_SETUP.md                    # Cron設定ガイド
│   └── .env.example                     # 環境変数テンプレート
├── public/                               # 静的ファイル
│   ├── sw.js                            # Service Worker（通知処理）
│   ├── manifest.json                    # PWAマニフェスト
│   ├── icon-192.png                     # 通知アイコン（192x192）
│   ├── icon-512.png                     # 通知アイコン（512x512）
│   └── badge-72.png                     # 通知バッジ（72x72）
├── package.json                          # フロントエンド依存関係
├── vite.config.js                        # Vite設定
├── render.yaml                           # Renderデプロイ設定
├── index.html                            # HTMLテンプレート
├── coins.db                              # ルートのSQLiteデータベース
├── PROJECT_SPECIFICATION.md              # プロジェクト仕様書（本ファイル）
├── NOTIFICATION_SETUP.md                 # 通知機能セットアップガイド
└── README.md                             # プロジェクトREADME
```

## 主要機能

### 1. ユーザー認証
- **新規登録**: 名前とPIN（4桁以上）でアカウント作成
- **ログイン**: 名前とPINで認証
- **トークン管理**: JWT形式、有効期限30日
- **セキュリティ**: bcryptjsによるPINハッシュ化

### 2. プッシュ通知機能
- **Web Push API**: Service Worker (`public/sw.js`) を使用したブラウザネイティブ通知
- **日次リマインダー**: ユーザーが指定した時刻に「今日のコインを記録しましょう」と通知
- **通知時刻カスタマイズ**: 18:00〜24:00の1時間単位で選択可能
  - 選択肢: 18:00, 19:00, 20:00, 21:00, 22:00, 23:00, 24:00 (深夜0時)
- **スマート通知ロジック**:
  - すでにその日のコインを記録している場合は通知をスキップ
  - 設定時刻（時）と実行時刻（時）が一致した場合のみ送信
- **GitHub Actions自動実行**:
  - 毎日18:00〜24:00（JST）の毎時0分に自動実行
  - `cron: '0 9-15 * * *'` (UTC 9:00-15:00 = JST 18:00-24:00)
  - 手動実行（workflow_dispatch）にも対応
- **プッシュ購読管理**: 通知の有効化/無効化
- **テスト通知**: 設定確認用のテスト通知送信機能（マニュアル実行）
- **マルチデバイス対応**: 複数デバイスでの購読サポート
- **iOS対応**: PWA（ホーム画面追加）経由で利用可能（iOS 16.4+）
- **エラーハンドリング**:
  - 410 Gone（購読無効）を検知して自動的にDBから削除
  - 詳細なログ出力で問題追跡が容易

### 3. コイン記録
- **日次記録**: 毎日のコイン数を記録（0以上の整数）
- **更新可能期間**: 23:59まで当日分を更新可能
- **即時反映**: 記録後、自分の履歴とランキングに即座に反映

### 4. マイページ
- **履歴表示**: 直近14日間の記録を表形式で表示
  - 日付、コイン数、前日比を表示
  - 最新コイン数、7日間増減、30日間増減のサマリー表示
- **入力フォーム**: 今日のコイン数入力
- **ステータス表示**: 現在の日付と編集可否

### 5. ランキングシステム

#### ランキング指標（4種類）
1. **コイン数（最新記録）**: 各ユーザーの最新コイン数でランキング
2. **前日比**: 前の記録からの増減でランキング
3. **7日間増減**: 直近7日間の前日比の総和
4. **30日間増減**: 直近30日間の前日比の総和

#### 表示モード
- **リスト表示**: 数値とバーグラフで視覚化
- **グラフ表示**: 折れ線グラフで上位5名の推移を表示
  - 過去の推移を可視化（14日〜60日分）
  - SVGベースのカスタムグラフコンポーネント

### 6. ルーティング
- **ハッシュベースルーティング**: SPAとして動作
  - `/`: ログインページ
  - `/signup`: 新規登録ページ
  - `/me`: マイページ（要ログイン）
  - `/notifications`: 通知設定ページ（要ログイン）

### 7. キャッシュシステム
- **メモリキャッシュ**: ランキング計算結果を60秒キャッシュ
- **パフォーマンス最適化**: 冷えスタート対策
- **即時更新**: コイン記録時にキャッシュクリア

## データベーススキーマ

### テーブル: users
| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | INTEGER/SERIAL | PRIMARY KEY | ユーザーID |
| name | TEXT | NOT NULL, UNIQUE | ユーザー名（大文字小文字区別なし） |
| pin_hash | TEXT | NOT NULL | PINのハッシュ値 |
| created_at | TEXT/TIMESTAMPTZ | NOT NULL | 作成日時 |

### テーブル: coin_logs
| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | INTEGER/SERIAL | PRIMARY KEY | ログID |
| user_id | INTEGER | NOT NULL, FK | ユーザーID |
| date_ymd | TEXT/DATE | NOT NULL | 記録日（YYYY-MM-DD） |
| coins | INTEGER | NOT NULL | コイン数 |
| created_at | TEXT/TIMESTAMPTZ | NOT NULL | 作成日時 |

**UNIQUE制約**: (user_id, date_ymd) - 1日1ユーザー1レコード

### テーブル: push_subscriptions
| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| id | INTEGER/SERIAL | PRIMARY KEY | 購読ID |
| user_id | INTEGER | NOT NULL, FK | ユーザーID |
| endpoint | TEXT | NOT NULL | プッシュエンドポイントURL |
| p256dh | TEXT | NOT NULL | 暗号化公開鍵 |
| auth | TEXT | NOT NULL | 認証シークレット |
| created_at | TEXT/TIMESTAMPTZ | NOT NULL | 作成日時 |

**UNIQUE制約**: (user_id, endpoint) - 1ユーザー1エンドポイント1レコード

### テーブル: notification_settings
| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
| user_id | INTEGER | PRIMARY KEY, FK | ユーザーID |
| daily_reminder | INTEGER/BOOLEAN | NOT NULL, DEFAULT 0/false | 日次リマインダー有効化 |
| reminder_time | TEXT | NOT NULL, DEFAULT '20:00' | リマインダー時刻（HH:mm） |
| created_at | TEXT/TIMESTAMPTZ | NOT NULL | 作成日時 |
| updated_at | TEXT/TIMESTAMPTZ | NOT NULL | 更新日時 |

## API エンドポイント

### 認証系

#### POST /api/register
新規ユーザー登録
- **リクエスト**: `{ name: string, pin: string }`
- **レスポンス**: `{ token: string, user: { id, name } }`

#### POST /api/login
ログイン
- **リクエスト**: `{ name: string, pin: string }`
- **レスポンス**: `{ token: string, user: { id, name } }`

#### GET /api/me
ログインユーザー情報取得（要認証）
- **レスポンス**: `{ id: number, name: string }`

### コイン記録系

#### GET /api/status
システムステータス取得
- **レスポンス**: `{ today_ymd: string, canEditToday: boolean, board_date_ymd: string }`

#### POST /api/coins
コイン数記録/更新（要認証）
- **リクエスト**: `{ coins: number, date?: string }`
- **レスポンス**: `{ date_ymd: string, coins: number, diff: number }`

#### GET /api/coins
自分の履歴取得（要認証）
- **クエリ**: `days=30` （取得日数、最大365）
- **レスポンス**: `[{ date_ymd, coins, diff }, ...]`

### ランキング系

#### GET /api/board
ランキング取得（数値）
- **クエリ**:
  - `date`: 基準日（YYYY-MM-DD）
  - `mode`: raw | daily | period
  - `periodDays`: 期間日数（mode=periodの場合）
- **レスポンス**: `{ date_ymd, mode, periodDays, board: [{ name, value }, ...] }`

#### GET /api/board_series
ランキング取得（時系列グラフ用）
- **クエリ**:
  - `mode`: raw | daily | period
  - `periodDays`: 期間日数
  - `days`: 系列日数（1-90）
  - `top`: 上位N名（1-50）
  - `date`: 終端日
- **レスポンス**: `{ date_ymd, mode, periodDays, days, top, series: [{ name, points: [{ date_ymd, value }, ...] }, ...] }`

### 通知系

#### GET /api/notifications/vapid-public-key
VAPID公開鍵取得
- **レスポンス**: `{ publicKey: string }`

#### POST /api/notifications/subscribe
プッシュ通知購読登録（要認証）
- **リクエスト**: `{ endpoint: string, keys: { p256dh: string, auth: string } }`
- **レスポンス**: `{ success: boolean }`

#### POST /api/notifications/unsubscribe
プッシュ通知購読解除（要認証）
- **リクエスト**: `{ endpoint: string }`
- **レスポンス**: `{ success: boolean }`

#### GET /api/notifications/settings
通知設定取得（要認証）
- **レスポンス**: `{ daily_reminder: boolean, reminder_time: string }`

#### POST /api/notifications/settings
通知設定更新（要認証）
- **リクエスト**: `{ daily_reminder: boolean, reminder_time: string }`
- **レスポンス**: `{ success: boolean, daily_reminder: boolean, reminder_time: string }`

#### POST /api/notifications/test
テスト通知送信（要認証・開発用）
- **レスポンス**: `{ sent: number, failed: number, total: number }`

## 環境変数

### フロントエンド (.env.local, .env.production)
- `VITE_API_BASE`: APIサーバーのベースURL

### バックエンド
- `JWT_SECRET`: JWT署名用シークレット（必須・本番環境）
- `PORT`: サーバーポート（デフォルト: 3001）
- `DATABASE_URL`: PostgreSQL接続文字列（本番環境）
- `DB_PATH`: SQLiteデータベースパス（開発環境、デフォルト: ./coins.db）
- `VAPID_PUBLIC_KEY`: VAPID公開鍵（通知機能用）
- `VAPID_PRIVATE_KEY`: VAPID秘密鍵（通知機能用）
- `VAPID_SUBJECT`: VAPIDサブジェクト（mailto:形式、デフォルト: mailto:noreply@tsumu-coins.app）

## デプロイ設定

### Render (render.yaml)
- **サービスタイプ**: Web Service
- **ルートディレクトリ**: server/
- **ビルドコマンド**: `npm install`
- **起動コマンド**: `npm start`
- **永続ディスク**: /var/data (1GB) - SQLite用
- **環境変数**: JWT_SECRET, DB_PATH

## 開発コマンド

### フロントエンド
```bash
npm run dev:web      # Vite開発サーバー起動
npm run build        # 本番ビルド
npm run preview      # ビルド結果プレビュー
```

### バックエンド
```bash
npm run dev:api            # サーバー起動（watch モード）
npm run send-notifications # 通知バッチ処理を手動実行（cron/GitHub Actions用）
```

### 通知バッチ処理
```bash
cd server
node send-notifications.js  # 通知送信バッチを手動実行（デバッグ用）
```

**GitHub Actionsでの自動実行**:
- リポジトリ: kazuki326/tsumu
- ワークフロー: `.github/workflows/send-notifications.yml`
- スケジュール: 毎日 18:00〜24:00 (JST) の毎時0分
- 手動実行: GitHub Actions UIから「Run workflow」で即座に実行可能

### 同時起動
```bash
npm run dev          # フロントエンド＋バックエンド同時起動（concurrently使用）
```

### VAPID鍵生成
```bash
cd server
node generate-vapid-keys.js  # VAPID鍵ペアを生成（初回のみ）
```

## 重要な設計思想

### 1. 日付処理
- **タイムゾーン**: Asia/Tokyo (JST) 基準
- **締切**: 毎日23:59まで当日分を編集可能
- **確定日**: 23:59以降は前日が確定済みとして扱う

### 2. ランキング計算ロジック
- **raw**: 指定日までの最新コイン数
- **daily**: 前の記録との差分
- **period**: 指定期間内の「前日比」の総和
  - 期間開始前の記録も差分計算に使用
  - 記録がない日はスキップ（ゼロ扱いしない）

### 3. データベース抽象化
- PostgreSQLとSQLiteの両対応
- `DATABASE_URL`の有無で自動切り替え
- プレースホルダーの違いを吸収（`?` → `$1`変換）

### 4. CORS設定
- 許可オリジン: `https://kazuki326.github.io`、localhost各種
- 動的オリジンチェック
- プリフライトリクエスト対応

### 5. GitHub Actions による通知配信
- **実行環境**: GitHub Actions (ubuntu-latest)
- **スケジュール**: cron式で定期実行（18:00-24:00 JST）
- **データソース**: PostgreSQL（Render）に直接接続
- **送信方法**: `web-push` ライブラリでブラウザのプッシュサービスに直接送信
- **Renderサーバー不要**: GitHub ActionsがDBとプッシュサービスに直接アクセスするため、RenderのExpressサーバーは経由しない
- **スリープ影響なし**: Renderの無料プランのスリープタイムは通知配信に影響しない

### 6. セキュリティ
- PINは最低4桁、bcryptでハッシュ化
- JWT有効期限30日
- 大文字小文字を区別しないユーザー名検索（UNIQUE制約）

## トラブルシューティング

### よくある問題

1. **データベース接続エラー**
   - SQLite: `better-sqlite3`がインストールされているか確認
   - PostgreSQL: `DATABASE_URL`が正しく設定されているか確認

2. **CORS エラー**
   - フロントエンドのオリジンが`ALLOWLIST`に含まれているか確認
   - `VITE_API_BASE`が正しく設定されているか確認

3. **認証エラー**
   - `JWT_SECRET`が一貫しているか確認
   - トークンの有効期限（30日）を確認

## 今後の拡張可能性

- グループ機能（チーム対抗など）
- 目標設定機能
- 締切前通知（「あと1時間で締め切りです」など）
- ランキング更新通知
- マイルストーン通知（「7日連続達成！」など）
- データエクスポート機能
- より詳細な統計情報
- プロフィール画像/アバター
- コメント・応援機能

## AIエージェント向けガイドライン

このプロジェクトで作業する際は、以下の点に注意してください：

1. **データベース切り替えロジック**: `USE_PG`フラグに基づいて処理を分岐させる必要があります
2. **日付処理**: 必ずJST基準で処理し、`jstDateYMD()`や`addDays()`を活用してください
3. **キャッシュクリア**: データ更新時は`clearCache()`を呼び出してください
4. **ランキング計算**: 複雑なロジックなので、既存の実装を参照してください
5. **CORS設定**: 新しいオリジンを追加する場合は`ALLOWLIST`を更新してください
6. **認証**: 保護されたエンドポイントには`auth`ミドルウェアを適用してください
7. **通知機能**:
   - VAPID鍵は`generate-vapid-keys.js`で生成（一度だけ実行）
   - Service Workerは`public/sw.js`に配置（ルートパスでアクセス可能にする）
   - 通知バッチは定期実行が必要（cron/GitHub Actions/Render Cron Jobs等）
   - 購読エンドポイントが410 Goneを返した場合はDBから削除する

## ライセンス・著作権

Private Project

---

**生成日**: 2025-10-13
**最終更新日**: 2025-10-14 (プッシュ通知機能完成)
**このドキュメントは**: プロジェクトの全体像を把握し、AIエージェントや新規開発者が効率的に開発できるように作成されました。

## 通知機能の動作フロー

### 初回セットアップ
1. ユーザーがアプリにログイン
2. 「マイページ」→「通知設定」へ移動
3. 「プッシュ通知を有効にする」をクリック
4. ブラウザの通知許可ダイアログで「許可」
5. Service Workerが登録され、プッシュ購読が作成される
6. 購読情報（endpoint, p256dh, auth）がサーバーのDBに保存される

### 通知設定
1. 「日次リマインダーを受け取る」をON
2. 通知時刻を選択（18:00〜24:00）
3. 「設定を保存」で`notification_settings`テーブルに保存

### 定時通知の流れ
1. **GitHub Actions 実行** (毎時0分)
   ```
   UTC 9:00 (JST 18:00) → 実行
   UTC 10:00 (JST 19:00) → 実行
   ...
   UTC 15:00 (JST 24:00) → 実行
   ```

2. **通知バッチ処理** (`send-notifications.js`)
   ```
   - 現在時刻を取得（例: 20:15）
   - notification_settings から daily_reminder=true のユーザーを取得
   - 各ユーザーについて:
     a. reminder_time の「時」と現在時刻の「時」を比較
        （例: reminder_time=20:00 と 現在=20:15 → 「20」時で一致）
     b. 今日すでにコインを記録しているかチェック → 記録済みならスキップ
     c. push_subscriptions から購読情報を取得
     d. web-push.sendNotification() でプッシュ送信
   ```

3. **ブラウザ受信** (`public/sw.js`)
   ```
   - Service Worker の 'push' イベントが発火
   - ペイロードから通知内容を取得
   - registration.showNotification() でOS通知を表示
   ```

4. **通知クリック**
   ```
   - Service Worker の 'notificationclick' イベントが発火
   - clients.openWindow() でアプリを開く
   - URL: /tsumu/ （GitHub Pagesのプロジェクトパス）
   ```

### テスト通知の流れ
1. 通知設定画面で「テスト通知を送信」をクリック
2. `/api/notifications/test` エンドポイントにリクエスト
3. Renderサーバーが即座にプッシュ通知を送信
4. 数秒以内に通知が届く

### エラーハンドリング
- **410 Gone**: 購読が無効化されている場合、DBから自動削除
- **送信失敗**: ログに記録し、failed カウントを増やす
- **VAPID未設定**: エラーメッセージを表示して終了
