import sqlite3

con = sqlite3.connect("db/experiment.db")

# Set data_type='uuid', candidates=NULL for all pk/fk rows
cur = con.execute(
    "UPDATE column_def SET data_type='uuid', candidates=NULL WHERE is_id IN ('pk','fk')"
)
print(f"Updated {cur.rowcount} rows")
con.commit()

# Verify
for r in con.execute(
    "SELECT table_name, column_name, is_id, data_type, candidates "
    "FROM column_def WHERE is_id IN ('pk','fk') ORDER BY table_name, column_name LIMIT 20"
).fetchall():
    print(r)

con.close()
