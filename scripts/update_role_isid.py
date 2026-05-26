import sqlite3

con = sqlite3.connect("db/experiment.db")
cur = con.execute("UPDATE column_def SET is_id='role' WHERE column_name LIKE '%_role'")
print(f"Updated {cur.rowcount} rows to is_id=role")
con.commit()

for r in con.execute(
    "SELECT table_name, column_name, is_id FROM column_def WHERE column_name LIKE '%_role' ORDER BY table_name"
).fetchall():
    print(r)
con.close()
