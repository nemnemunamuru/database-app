import sqlite3
con = sqlite3.connect('db/experiment.db')

n1 = con.execute("UPDATE column_def SET table_name='FILE' WHERE table_name='File'").rowcount
n2 = con.execute("UPDATE column_def SET table_name='OBSERVATION' WHERE table_name='OBSERVAION'").rowcount
con.commit()
print(f"File->FILE: {n1}, OBSERVAION->OBSERVATION: {n2}")

rows = con.execute("SELECT DISTINCT table_name FROM column_def ORDER BY table_name").fetchall()
for r in rows:
    print(r[0])
con.close()
