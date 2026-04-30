import sqlite3

con = sqlite3.connect("db/experiment.db")

# PPE → main
con.execute("UPDATE optics SET optics_role = 'main' WHERE optics_role = 'PPE'")

# OCT rows: same optics_id/manufacturer, collimator_focal_mm=75, no laser_device_id/doe_id
con.execute("""
INSERT INTO optics (optics_id, optics_role, manufacturer, collimator_focal_mm, serial_number, laser_device_id, doe_id, remarks)
SELECT optics_id, 'OCT', manufacturer, 75.0, NULL, NULL, NULL, NULL
FROM optics WHERE optics_role = 'main'
""")

# Fix manufacturer: was stored as 'main' but should be 'PPE'
con.execute("UPDATE optics SET manufacturer = 'PPE' WHERE manufacturer = 'main'")

con.commit()

print("=== optics ===")
for r in con.execute(
    "SELECT optics_id, manufacturer, optics_role, collimator_focal_mm, laser_device_id, doe_id "
    "FROM optics ORDER BY optics_id, optics_role"
).fetchall():
    print(r)

con.close()
