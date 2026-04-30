import sqlite3
conn = sqlite3.connect('db/experiment.db')
cur = conn.cursor()
cur.execute("SELECT table_name, column_name, is_id FROM column_def WHERE is_id IN ('pk','fk') ORDER BY table_name, is_id")
for row in cur.fetchall():
    print(row)
conn.close()
