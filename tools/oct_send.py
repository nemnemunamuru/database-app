#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCT PC 用 -- CSV パスをデータベースサーバーに送信するツール (tkinter GUI)
依存: requests   (pip install requests)
"""
import tkinter as tk
from tkinter import filedialog, messagebox
import threading

try:
    import requests
except ImportError:
    _r = tk.Tk()
    _r.withdraw()
    messagebox.showerror("Error", "'requests' がインストールされていません。\npip install requests")
    raise SystemExit(1)

# -- 設定 --------------------------------------------------------------------
SERVER_LOCAL = "http://localhost:8000"
SERVER_REMOTE = "http://192.168.10.200:8000"
# ---------------------------------------------------------------------------


class OctSendApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("OCT CSV 送信")
        self.resizable(False, False)
        self.configure(padx=16, pady=12)

        # サーバー URL 行
        url_frame = tk.Frame(self)
        url_frame.grid(row=0, column=0, columnspan=3, sticky="ew", pady=(0, 8))
        tk.Label(url_frame, text="サーバー URL:", anchor="w").pack(side="left")
        self._url_var = tk.StringVar(value=SERVER_LOCAL)
        tk.Entry(url_frame, textvariable=self._url_var, width=32).pack(side="left", padx=(6, 4))
        tk.Button(url_frame, text="localhost", relief="groove", padx=4,
                  command=lambda: self._url_var.set(SERVER_LOCAL)).pack(side="left", padx=2)
        tk.Button(url_frame, text="192.168.10.200", relief="groove", padx=4,
                  command=lambda: self._url_var.set(SERVER_REMOTE)).pack(side="left", padx=2)

        # 待受中実験表示
        self._exp_var = tk.StringVar(value="確認中...")
        status_frame = tk.Frame(self, bd=1, relief="sunken")
        status_frame.grid(row=1, column=0, columnspan=3, sticky="ew", pady=(0, 10))
        tk.Label(status_frame, text="待受中の実験:", anchor="w").pack(side="left", padx=6)
        self._exp_label = tk.Label(
            status_frame, textvariable=self._exp_var,
            fg="#7b1fa2", font=("Courier", 10, "bold"), anchor="w"
        )
        self._exp_label.pack(side="left", padx=4, pady=3)

        # CSV パス入力 x 3
        self._vars: dict = {}
        rows = [
            ("oct_surface_csv_path", "Surface CSV"),
            ("oct_depth_csv_path",   "Depth   CSV"),
            ("oct_result_csv_path",  "Result  CSV"),
        ]
        for i, (key, label) in enumerate(rows):
            var = tk.StringVar()
            self._vars[key] = var
            tk.Label(self, text=label + ":", anchor="w", width=14).grid(
                row=2 + i, column=0, sticky="w", pady=3)
            tk.Entry(self, textvariable=var, width=48).grid(
                row=2 + i, column=1, sticky="ew", padx=(4, 4))
            tk.Button(self, text="参照...",
                      command=lambda v=var: self._browse(v)).grid(
                row=2 + i, column=2, sticky="w")

        # ボタン行
        btn_frame = tk.Frame(self)
        btn_frame.grid(row=5, column=0, columnspan=3, pady=(14, 2))
        self._send_btn = tk.Button(
            btn_frame, text="送信", width=12,
            bg="#7b1fa2", fg="white", font=("Arial", 10, "bold"),
            command=self._on_send
        )
        self._send_btn.pack(side="left", padx=6)
        tk.Button(btn_frame, text="キャンセル", width=10,
                  command=self.destroy).pack(side="left", padx=6)

        # 起動時にステータス取得
        self.after(100, self._refresh_status)

    # -- helpers ---------------------------------------------------------------
    def _server(self) -> str:
        return self._url_var.get().rstrip("/")

    def _browse(self, var: tk.StringVar):
        path = filedialog.askopenfilename(
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
        )
        if path:
            var.set(path)

    def _refresh_status(self):
        def fetch():
            try:
                r = requests.get(f"{self._server()}/api/oct/status", timeout=4)
                data = r.json()
                exp_id = data.get("active_experiment_id") or ""
                if exp_id:
                    self._exp_var.set(exp_id)
                    self._exp_label.config(fg="#7b1fa2")
                else:
                    self._exp_var.set("待受中の実験なし")
                    self._exp_label.config(fg="gray")
            except Exception as e:
                self._exp_var.set(f"接続失敗: {e}")
                self._exp_label.config(fg="red")
            finally:
                # 1秒後に再ポーリング
                self.after(1000, self._refresh_status)
        threading.Thread(target=fetch, daemon=True).start()

    # -- 送信 ------------------------------------------------------------------
    def _on_send(self):
        payload = {k: v.get().strip() for k, v in self._vars.items() if v.get().strip()}
        if not payload:
            messagebox.showwarning("入力エラー", "CSV パスを少なくとも1つ入力してください。")
            return

        exp_id = self._exp_var.get()
        msg = f"実験 [{exp_id}] に送信しますか？\n\n"
        msg += "\n".join(f"  {k}:\n  {v}" for k, v in payload.items())
        if not messagebox.askyesno("確認", msg):
            return

        self._send_btn.config(state="disabled", text="送信中...")

        def do_send():
            try:
                r = requests.post(
                    f"{self._server()}/api/oct/push", json=payload, timeout=10
                )
                if r.status_code == 200:
                    self.after(0, lambda: messagebox.showinfo(
                        "完了",
                        f"送信成功！\n実験: {r.json().get('experiment_id', '')}"
                    ))
                    self.after(0, self.destroy)
                else:
                    self.after(0, lambda: messagebox.showerror(
                        "エラー", f"HTTP {r.status_code}:\n{r.text}"
                    ))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror(
                    "接続エラー",
                    f"サーバーに接続できませんでした！\n{e}\n\nSERVER_URL を確認してください。"
                ))
            finally:
                self.after(0, lambda: self._send_btn.config(state="normal", text="送信"))

        threading.Thread(target=do_send, daemon=True).start()


if __name__ == "__main__":
    app = OctSendApp()
    app.mainloop()
