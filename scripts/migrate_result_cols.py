import sqlite3

con = sqlite3.connect("db/experiment.db")
cols = {r[1] for r in con.execute("PRAGMA table_info(result)").fetchall()}

to_add = [
    ("gap_opening_mm", "REAL"),
    ("dissimilar_material_flag", "INTEGER"),
]

for col, ctype in to_add:
    if col not in cols:
        con.execute(f"ALTER TABLE result ADD COLUMN {col} {ctype}")
        print(f"Added: {col} {ctype}")
    else:
        print(f"Already exists: {col}")

con.commit()
print("\nDone. Current columns:")
print([r[1] for r in con.execute("PRAGMA table_info(result)").fetchall()])
con.close()
