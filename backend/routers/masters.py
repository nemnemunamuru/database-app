import uuid
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import (
    Material, MaterialState,
    LaserBeam, LaserBeamEntry,
    LaserDevice,
    Ftheta, Optics, OpticsEntry, Doe,
    GalvanoSystem,
    LineParameter, MainTrajectory, WobblingParameter, SubTrajectory, TrajectorySet,
    WeldingCondition, ShieldingCondition,
    Result, Observation,
    ExperimentMaterial, File, Experiment,
    ColumnDef, Base,
)

router = APIRouter()


def _row(item) -> dict:
    return {c.name: getattr(item, c.name) for c in item.__table__.columns}


def _list_all(model, db):
    return [_row(r) for r in db.query(model).all()]


def _get_one(model, pk, pk_val, db):
    item = db.get(model, pk_val)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return _row(item)


def _create_one(model, pk, body: dict, db):
    body.pop(pk, None)
    filtered = {k: v for k, v in body.items() if hasattr(model, k)}
    item = model(**{pk: str(uuid.uuid4()), **filtered})
    db.add(item)
    db.commit()
    db.refresh(item)
    return _row(item)


def _update_one(model, pk, pk_val, body: dict, db):
    item = db.get(model, pk_val)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.items():
        if k != pk and hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return _row(item)


def _delete_one(model, pk, pk_val, db):
    item = db.get(model, pk_val)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(item)
    db.commit()


# ── Material ──────────────────────────────────────────────────────────────────

@router.get("/materials")
def list_materials(db: Session = Depends(get_db)):
    return _list_all(Material, db)

@router.get("/materials/{item_id}")
def get_material(item_id: str, db: Session = Depends(get_db)):
    return _get_one(Material, "material_id", item_id, db)

@router.post("/materials", status_code=201)
def create_material(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(Material, "material_id", body, db)

@router.put("/materials/{item_id}")
def update_material(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(Material, "material_id", item_id, body, db)

@router.delete("/materials/{item_id}", status_code=204)
def delete_material(item_id: str, db: Session = Depends(get_db)):
    _delete_one(Material, "material_id", item_id, db)


# ── MaterialState ─────────────────────────────────────────────────────────────

@router.get("/material-states")
def list_material_states(db: Session = Depends(get_db)):
    return _list_all(MaterialState, db)

@router.get("/material-states/{item_id}")
def get_material_state(item_id: str, db: Session = Depends(get_db)):
    return _get_one(MaterialState, "material_state_id", item_id, db)

@router.post("/material-states", status_code=201)
def create_material_state(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(MaterialState, "material_state_id", body, db)

@router.put("/material-states/{item_id}")
def update_material_state(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(MaterialState, "material_state_id", item_id, body, db)

@router.delete("/material-states/{item_id}", status_code=204)
def delete_material_state(item_id: str, db: Session = Depends(get_db)):
    _delete_one(MaterialState, "material_state_id", item_id, db)


# ── LaserBeam ─────────────────────────────────────────────────────────────────

@router.get("/laser-beams")
def list_laser_beams(db: Session = Depends(get_db)):
    return _list_all(LaserBeam, db)

# ── LaserBeam / combined (flat: one row per LaserBeamEntry with parent fields) ─

@router.get("/laser-beams/combined")
def list_laser_beams_combined(db: Session = Depends(get_db)):
    entries = (
        db.query(LaserBeamEntry)
        .options(joinedload(LaserBeamEntry.laser_beam))
        .all()
    )
    rows = []
    for be in entries:
        row = _row(be)
        lb = be.laser_beam
        row["wavelength_nm"]      = lb.wavelength_nm      if lb else None
        row["numerical_aperture"] = lb.numerical_aperture if lb else None
        row["m2_value"]           = lb.m2_value           if lb else None
        row["bpp_mm_mrad"]        = lb.bpp_mm_mrad        if lb else None
        row["remarks"]            = lb.remarks            if lb else None
        rows.append(row)
    return rows


@router.post("/laser-beams/combined", status_code=201)
def create_laser_beam_combined(body: dict = Body(...), db: Session = Depends(get_db)):
    wavelength_nm      = body.pop("wavelength_nm", None)
    numerical_aperture = body.pop("numerical_aperture", None)
    m2_value           = body.pop("m2_value", None)
    bpp_mm_mrad        = body.pop("bpp_mm_mrad", None)
    remarks_val        = body.pop("remarks", None)
    laser_beam_id      = body.pop("laser_beam_id", None)

    if laser_beam_id:
        parent = db.get(LaserBeam, laser_beam_id)
        if not parent:
            raise HTTPException(status_code=404, detail="LaserBeam parent not found")
    else:
        parent = LaserBeam(
            laser_beam_id=str(uuid.uuid4()),
            wavelength_nm=wavelength_nm,
            numerical_aperture=numerical_aperture,
            m2_value=m2_value,
            bpp_mm_mrad=bpp_mm_mrad,
            remarks=remarks_val,
        )
        db.add(parent)
        db.flush()

    entry_fields = {k: v for k, v in body.items()
                    if hasattr(LaserBeamEntry, k) and k != "laser_beam_entry_id"}
    entry_fields["laser_beam_id"] = parent.laser_beam_id
    entry = LaserBeamEntry(laser_beam_entry_id=str(uuid.uuid4()), **entry_fields)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    db.refresh(parent)

    result = _row(entry)
    result["wavelength_nm"]      = parent.wavelength_nm
    result["numerical_aperture"] = parent.numerical_aperture
    result["m2_value"]           = parent.m2_value
    result["bpp_mm_mrad"]        = parent.bpp_mm_mrad
    result["remarks"]            = parent.remarks
    return result


@router.put("/laser-beams/combined/{item_id}")
def update_laser_beam_combined(item_id: str, body: dict = Body(...),
                               db: Session = Depends(get_db)):
    entry = db.get(LaserBeamEntry, item_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")

    wavelength_nm      = body.pop("wavelength_nm", None)
    numerical_aperture = body.pop("numerical_aperture", None)
    m2_value           = body.pop("m2_value", None)
    bpp_mm_mrad        = body.pop("bpp_mm_mrad", None)
    remarks_val        = body.pop("remarks", None)
    body.pop("laser_beam_id", None)   # laser_beam_id は変更不可

    if entry.laser_beam:
        if wavelength_nm      is not None: entry.laser_beam.wavelength_nm      = wavelength_nm
        if numerical_aperture is not None: entry.laser_beam.numerical_aperture = numerical_aperture
        if m2_value           is not None: entry.laser_beam.m2_value           = m2_value
        if bpp_mm_mrad        is not None: entry.laser_beam.bpp_mm_mrad        = bpp_mm_mrad
        if remarks_val        is not None: entry.laser_beam.remarks            = remarks_val

    for k, v in body.items():
        if k != "laser_beam_entry_id" and hasattr(entry, k):
            setattr(entry, k, v)

    db.commit()
    db.refresh(entry)

    result = _row(entry)
    lb = entry.laser_beam
    result["wavelength_nm"]      = lb.wavelength_nm      if lb else None
    result["numerical_aperture"] = lb.numerical_aperture if lb else None
    result["m2_value"]           = lb.m2_value           if lb else None
    result["bpp_mm_mrad"]        = lb.bpp_mm_mrad        if lb else None
    result["remarks"]            = lb.remarks            if lb else None
    return result


@router.get("/laser-beams/{item_id}")
def get_laser_beam(item_id: str, db: Session = Depends(get_db)):
    return _get_one(LaserBeam, "laser_beam_id", item_id, db)

@router.post("/laser-beams", status_code=201)
def create_laser_beam(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(LaserBeam, "laser_beam_id", body, db)

@router.put("/laser-beams/{item_id}")
def update_laser_beam(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(LaserBeam, "laser_beam_id", item_id, body, db)

@router.delete("/laser-beams/{item_id}", status_code=204)
def delete_laser_beam(item_id: str, db: Session = Depends(get_db)):
    _delete_one(LaserBeam, "laser_beam_id", item_id, db)

@router.get("/laser-beams/{item_id}/detail")
def get_laser_beam_detail(item_id: str, db: Session = Depends(get_db)):
    lb = (db.query(LaserBeam)
          .options(joinedload(LaserBeam.entries))
          .filter(LaserBeam.laser_beam_id == item_id)
          .first())
    if not lb:
        raise HTTPException(404)
    result = _row(lb)
    result["entries"] = [_row(e) for e in lb.entries]
    return result


# ── LaserBeamEntry ────────────────────────────────────────────────────────────

@router.get("/laser-beam-entries")
def list_laser_beam_entries(db: Session = Depends(get_db)):
    return _list_all(LaserBeamEntry, db)

@router.get("/laser-beam-entries/{item_id}")
def get_laser_beam_entry(item_id: str, db: Session = Depends(get_db)):
    return _get_one(LaserBeamEntry, "laser_beam_entry_id", item_id, db)

@router.post("/laser-beam-entries", status_code=201)
def create_laser_beam_entry(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(LaserBeamEntry, "laser_beam_entry_id", body, db)

@router.put("/laser-beam-entries/{item_id}")
def update_laser_beam_entry(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(LaserBeamEntry, "laser_beam_entry_id", item_id, body, db)

@router.delete("/laser-beam-entries/{item_id}", status_code=204)
def delete_laser_beam_entry(item_id: str, db: Session = Depends(get_db)):
    _delete_one(LaserBeamEntry, "laser_beam_entry_id", item_id, db)


# ── LaserDevice ───────────────────────────────────────────────────────────────

@router.get("/laser-devices")
def list_laser_devices(db: Session = Depends(get_db)):
    return _list_all(LaserDevice, db)

@router.get("/laser-devices/{item_id}")
def get_laser_device(item_id: str, db: Session = Depends(get_db)):
    return _get_one(LaserDevice, "laser_device_id", item_id, db)

@router.post("/laser-devices", status_code=201)
def create_laser_device(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(LaserDevice, "laser_device_id", body, db)

@router.put("/laser-devices/{item_id}")
def update_laser_device(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(LaserDevice, "laser_device_id", item_id, body, db)

@router.delete("/laser-devices/{item_id}", status_code=204)
def delete_laser_device(item_id: str, db: Session = Depends(get_db)):
    _delete_one(LaserDevice, "laser_device_id", item_id, db)

@router.get("/laser-devices/{item_id}/detail")
def get_laser_device_detail(item_id: str, db: Session = Depends(get_db)):
    ld = (db.query(LaserDevice)
          .options(
              joinedload(LaserDevice.laser_beam).joinedload(LaserBeam.entries)
          )
          .filter(LaserDevice.laser_device_id == item_id)
          .first())
    if not ld:
        raise HTTPException(404)
    result = _row(ld)
    if ld.laser_beam:
        lb = ld.laser_beam
        result["laser_beam"] = {**_row(lb), "entries": [_row(e) for e in lb.entries]}
    else:
        result["laser_beam"] = None
    return result


# ── Ftheta ────────────────────────────────────────────────────────────────────

@router.get("/ftheta")
def list_ftheta(db: Session = Depends(get_db)):
    return _list_all(Ftheta, db)

@router.get("/ftheta/{item_id}")
def get_ftheta(item_id: str, db: Session = Depends(get_db)):
    return _get_one(Ftheta, "ftheta_id", item_id, db)

@router.post("/ftheta", status_code=201)
def create_ftheta(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(Ftheta, "ftheta_id", body, db)

@router.put("/ftheta/{item_id}")
def update_ftheta(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(Ftheta, "ftheta_id", item_id, body, db)

@router.delete("/ftheta/{item_id}", status_code=204)
def delete_ftheta(item_id: str, db: Session = Depends(get_db)):
    _delete_one(Ftheta, "ftheta_id", item_id, db)


# ── Optics ────────────────────────────────────────────────────────────────────

@router.get("/optics")
def list_optics(db: Session = Depends(get_db)):
    return _list_all(Optics, db)

# ── Optics / combined (flat: one row per OpticsEntry with parent fields) ──────

@router.get("/optics/combined")
def list_optics_combined(db: Session = Depends(get_db)):
    entries = (
        db.query(OpticsEntry)
        .options(joinedload(OpticsEntry.optics))
        .all()
    )
    rows = []
    for oe in entries:
        row = _row(oe)
        row["manufacturer"] = oe.optics.manufacturer if oe.optics else None
        row["remarks"]      = oe.optics.remarks      if oe.optics else None
        rows.append(row)
    return rows


@router.post("/optics/combined", status_code=201)
def create_optics_combined(body: dict = Body(...), db: Session = Depends(get_db)):
    manufacturer = body.pop("manufacturer", None)
    remarks_val  = body.pop("remarks", None)
    optics_id    = body.pop("optics_id", None)

    if optics_id:
        parent = db.get(Optics, optics_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Optics parent not found")
    else:
        parent = Optics(optics_id=str(uuid.uuid4()),
                        manufacturer=manufacturer, remarks=remarks_val)
        db.add(parent)
        db.flush()

    entry_fields = {k: v for k, v in body.items()
                    if hasattr(OpticsEntry, k) and k != "optics_entry_id"}
    entry_fields["optics_id"] = parent.optics_id
    entry = OpticsEntry(optics_entry_id=str(uuid.uuid4()), **entry_fields)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    db.refresh(parent)

    result = _row(entry)
    result["manufacturer"] = parent.manufacturer
    result["remarks"]      = parent.remarks
    return result


@router.put("/optics/combined/{item_id}")
def update_optics_combined(item_id: str, body: dict = Body(...),
                           db: Session = Depends(get_db)):
    entry = db.get(OpticsEntry, item_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")

    manufacturer = body.pop("manufacturer", None)
    remarks_val  = body.pop("remarks", None)
    body.pop("optics_id", None)   # optics_id は変更不可

    if entry.optics:
        if manufacturer is not None:
            entry.optics.manufacturer = manufacturer
        if remarks_val is not None:
            entry.optics.remarks = remarks_val

    for k, v in body.items():
        if k != "optics_entry_id" and hasattr(entry, k):
            setattr(entry, k, v)

    db.commit()
    db.refresh(entry)

    result = _row(entry)
    result["manufacturer"] = entry.optics.manufacturer if entry.optics else None
    result["remarks"]      = entry.optics.remarks      if entry.optics else None
    return result


@router.get("/optics/{item_id}")
def get_optics(item_id: str, db: Session = Depends(get_db)):
    return _get_one(Optics, "optics_id", item_id, db)

@router.post("/optics", status_code=201)
def create_optics(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(Optics, "optics_id", body, db)

@router.put("/optics/{item_id}")
def update_optics(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(Optics, "optics_id", item_id, body, db)

@router.delete("/optics/{item_id}", status_code=204)
def delete_optics(item_id: str, db: Session = Depends(get_db)):
    _delete_one(Optics, "optics_id", item_id, db)

@router.get("/optics/{item_id}/detail")
def get_optics_detail(item_id: str, db: Session = Depends(get_db)):
    optics = (db.query(Optics)
              .options(
                  joinedload(Optics.entries).joinedload(OpticsEntry.laser_device)
                      .joinedload(LaserDevice.laser_beam).joinedload(LaserBeam.entries),
                  joinedload(Optics.entries).joinedload(OpticsEntry.doe),
              )
              .filter(Optics.optics_id == item_id)
              .first())
    if not optics:
        raise HTTPException(404)
    result = _row(optics)
    entries = []
    for oe in optics.entries:
        e = _row(oe)
        if oe.laser_device:
            ld = oe.laser_device
            lb = ld.laser_beam
            e["laser_device"] = {
                **_row(ld),
                "laser_beam": ({**_row(lb), "entries": [_row(be) for be in lb.entries]} if lb else None),
            }
        else:
            e["laser_device"] = None
        e["doe"] = _row(oe.doe) if oe.doe else None
        entries.append(e)
    result["entries"] = entries
    return result


# ── OpticsEntry ───────────────────────────────────────────────────────────────

@router.get("/optics-entries")
def list_optics_entries(db: Session = Depends(get_db)):
    return _list_all(OpticsEntry, db)

@router.get("/optics-entries/{item_id}")
def get_optics_entry(item_id: str, db: Session = Depends(get_db)):
    return _get_one(OpticsEntry, "optics_entry_id", item_id, db)

@router.post("/optics-entries", status_code=201)
def create_optics_entry(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(OpticsEntry, "optics_entry_id", body, db)

@router.put("/optics-entries/{item_id}")
def update_optics_entry(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(OpticsEntry, "optics_entry_id", item_id, body, db)

@router.delete("/optics-entries/{item_id}", status_code=204)
def delete_optics_entry(item_id: str, db: Session = Depends(get_db)):
    _delete_one(OpticsEntry, "optics_entry_id", item_id, db)


# ── Doe ───────────────────────────────────────────────────────────────────────

@router.get("/doe")
def list_doe(db: Session = Depends(get_db)):
    return _list_all(Doe, db)

@router.get("/doe/{item_id}")
def get_doe(item_id: str, db: Session = Depends(get_db)):
    return _get_one(Doe, "doe_id", item_id, db)

@router.post("/doe", status_code=201)
def create_doe(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(Doe, "doe_id", body, db)

@router.put("/doe/{item_id}")
def update_doe(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(Doe, "doe_id", item_id, body, db)

@router.delete("/doe/{item_id}", status_code=204)
def delete_doe(item_id: str, db: Session = Depends(get_db)):
    _delete_one(Doe, "doe_id", item_id, db)


# ── GalvanoSystem ─────────────────────────────────────────────────────────────

@router.get("/galvano-systems")
def list_galvano_systems(db: Session = Depends(get_db)):
    return _list_all(GalvanoSystem, db)

@router.get("/galvano-systems/{item_id}")
def get_galvano_system(item_id: str, db: Session = Depends(get_db)):
    return _get_one(GalvanoSystem, "galvano_system_id", item_id, db)

@router.post("/galvano-systems", status_code=201)
def create_galvano_system(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(GalvanoSystem, "galvano_system_id", body, db)

@router.put("/galvano-systems/{item_id}")
def update_galvano_system(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(GalvanoSystem, "galvano_system_id", item_id, body, db)

@router.delete("/galvano-systems/{item_id}", status_code=204)
def delete_galvano_system(item_id: str, db: Session = Depends(get_db)):
    _delete_one(GalvanoSystem, "galvano_system_id", item_id, db)

@router.get("/galvano-systems/{item_id}/detail")
def get_galvano_system_detail(item_id: str, db: Session = Depends(get_db)):
    gs = (db.query(GalvanoSystem)
          .options(
              joinedload(GalvanoSystem.ftheta),
              joinedload(GalvanoSystem.optics)
                  .joinedload(Optics.entries)
                  .joinedload(OpticsEntry.laser_device)
                  .joinedload(LaserDevice.laser_beam)
                  .joinedload(LaserBeam.entries),
              joinedload(GalvanoSystem.optics)
                  .joinedload(Optics.entries)
                  .joinedload(OpticsEntry.doe),
          )
          .filter(GalvanoSystem.galvano_system_id == item_id)
          .first())
    if not gs:
        raise HTTPException(404)
    result = _row(gs)
    result["ftheta"] = _row(gs.ftheta) if gs.ftheta else None
    if gs.optics:
        entries = []
        for oe in gs.optics.entries:
            e = _row(oe)
            if oe.laser_device:
                ld = oe.laser_device
                lb = ld.laser_beam
                e["laser_device"] = {
                    **_row(ld),
                    "laser_beam": ({**_row(lb), "entries": [_row(be) for be in lb.entries]} if lb else None),
                }
            else:
                e["laser_device"] = None
            e["doe"] = _row(oe.doe) if oe.doe else None
            entries.append(e)
        result["optics"] = {**_row(gs.optics), "entries": entries}
    else:
        result["optics"] = None
    return result


# ── WeldingCondition ──────────────────────────────────────────────────────────

@router.get("/welding-conditions")
def list_welding_conditions(db: Session = Depends(get_db)):
    return _list_all(WeldingCondition, db)

@router.get("/welding-conditions/{item_id}")
def get_welding_condition(item_id: str, db: Session = Depends(get_db)):
    return _get_one(WeldingCondition, "welding_condition_id", item_id, db)

@router.post("/welding-conditions", status_code=201)
def create_welding_condition(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(WeldingCondition, "welding_condition_id", body, db)

@router.put("/welding-conditions/{item_id}")
def update_welding_condition(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(WeldingCondition, "welding_condition_id", item_id, body, db)

@router.delete("/welding-conditions/{item_id}", status_code=204)
def delete_welding_condition(item_id: str, db: Session = Depends(get_db)):
    _delete_one(WeldingCondition, "welding_condition_id", item_id, db)


# ── LineParameter ───────────────────────────────────────────────────────────────

@router.get("/line-parameters")
def list_line_parameters(db: Session = Depends(get_db)):
    return _list_all(LineParameter, db)

@router.get("/line-parameters/{item_id}")
def get_line_parameter(item_id: str, db: Session = Depends(get_db)):
    return _get_one(LineParameter, "main_trajectory_type_parameter_id", item_id, db)

@router.post("/line-parameters", status_code=201)
def create_line_parameter(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(LineParameter, "main_trajectory_type_parameter_id", body, db)

@router.put("/line-parameters/{item_id}")
def update_line_parameter(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(LineParameter, "main_trajectory_type_parameter_id", item_id, body, db)

@router.delete("/line-parameters/{item_id}", status_code=204)
def delete_line_parameter(item_id: str, db: Session = Depends(get_db)):
    _delete_one(LineParameter, "main_trajectory_type_parameter_id", item_id, db)


# ── MainTrajectory ──────────────────────────────────────────────────────────────

@router.get("/main-trajectories")
def list_main_trajectories(db: Session = Depends(get_db)):
    return _list_all(MainTrajectory, db)

@router.get("/main-trajectories/{item_id}")
def get_main_trajectory(item_id: str, db: Session = Depends(get_db)):
    return _get_one(MainTrajectory, "main_trajectory_id", item_id, db)

@router.post("/main-trajectories", status_code=201)
def create_main_trajectory(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(MainTrajectory, "main_trajectory_id", body, db)

@router.put("/main-trajectories/{item_id}")
def update_main_trajectory(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(MainTrajectory, "main_trajectory_id", item_id, body, db)

@router.delete("/main-trajectories/{item_id}", status_code=204)
def delete_main_trajectory(item_id: str, db: Session = Depends(get_db)):
    _delete_one(MainTrajectory, "main_trajectory_id", item_id, db)


# ── WobblingParameter ────────────────────────────────────────────────────────────

@router.get("/wobbling-parameters")
def list_wobbling_parameters(db: Session = Depends(get_db)):
    return _list_all(WobblingParameter, db)

@router.get("/wobbling-parameters/{item_id}")
def get_wobbling_parameter(item_id: str, db: Session = Depends(get_db)):
    return _get_one(WobblingParameter, "sub_trajectory_type_parameter_id", item_id, db)

@router.post("/wobbling-parameters", status_code=201)
def create_wobbling_parameter(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(WobblingParameter, "sub_trajectory_type_parameter_id", body, db)

@router.put("/wobbling-parameters/{item_id}")
def update_wobbling_parameter(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(WobblingParameter, "sub_trajectory_type_parameter_id", item_id, body, db)

@router.delete("/wobbling-parameters/{item_id}", status_code=204)
def delete_wobbling_parameter(item_id: str, db: Session = Depends(get_db)):
    _delete_one(WobblingParameter, "sub_trajectory_type_parameter_id", item_id, db)


# ── SubTrajectory ───────────────────────────────────────────────────────────────

@router.get("/sub-trajectories")
def list_sub_trajectories(db: Session = Depends(get_db)):
    return _list_all(SubTrajectory, db)

@router.get("/sub-trajectories/{item_id}")
def get_sub_trajectory(item_id: str, db: Session = Depends(get_db)):
    return _get_one(SubTrajectory, "sub_trajectory_id", item_id, db)

@router.post("/sub-trajectories", status_code=201)
def create_sub_trajectory(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(SubTrajectory, "sub_trajectory_id", body, db)

@router.put("/sub-trajectories/{item_id}")
def update_sub_trajectory(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(SubTrajectory, "sub_trajectory_id", item_id, body, db)

@router.delete("/sub-trajectories/{item_id}", status_code=204)
def delete_sub_trajectory(item_id: str, db: Session = Depends(get_db)):
    _delete_one(SubTrajectory, "sub_trajectory_id", item_id, db)


# ── TrajectorySet ───────────────────────────────────────────────────────────────

@router.get("/trajectory-sets")
def list_trajectory_sets(db: Session = Depends(get_db)):
    return _list_all(TrajectorySet, db)

@router.get("/trajectory-sets/{item_id}")
def get_trajectory_set(item_id: str, db: Session = Depends(get_db)):
    return _get_one(TrajectorySet, "trajectory_set_id", item_id, db)

@router.post("/trajectory-sets", status_code=201)
def create_trajectory_set(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(TrajectorySet, "trajectory_set_id", body, db)

@router.put("/trajectory-sets/{item_id}")
def update_trajectory_set(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(TrajectorySet, "trajectory_set_id", item_id, body, db)

@router.delete("/trajectory-sets/{item_id}", status_code=204)
def delete_trajectory_set(item_id: str, db: Session = Depends(get_db)):
    _delete_one(TrajectorySet, "trajectory_set_id", item_id, db)

@router.get("/trajectory-sets/{item_id}/detail")
def get_trajectory_set_detail(item_id: str, db: Session = Depends(get_db)):
    ts = (db.query(TrajectorySet)
          .options(
              joinedload(TrajectorySet.main_trajectory).joinedload(MainTrajectory.line_parameter),
              joinedload(TrajectorySet.sub_trajectory).joinedload(SubTrajectory.wobbling_parameter),
          )
          .filter(TrajectorySet.trajectory_set_id == item_id)
          .first())
    if not ts:
        raise HTTPException(404)
    result = _row(ts)
    if ts.main_trajectory:
        mt = ts.main_trajectory
        mt_data = _row(mt)
        mt_data["line_parameter"] = _row(mt.line_parameter) if mt.line_parameter else None
        result["main_trajectory"] = mt_data
    else:
        result["main_trajectory"] = None
    if ts.sub_trajectory:
        st = ts.sub_trajectory
        st_data = _row(st)
        st_data["wobbling_parameter"] = _row(st.wobbling_parameter) if st.wobbling_parameter else None
        result["sub_trajectory"] = st_data
    else:
        result["sub_trajectory"] = None
    return result


# ── ShieldingCondition ────────────────────────────────────────────────────────

@router.get("/shielding-conditions")
def list_shielding_conditions(db: Session = Depends(get_db)):
    return _list_all(ShieldingCondition, db)

@router.get("/shielding-conditions/{item_id}")
def get_shielding_condition(item_id: str, db: Session = Depends(get_db)):
    return _get_one(ShieldingCondition, "shielding_condition_id", item_id, db)

@router.post("/shielding-conditions", status_code=201)
def create_shielding_condition(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(ShieldingCondition, "shielding_condition_id", body, db)

@router.put("/shielding-conditions/{item_id}")
def update_shielding_condition(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(ShieldingCondition, "shielding_condition_id", item_id, body, db)

@router.delete("/shielding-conditions/{item_id}", status_code=204)
def delete_shielding_condition(item_id: str, db: Session = Depends(get_db)):
    _delete_one(ShieldingCondition, "shielding_condition_id", item_id, db)


# ── Result ────────────────────────────────────────────────────────────────────

@router.get("/results")
def list_results(db: Session = Depends(get_db)):
    return _list_all(Result, db)

@router.get("/results/{item_id}")
def get_result(item_id: str, db: Session = Depends(get_db)):
    return _get_one(Result, "result_id", item_id, db)

@router.post("/results", status_code=201)
def create_result(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(Result, "result_id", body, db)

@router.put("/results/{item_id}")
def update_result(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(Result, "result_id", item_id, body, db)

@router.delete("/results/{item_id}", status_code=204)
def delete_result(item_id: str, db: Session = Depends(get_db)):
    _delete_one(Result, "result_id", item_id, db)


# ── Observation ───────────────────────────────────────────────────────────────

@router.get("/observations")
def list_observations(db: Session = Depends(get_db)):
    return _list_all(Observation, db)

@router.get("/observations/{item_id}")
def get_observation(item_id: str, db: Session = Depends(get_db)):
    return _get_one(Observation, "observation_id", item_id, db)

@router.post("/observations", status_code=201)
def create_observation(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(Observation, "observation_id", body, db)

@router.put("/observations/{item_id}")
def update_observation(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(Observation, "observation_id", item_id, body, db)

@router.delete("/observations/{item_id}", status_code=204)
def delete_observation(item_id: str, db: Session = Depends(get_db)):
    _delete_one(Observation, "observation_id", item_id, db)


# ── File ─────────────────────────────────────────────────────────────────────

@router.get("/files")
def list_files(db: Session = Depends(get_db)):
    return _list_all(File, db)

@router.get("/files/{item_id}")
def get_file(item_id: str, db: Session = Depends(get_db)):
    return _get_one(File, "file_id", item_id, db)

@router.post("/files", status_code=201)
def create_file(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(File, "file_id", body, db)

@router.put("/files/{item_id}")
def update_file(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(File, "file_id", item_id, body, db)

@router.delete("/files/{item_id}", status_code=204)
def delete_file(item_id: str, db: Session = Depends(get_db)):
    _delete_one(File, "file_id", item_id, db)


# ── ExperimentMaterial ───────────────────────────────────────────────────────

@router.get("/experiment-materials")
def list_experiment_materials(db: Session = Depends(get_db)):
    return _list_all(ExperimentMaterial, db)

@router.get("/experiment-materials/{item_id}")
def get_experiment_material(item_id: str, db: Session = Depends(get_db)):
    return _get_one(ExperimentMaterial, "experiment_material_id", item_id, db)

@router.post("/experiment-materials", status_code=201)
def create_experiment_material(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(ExperimentMaterial, "experiment_material_id", body, db)

@router.put("/experiment-materials/{item_id}")
def update_experiment_material(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(ExperimentMaterial, "experiment_material_id", item_id, body, db)

@router.delete("/experiment-materials/{item_id}", status_code=204)
def delete_experiment_material(item_id: str, db: Session = Depends(get_db)):
    _delete_one(ExperimentMaterial, "experiment_material_id", item_id, db)


# ── Experiment ───────────────────────────────────────────────────────────────

@router.get("/experiments")
def list_experiments(db: Session = Depends(get_db)):
    return _list_all(Experiment, db)

@router.get("/experiments/{item_id}")
def get_experiment(item_id: str, db: Session = Depends(get_db)):
    return _get_one(Experiment, "experiment_id", item_id, db)

@router.post("/experiments", status_code=201)
def create_experiment(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(Experiment, "experiment_id", body, db)

@router.put("/experiments/{item_id}")
def update_experiment(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(Experiment, "experiment_id", item_id, body, db)

@router.delete("/experiments/{item_id}", status_code=204)
def delete_experiment(item_id: str, db: Session = Depends(get_db)):
    _delete_one(Experiment, "experiment_id", item_id, db)


# ── ColumnDef ───────────────────────────────────────────────────────────────────────────────

@router.get("/column-defs")
def list_column_defs(db: Session = Depends(get_db)):
    rows = db.query(ColumnDef).order_by(ColumnDef.table_name, ColumnDef.order_index).all()
    return [_row(r) for r in rows]


@router.post("/column-defs/init", status_code=201)
def init_column_defs(db: Session = Depends(get_db)):
    """Auto-populate ColumnDef from SQLAlchemy models (skips existing entries)."""
    existing = {(r.table_name, r.column_name) for r in db.query(ColumnDef).all()}
    created = 0
    for mapper in Base.registry.mappers:
        model_cls = mapper.class_
        if model_cls is ColumnDef:
            continue
        tbl = mapper.persist_selectable
        table_name = tbl.name.upper()
        for i, col in enumerate(tbl.columns):
            if (table_name, col.name) in existing:
                continue
            vn = getattr(col.type, "__visit_name__", "")
            if vn in ("float", "numeric"):
                dt = "float"
            elif vn == "boolean":
                dt = "boolean"
            elif vn == "integer":
                dt = "integer"
            else:
                dt = "string"
            db.add(ColumnDef(
                table_name=table_name,
                column_name=col.name,
                data_type=dt,
                candidates="",
                order_index=i,
            ))
            created += 1
    db.commit()
    return {"created": created}


@router.post("/column-defs", status_code=201)
def create_column_def(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(ColumnDef, "column_def_id", body, db)


@router.put("/column-defs/{item_id}")
def update_column_def(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(ColumnDef, "column_def_id", item_id, body, db)


@router.delete("/column-defs/{item_id}", status_code=204)
def delete_column_def(item_id: str, db: Session = Depends(get_db)):
    _delete_one(ColumnDef, "column_def_id", item_id, db)
