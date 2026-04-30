import sqlite3

con = sqlite3.connect("db/experiment.db")
con.execute("DROP TABLE IF EXISTS laser_beam_entry")
con.execute("DROP TABLE IF EXISTS optics_entry")
con.commit()

print("Tables after drop:")
for (name,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall():
    print(" ", name)
con.close()
