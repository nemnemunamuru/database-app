"""
Migration: flatten optics and laser_beam tables.

optics       → composite PK (optics_id, optics_role)  [restores all 6 Excel rows]
laser_beam   → flat table with composite PK (laser_beam_id, beam_type)
laser_beam_entry → DROPPED (merged into laser_beam)
"""
import sqlite3, uuid

DB_PATH = "db/experiment.db"

# Full optics data from 実験db.xlsx (6 rows = 3 groups × 2 roles)
OPTICS_EXCEL = [
    ("9139d0bd-90da-421a-bda7-497c52548327", "PPE", "main", 120.0, None, "966eb9f8-ef50-45e3-b606-e49379d17bed", None, None),
    ("9139d0bd-90da-421a-bda7-497c52548327", "PPE", "OCT",   75.0, None, None, None, None),
    ("d9032a18-a5f7-4948-b334-923f75363708", "PPE", "main", 120.0, None, "c6c8082b-c13a-4b8f-81b9-9db163059040", None, None),
    ("d9032a18-a5f7-4948-b334-923f75363708", "PPE", "OCT",   75.0, None, None, None, None),
    ("2cb997d7-1a7f-4dcc-94a8-b0b085a4f0fb", "PPE", "main", 250.0, None, "f18dd6cf-faef-429c-8adb-b65ddeb0a0f0", "b839f532-4e09-44bc-9b3f-5ff361b03f31", None),
    ("2cb997d7-1a7f-4dcc-94a8-b0b085a4f0fb", "PPE", "OCT",   75.0, None, None, None, None),
]

con = sqlite3.connect(DB_PATH)
con.row_factory = sqlite3.Row
con.execute("PRAGMA foreign_keys = OFF")

# ── OPTICS ────────────────────────────────────────────────────────────────────
print("Migrating optics...")

# Save any user-added rows not in the Excel set
existing_optics = [(r["optics_id"], r["optics_role"], r["manufacturer"],
                    r["collimator_focal_mm"], r["serial_number"],
                    r["laser_device_id"], r["doe_id"], r["remarks"])
                   for r in con.execute("SELECT * FROM optics").fetchall()]
excel_keys = {(r[0], r[2]) for r in OPTICS_EXCEL}  # (optics_id, optics_role)
extra_rows = [r for r in existing_optics if (r[0], r[1]) not in excel_keys]

con.execute("DROP TABLE IF EXISTS optics")
con.execute("""
CREATE TABLE optics (
    optics_id           TEXT NOT NULL,
    optics_role         TEXT NOT NULL,
    manufacturer        TEXT,
    collimator_focal_mm REAL,
    serial_number       TEXT,
    laser_device_id     TEXT,
    doe_id              TEXT,
    remarks             TEXT,
    PRIMARY KEY (optics_id, optics_role)
)
""")

for row in OPTICS_EXCEL:
    con.execute("""
        INSERT OR IGNORE INTO optics
        (optics_id, optics_role, manufacturer, collimator_focal_mm, serial_number,
         laser_device_id, doe_id, remarks)
        VALUES (?,?,?,?,?,?,?,?)
    """, row)

for row in extra_rows:
    con.execute("""
        INSERT OR IGNORE INTO optics
        (optics_id, optics_role, manufacturer, collimator_focal_mm, serial_number,
         laser_device_id, doe_id, remarks)
        VALUES (?,?,?,?,?,?,?,?)
    """, row)

n = con.execute("SELECT COUNT(*) FROM optics").fetchone()[0]
print(f"  optics: {n} rows")

# ── LASER_BEAM + LASER_BEAM_ENTRY → flat laser_beam ──────────────────────────
print("Migrating laser_beam + laser_beam_entry...")

parent_map = {r["laser_beam_id"]: dict(r)
              for r in con.execute("SELECT * FROM laser_beam").fetchall()}
entries = [dict(r) for r in con.execute("SELECT * FROM laser_beam_entry").fetchall()]

merged = []
for e in entries:
    p = parent_map.get(e["laser_beam_id"], {})
    merged.append((
        e["laser_beam_id"],
        e["beam_type"],
        p.get("wavelength_nm"),
        p.get("numerical_aperture"),
        p.get("m2_value"),
        p.get("bpp_mm_mrad"),
        e["core_diameter_um"],
        e["ring_inner_diameter_um"],
        e["ring_outer_diameter_um"],
        p.get("remarks"),
    ))

# Add any parent rows that had no entries (keep them with NULL beam_type)
entry_ids = {e["laser_beam_id"] for e in entries}
for lb_id, p in parent_map.items():
    if lb_id not in entry_ids:
        merged.append((lb_id, None, p.get("wavelength_nm"), p.get("numerical_aperture"),
                       p.get("m2_value"), p.get("bpp_mm_mrad"), None, None, None, p.get("remarks")))

con.execute("DROP TABLE IF EXISTS laser_beam")
con.execute("DROP TABLE IF EXISTS laser_beam_entry")
con.execute("""
CREATE TABLE laser_beam (
    laser_beam_id          TEXT NOT NULL,
    beam_type              TEXT NOT NULL,
    wavelength_nm          REAL,
    numerical_aperture     REAL,
    m2_value               REAL,
    bpp_mm_mrad            REAL,
    core_diameter_um       REAL,
    ring_inner_diameter_um REAL,
    ring_outer_diameter_um REAL,
    remarks                TEXT,
    PRIMARY KEY (laser_beam_id, beam_type)
)
""")

for row in merged:
    if row[1] is None:
        continue  # skip rows with NULL beam_type (can't insert into composite PK)
    con.execute("""
        INSERT OR IGNORE INTO laser_beam
        (laser_beam_id, beam_type, wavelength_nm, numerical_aperture, m2_value, bpp_mm_mrad,
         core_diameter_um, ring_inner_diameter_um, ring_outer_diameter_um, remarks)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, row)

n = con.execute("SELECT COUNT(*) FROM laser_beam").fetchone()[0]
print(f"  laser_beam: {n} rows")

# ── column_def ────────────────────────────────────────────────────────────────
print("Updating column_def...")

# Remove OPTICS_ENTRY rows
con.execute("DELETE FROM column_def WHERE table_name = 'OPTICS_ENTRY'")
# Remove LASER_BEAM_ENTRY rows
con.execute("DELETE FROM column_def WHERE table_name = 'LASER_BEAM_ENTRY'")

# Ensure OPTICS column_def has optics_id and optics_role columns
existing_optics_cols = {r[0] for r in con.execute(
    "SELECT column_name FROM column_def WHERE table_name = 'OPTICS'"
).fetchall()}
max_order = con.execute(
    "SELECT COALESCE(MAX(order_index), 0) FROM column_def WHERE table_name = 'OPTICS'"
).fetchone()[0]
optics_to_add = [
    ("optics_id",   "string", "",    "pk"),
    ("optics_role", "string", "",    ""),
]
for i, (col, dtype, unit, is_id) in enumerate(optics_to_add):
    if col not in existing_optics_cols:
        con.execute("""
            INSERT INTO column_def (column_def_id, table_name, column_name, data_type, unit, is_id, candidates, order_index)
            VALUES (?, 'OPTICS', ?, ?, ?, ?, '', ?)
        """, (str(uuid.uuid4()), col, dtype, unit, is_id, max_order + 1 + i))
        print(f"  Added column_def: OPTICS.{col}")

# Ensure LASER_BEAM column_def has beam_type and diameter columns
existing_lb_cols = {r[0] for r in con.execute(
    "SELECT column_name FROM column_def WHERE table_name = 'LASER_BEAM'"
).fetchall()}
max_order = con.execute(
    "SELECT COALESCE(MAX(order_index), 0) FROM column_def WHERE table_name = 'LASER_BEAM'"
).fetchone()[0]
lb_to_add = [
    ("laser_beam_id",        "string", "",    "pk"),
    ("beam_type",            "string", "",    ""),
    ("core_diameter_um",     "float",  "µm",  ""),
    ("ring_inner_diameter_um","float", "µm",  ""),
    ("ring_outer_diameter_um","float", "µm",  ""),
]
for i, (col, dtype, unit, is_id) in enumerate(lb_to_add):
    if col not in existing_lb_cols:
        con.execute("""
            INSERT INTO column_def (column_def_id, table_name, column_name, data_type, unit, is_id, candidates, order_index)
            VALUES (?, 'LASER_BEAM', ?, ?, ?, ?, '', ?)
        """, (str(uuid.uuid4()), col, dtype, unit, is_id, max_order + 1 + i))
        print(f"  Added column_def: LASER_BEAM.{col}")

con.commit()
con.execute("PRAGMA foreign_keys = ON")

print("\nTables:")
for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
    cnt = con.execute(f"SELECT COUNT(*) FROM [{r[0]}]").fetchone()[0]
    print(f"  {r[0]}: {cnt} rows")

con.close()
print("\nDone.")
