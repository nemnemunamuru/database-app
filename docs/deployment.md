# Laser Experiment Database — 展開手順

## 必要なもの

| | ソースPC（開発者） | ターゲットPC（配布先） |
|---|---|---|
| Python 3.13 | ✅ | ✅ 必須 |
| Node.js | ✅ | ❌ 不要 |
| Docker | ❌ 不要 | ❌ 不要 |

---

## ソースPC での作業（配布前に1回だけ）

### 1. フロントエンドをビルドする

`build.bat` をダブルクリック、または以下を実行：

```bat
cd frontend
npm run build
```

完了すると `frontend/dist/` フォルダが生成される。

### 2. 配布ファイルをZIPにまとめる

以下のフォルダ・ファイルを選択してZIP圧縮する：

```
database/
  ├── backend/
  ├── frontend/
  │     └── dist/          ← ビルド済みファイル（必須）
  ├── db/                  ← データごと渡す場合はそのまま、新規は空でOK
  ├── setup.bat
  ├── start_deploy.bat
  └── pyproject.toml
```

> `.venv/` と `frontend/node_modules/` は容量が大きいので含めない。

---

## ターゲットPC での作業

### 1. Python 3.13 をインストール

https://www.python.org/downloads/

> インストール時に **「Add Python to PATH」にチェック** を入れること。

### 2. ZIPを展開する

任意のフォルダに展開する（例: `C:\tools\database\`）。

### 3. セットアップを実行する（初回のみ）

`setup.bat` をダブルクリック。

- Python仮想環境 (`.venv`) を自動作成
- 必要なパッケージを自動インストール

### 4. アプリを起動する

`start_deploy.bat` をダブルクリック。

ブラウザが自動で開き、`http://localhost:8000` でアプリが使える。

### 5. 終了する

ターミナルウィンドウを閉じる、または `Ctrl+C` を押す。

---

## トラブルシューティング

| エラー | 対処 |
|---|---|
| `setup.bat` でpipが失敗する | 社内プロキシの設定が必要な場合あり。IT部門に確認 |
| `frontend\dist\index.html が見つからない` | ソースPCで `build.bat` を実行してから再配布 |
| ポート8000が使用中 | 他のアプリを停止するか、`start_deploy.bat` 内の `--port 8000` を変更 |

---

## アップデート時

ソースPCでコードを修正したら：

1. `build.bat` を再実行（フロントエンドを変更した場合）
2. `backend/` と `frontend/dist/` を上書きコピー
3. ターゲットPCで `start_deploy.bat` を再起動
