"""
migrate_experiment_material_composite_pk.py

experiment_material テーブルの PRIMARY KEY を
  (experiment_material_id) → (experiment_material_id, material_role) に変更し、
Excel から抽出した不足している lower 行を挿入する。
"""

import sqlite3
import shutil
from datetime import datetime

DB_PATH = "db/experiment.db"

# Excelに存在するが DB に未登録の行
MISSING_ROWS = [
    # (experiment_material_id,         material_state_id,                   material_role, remarks)
    ("9f42cece-53e5-46e6-9f92-0dd2e3db1bcb", "4e83fd03-a12a-4791-82f0-ee7ec1947e89", "lower", None),
    ("9d079de5-5c37-45a6-acdf-b8a3b241ca75", "f84c62d3-fc30-4141-a4a9-8980a40d41f7", "lower", None),
]

def main():
    # バックアップ
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = f"{DB_PATH}.bak_{ts}"
    shutil.copy2(DB_PATH, backup)
    print(f"Backup: {backup}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")

    # 既存データを退避
    existing = conn.execute("SELECT * FROM experiment_material").fetchall()
    print(f"Existing rows: {len(existing)}")
    for r in existing:
        print(f"  {dict(r)}")

    # 新テーブルを複合PKで作成
    conn.execute("DROP TABLE IF EXISTS experiment_material_new")
    conn.execute("""
        CREATE TABLE experiment_material_new (
            experiment_material_id VARCHAR NOT NULL,
            material_state_id VARCHAR,
            material_role VARCHAR NOT NULL,
            remarks TEXT,
            PRIMARY KEY (experiment_material_id, material_role),
            FOREIGN KEY(material_state_id) REFERENCES material_state (material_state_id)
        )
    """)

    # 既存データを移行
    conn.executemany(
        "INSERT INTO experiment_material_new VALUES (?, ?, ?, ?)",
        [(r["experiment_material_id"], r["material_state_id"], r["material_role"] or "", r["remarks"])
         for r in existing]
    )

    # 不足している lower 行を挿入（重複チェック付き）
    cur_ids = {
        (r["experiment_material_id"], r["material_role"])
        for r in existing
    }
    inserted = 0
    for row in MISSING_ROWS:
        key = (row[0], row[2])
        if key in cur_ids:
            print(f"SKIP (already exists): {key}")
            continue
        conn.execute(
            "INSERT INTO experiment_material_new VALUES (?, ?, ?, ?)",
            row
        )
        print(f"INSERT: experiment_material_id={row[0]}, role={row[2]}, material_state_id={row[1]}")
        inserted += 1

    # 旧テーブルを置き換え
    conn.execute("DROP TABLE experiment_material")
    conn.execute("ALTER TABLE experiment_material_new RENAME TO experiment_material")

    conn.execute("PRAGMA foreign_keys = ON")
    conn.commit()

    # 確認
    rows = conn.execute("SELECT * FROM experiment_material ORDER BY experiment_material_id, material_role").fetchall()
    print(f"\n=== experiment_material after migration ({len(rows)} rows) ===")
    for r in rows:
        print(f"  {dict(r)}")

    conn.close()
    print(f"\nDone. Inserted {inserted} new row(s).")

if __name__ == "__main__":
    main()
