# TSUMU COINS

コイン積み上げトラッキングアプリ

## 機能

- ユーザー登録・ログイン（JWT認証）
- 日次コイン記録
- 過去データの修正機能
- ランキング表示（コイン数・前日比・7日間・30日間）
- グラフ表示
- プッシュ通知機能
- 年末までの試算機能

## ローカル開発環境のセットアップ

### 1. 依存パッケージのインストール

```bash
# ルートディレクトリ
npm install

# サーバーディレクトリ
cd server
npm install
```

### 2. テストデータの作成（ローカル環境のみ）

ローカルでアプリを確認するために、テストデータを簡単に作成できます：

```bash
cd server
npm run seed
```

これにより、以下のテストユーザーと過去30日分のデータが作成されます：

- **テストユーザー1** (PIN: 1234)
- **テストユーザー2** (PIN: 1234)
- **テストユーザー3** (PIN: 1234)
- **あなた** (PIN: 1234)

すべてのテストユーザーのPINは `1234` です。

### 3. アプリの起動

```bash
# ルートディレクトリで実行（Web + API サーバーを同時起動）
npm run dev
```

または個別に起動：

```bash
# Webのみ
npm run dev:web

# APIサーバーのみ
cd server
npm run dev
```

### 4. アプリにアクセス

ブラウザで http://localhost:5173 を開きます。

テストユーザーでログインして、作成されたデータを確認できます！

## データベース

- **ローカル環境**: SQLite (`server/coins.db`)
- **本番環境**: PostgreSQL (環境変数 `DATABASE_URL` で設定)

## スクリプト

### ルートディレクトリ

- `npm run dev` - Web + APIサーバーを同時起動
- `npm run dev:web` - Vite開発サーバー起動
- `npm run dev:api` - APIサーバー起動
- `npm run build` - 本番用ビルド
- `npm run preview` - ビルド結果のプレビュー

### サーバーディレクトリ

- `npm start` - APIサーバー起動
- `npm run dev` - APIサーバー起動（ホットリロード）
- `npm run seed` - テストデータ作成（ローカル環境のみ）
- `npm run send-notifications` - 通知送信スクリプト

## 環境変数

サーバー側で以下の環境変数を設定できます：

- `PORT` - APIサーバーのポート番号（デフォルト: 3001）
- `DATABASE_URL` - PostgreSQL接続文字列（未設定の場合はSQLite）
- `DB_PATH` - SQLiteデータベースのパス（デフォルト: `./coins.db`）
- `JWT_SECRET` - JWT署名用シークレット
- `ALLOW_PAST_EDITS` - 過去データ編集許可（`1` で有効）
- `PAST_EDIT_MAX_DAYS` - 過去編集可能日数（0=無制限）
- `VAPID_PUBLIC_KEY` - プッシュ通知用VAPID公開鍵
- `VAPID_PRIVATE_KEY` - プッシュ通知用VAPID秘密鍵
- `VAPID_SUBJECT` - VAPID subject（メールアドレス）

## 技術スタック

- **フロントエンド**: React + Vite
- **バックエンド**: Express.js
- **データベース**: PostgreSQL / SQLite
- **認証**: JWT
- **通知**: Web Push API

## ライセンス

Private
