"""
Merge optics_entry into optics:
- Add new columns to optics table
- Copy first entry per optics_id into optics
- Drop optics_entry table
- Update column_def
"""
import sqlite3

con = sqlite3.connect("db/experiment.db")
con.row_factory = sqlite3.Row

# 1. Add new columns to optics (ignore if already exists)
new_cols = [
    ("optics_role",          "TEXT"),
    ("collimator_focal_mm",  "REAL"),
    ("serial_number",        "TEXT"),
    ("laser_device_id",      "TEXT"),
    ("doe_id",               "TEXT"),
]
for col_name, col_type in new_cols:
    try:
        con.execute(f"ALTER TABLE optics ADD COLUMN {col_name} {col_type}")
        print(f"  Added column: optics.{col_name}")
    except Exception as e:
        print(f"  Skip (already exists?): {col_name} — {e}")

# 2. Copy data from optics_entry into optics (take first entry per optics_id)
entries = con.execute("SELECT * FROM optics_entry").fetchall()
migrated = 0
for e in entries:
    con.execute("""
        UPDATE optics SET
            optics_role         = ?,
            collimator_focal_mm = ?,
            serial_number       = ?,
            laser_device_id     = ?,
            doe_id              = ?
        WHERE optics_id = ?
    """, (
        e["optics_role"],
        e["collimator_focal_mm"],
        e["serial_number"],
        e["laser_device_id"],
        e["doe_id"],
        e["optics_id"],
    ))
    migrated += 1
print(f"Migrated {migrated} optics_entry rows into optics")

# 3. Drop optics_entry table
con.execute("DROP TABLE IF EXISTS optics_entry")
print("Dropped table: optics_entry")

# 4. Update column_def: remove OPTICS_ENTRY rows, add new fields to OPTICS
con.execute("DELETE FROM column_def WHERE table_name = 'OPTICS_ENTRY'")
print("Deleted column_def rows for OPTICS_ENTRY")

# Add missing columns to OPTICS in column_def (skip if already present)
existing = {r[0] for r in con.execute(
    "SELECT column_name FROM column_def WHERE table_name = 'OPTICS'"
).fetchall()}

to_add = [
    ("optics_role",         "string"),
    ("collimator_focal_mm", "float"),
    ("serial_number",       "string"),
    ("laser_device_id",     "string"),
    ("doe_id",              "string"),
]
import uuid
max_order = con.execute(
    "SELECT MAX(order_index) FROM column_def WHERE table_name = 'OPTICS'"
).fetchone()[0] or 0

for i, (col, dtype) in enumerate(to_add):
    if col in existing:
        print(f"  column_def already has OPTICS.{col}")
        continue
    con.execute("""
        INSERT INTO column_def (column_def_id, table_name, column_name, data_type, unit, is_id, candidates, order_index)
        VALUES (?, 'OPTICS', ?, ?, '', '', '', ?)
    """, (str(uuid.uuid4()), col, dtype, max_order + 1 + i))
    print(f"  Added column_def: OPTICS.{col}")

con.commit()
con.close()
print("Done.")
