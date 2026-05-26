import sqlite3
con = sqlite3.connect("db/experiment.db")
print("=== RESULT column_def ===")
for r in con.execute("SELECT column_name, data_type, is_id FROM column_def WHERE table_name='RESULT' ORDER BY order_index").fetchall():
    print(r)
print("\n=== result DB columns ===")
print([r[1] for r in con.execute("PRAGMA table_info(result)").fetchall()])
con.close()
