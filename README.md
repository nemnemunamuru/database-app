# 起動方法

PowerShell でこのプロジェクトのルートを開いて、2つのターミナルを使って直接起動してください。

## 1. バックエンド起動

```powershell
.\.venv\Scripts\uvicorn.exe backend.main:app --reload --host 127.0.0.1 --port 8000
```

## 2. フロントエンド起動

別ターミナルで:

```powershell
cd frontend
npm install
npm run dev
```

起動後は次のURLでアクセスできます。

- フロントエンド: http://localhost:5173/
- APIドキュメント: http://127.0.0.1:8000/docs
