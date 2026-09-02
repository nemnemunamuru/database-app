#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCT PC 用 -- CSV パスをデータベースサーバーに送信するツール (tkinter GUI)
依存: requests   (pip install requests)
"""
import tkinter as tk
from tkinter import filedialog, messagebox
import threading
import os
import csv
import sys
import json
import shutil

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

MEASURE_LOG_PATH = "E:/Logs/OCT"
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "oct_send_config.json")


def load_app_config() -> dict:
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def save_app_config(data: dict) -> tuple[bool, str]:
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True, "設定を保存しました"
    except Exception as e:
        return False, f"設定保存に失敗: {e}"


def _arg_or_none(args: list[str], idx: int) -> str | None:
    return args[idx] if len(args) > idx and str(args[idx]).strip() else None


def parse_oct_args(argv: list[str]) -> dict[str, str | None]:
    # send.py compatibility
    return {
        "RecipeName": _arg_or_none(argv, 1),
        "ProcPos": _arg_or_none(argv, 2),
        "ProcType": _arg_or_none(argv, 3),
        "timeStamp": _arg_or_none(argv, 5),
    }


def _try_read_csv(csv_path: str) -> tuple[bool, str]:
    if not os.path.isfile(csv_path):
        return False, f"入力CSVなし: {csv_path}"

    for enc in ("utf-8-sig", "utf-8", "shift_jis", "cp932"):
        try:
            with open(csv_path, encoding=enc, newline="") as f:
                sample = f.read(4096)
                f.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=",\t;")
                    delimiter = dialect.delimiter
                except Exception:
                    delimiter = ","

                reader = csv.reader(f, delimiter=delimiter)
                rows = list(reader)
            if len(rows) < 2:
                return False, "CSV読み込み: データ行なし"
            return True, f"CSV読み込みOK ({len(rows)-1}行)"
        except UnicodeDecodeError:
            continue
    return False, "CSV読み込み失敗: 対応エンコーディング外"


def build_result_csv_from_args(args_map: dict[str, str | None], output_dir: str) -> tuple[str | None, str]:
    proc_pos = args_map.get("ProcPos")
    proc_type = args_map.get("ProcType")
    timestamp = args_map.get("timeStamp")

    if proc_type != "1":
        return None, "ProcType が '1' ではないため未生成"
    if not proc_pos or not timestamp:
        return None, "ProcPos / timeStamp が不足しているため未生成"

    input_path = os.path.join(MEASURE_LOG_PATH, f"ResultLog_{timestamp}_{proc_pos}.csv")
    ok, msg = _try_read_csv(input_path)
    if not ok:
        return None, f"Result CSV 未生成 ({msg})"

    out_dir = output_dir.strip() if output_dir else ""
    if not out_dir:
        return None, "Result CSV 未生成 (出力先が未設定)"

    out_name = f"ResultByPython_{proc_pos}_{proc_type}.csv"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, out_name)

    shutil.copy2(input_path, out_path)

    return out_path, f"Result CSV を出力: {out_name} / {msg}"


class OctSendApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("OCT CSV 送信")
        self.resizable(False, False)
        self.configure(padx=16, pady=12)
        self._cfg = load_app_config()

        # サーバー URL 行
        url_frame = tk.Frame(self)
        url_frame.grid(row=0, column=0, columnspan=3, sticky="ew", pady=(0, 8))
        tk.Label(url_frame, text="サーバー URL:", anchor="w").pack(side="left")
        self._url_var = tk.StringVar(value=self._cfg.get("server_url") or SERVER_LOCAL)
        tk.Entry(url_frame, textvariable=self._url_var, width=32).pack(side="left", padx=(6, 4))
        tk.Button(url_frame, text="localhost", relief="groove", padx=4,
                  command=lambda: self._url_var.set(SERVER_LOCAL)).pack(side="left", padx=2)
        tk.Button(url_frame, text="192.168.10.200", relief="groove", padx=4,
                  command=lambda: self._url_var.set(SERVER_REMOTE)).pack(side="left", padx=2)
        tk.Button(url_frame, text="保存", relief="groove", padx=6,
                  command=self._save_preferences).pack(side="left", padx=(6, 0))

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

        # CLI args 表示
        self._args_map = parse_oct_args(sys.argv)
        args_frame = tk.LabelFrame(self, text="起動引数 (send.py 互換)", padx=8, pady=6)
        args_frame.grid(row=2, column=0, columnspan=3, sticky="ew", pady=(0, 10))

        self._arg_vars: dict[str, tk.StringVar] = {}
        arg_rows = [
            ("RecipeName", "品種"),
            ("ProcPos", "加工位置"),
            ("ProcType", "加工種別"),
            ("timeStamp", "計測ログ日時"),
        ]
        for i, (k, label) in enumerate(arg_rows):
            tk.Label(args_frame, text=f"{label}:", width=12, anchor="w").grid(row=i, column=0, sticky="w")
            sv = tk.StringVar(value=self._args_map.get(k) or "無し")
            self._arg_vars[k] = sv
            fg = "#1565c0" if self._args_map.get(k) else "gray"
            tk.Label(args_frame, textvariable=sv, anchor="w", fg=fg, font=("Courier", 10, "bold")).grid(row=i, column=1, sticky="w", padx=(4, 0))

        self._auto_status_var = tk.StringVar(value="送信時に自動判定します")
        tk.Label(args_frame, textvariable=self._auto_status_var, anchor="w", fg="#2e7d32").grid(
            row=len(arg_rows), column=0, columnspan=2, sticky="w", pady=(4, 0)
        )

        self._result_path_var = tk.StringVar(value="")
        tk.Label(args_frame, text="出力Result CSV:", width=12, anchor="w").grid(
            row=len(arg_rows)+1, column=0, sticky="w", pady=(4, 0)
        )
        tk.Label(args_frame, textvariable=self._result_path_var, anchor="w", fg="#455a64").grid(
            row=len(arg_rows)+1, column=1, columnspan=2, sticky="w", pady=(4, 0)
        )

        out_frame = tk.LabelFrame(self, text="出力先", padx=8, pady=6)
        out_frame.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(0, 10))
        default_out = self._cfg.get("output_dir") or os.path.join(os.path.dirname(__file__), "save")
        self._out_dir_var = tk.StringVar(value=default_out)
        tk.Label(out_frame, text="フォルダ:", width=12, anchor="w").grid(row=0, column=0, sticky="w")
        tk.Entry(out_frame, textvariable=self._out_dir_var, width=46).grid(row=0, column=1, sticky="ew", padx=(4, 4))
        tk.Button(out_frame, text="参照...", command=self._choose_output_dir).grid(row=0, column=2, sticky="w")
        tk.Button(out_frame, text="適用", command=self._apply_result_csv).grid(row=0, column=3, sticky="w", padx=(6, 0))

        # ボタン行
        btn_frame = tk.Frame(self)
        btn_frame.grid(row=4, column=0, columnspan=3, pady=(14, 2))
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

    def _choose_output_dir(self):
        d = filedialog.askdirectory(initialdir=self._out_dir_var.get() or os.getcwd())
        if d:
            self._out_dir_var.set(d)

    def _save_preferences(self):
        ok, msg = save_app_config({
            "server_url": self._url_var.get().strip(),
            "output_dir": self._out_dir_var.get().strip(),
        })
        if ok:
            messagebox.showinfo("設定", msg)
        else:
            messagebox.showerror("設定", msg)

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

    def _apply_result_csv(self) -> tuple[str | None, str]:
        out_path, status = build_result_csv_from_args(self._args_map, output_dir=self._out_dir_var.get())
        self._auto_status_var.set(status)
        self._result_path_var.set(out_path or "")
        return out_path, status

    def _build_auto_payload(self) -> tuple[dict[str, str], str]:
        out_path, status = self._apply_result_csv()
        if not out_path:
            return {}, status
        return {"oct_result_csv_path": out_path}, status

    # -- 送信 ------------------------------------------------------------------
    def _on_send(self):
        payload, status = self._build_auto_payload()
        if not payload:
            messagebox.showwarning("自動判定", status)
            return

        exp_id = self._exp_var.get()
        msg = f"実験 [{exp_id}] に送信しますか？\n\n"
        msg += f"判定結果: {status}\n\n"
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
