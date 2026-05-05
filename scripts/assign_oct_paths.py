import sqlite3, os

data_dir = "data"
files = sorted(os.listdir(data_dir))

conn = sqlite3.connect("db/experiment.db")
conn.row_factory = sqlite3.Row

result_ids = [r["result_id"] for r in conn.execute("SELECT result_id FROM result ORDER BY rowid").fetchall()]

updates = [(f"data/{files[i]}", result_ids[i]) for i in range(min(len(files), len(result_ids)))]

conn.executemany("UPDATE result SET oct_result_csv_path=? WHERE result_id=?", updates)
conn.commit()

rows = conn.execute("SELECT oct_result_csv_path FROM result ORDER BY rowid").fetchall()
for r in rows:
    print(r["oct_result_csv_path"])
conn.close()
print(f"\nUpdated {len(updates)} rows.")
