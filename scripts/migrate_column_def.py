import sqlite3

con = sqlite3.connect('db/実験.db')

# Add is_id column
con.execute('ALTER TABLE column_def ADD COLUMN is_id TEXT DEFAULT ""')
con.commit()

# Unit updates: (column_name pattern → unit)
# Using column_name suffix to determine unit
unit_map = {
    'wavelength_nm':              'nm',
    'bpp_mm_mrad':                'mm·mrad',
    'core_diameter_um':           'μm',
    'ring_inner_diameter_um':     'μm',
    'ring_outer_diameter_um':     'μm',
    'ftheta_focal_mm':            'mm',
    'collimator_focal_mm':        'mm',
    'main_diameter_um':           'μm',
    'sub_diameter_um':            'μm',
    'oct_diameter_um':            'μm',
    'main_power_w':               'W',
    'sub_power_w':                'W',
    'welding_speed_mm_s':         'mm/s',
    'main_focus_offset_mm':       'mm',
    'sub_focus_offset_mm':        'mm',
    'length_mm':                  'mm',
    'wobble_radius_mm':           'mm',
    'wobble_frequency_hz':        'Hz',
    'circumferential_speed':      'mm/s',
    'thickness_mm':               'mm',
    'width_mm':                   'mm',
    'density_kg_m3':              'kg/m³',
    'thermal_conductivity_w_mk':  'W/(m·K)',
    'reflectivity_1070nm':        '0–1',
    'gas_purity_percent':         '%',
    'gas_flow_l_min':             'L/min',
    'gas_pressure_kpa':           'kPa',
    'nozzle_diameter_mm':         'mm',
    'nozzle_distance_mm':         'mm',
    'nozzle_angle_deg':           '°',
    'oct_depth_mm':               'mm',
    'cross_section_depth_mm':     'mm',
    'gap_opening_mm':             'mm',
    'spatter_severity':           '0–1',
    'crack_severity':             '0–1',
}

for col_name, unit in unit_map.items():
    con.execute(
        'UPDATE column_def SET unit=? WHERE column_name=?',
        (unit, col_name)
    )

con.commit()
print(f'Units updated for {len(unit_map)} column patterns')

# is_id: pk for order_index=0 and column_name ends with _id
# fk for order_index>0 and column_name ends with _id
rows = con.execute('SELECT column_def_id, column_name, order_index FROM column_def').fetchall()
pk_count = fk_count = 0
for cid, cname, oidx in rows:
    if cname.endswith('_id'):
        if oidx == 0:
            con.execute('UPDATE column_def SET is_id="pk" WHERE column_def_id=?', (cid,))
            pk_count += 1
        else:
            con.execute('UPDATE column_def SET is_id="fk" WHERE column_def_id=?', (cid,))
            fk_count += 1

con.commit()
print(f'is_id: {pk_count} pk, {fk_count} fk')
con.close()
print('Done')
