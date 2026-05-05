import uuid
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import case, text
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db, engine as _main_engine
from backend.models import (
    Material, MaterialState,
    LaserBeam,
    LaserDevice,
    Ftheta, Optics, Doe,
    GalvanoSystem,
    LineParameter, MainTrajectory, WobblingParameter, SubTrajectory, TrajectorySet,
    WeldingCondition, ShieldingCondition,
    Result, Observation,
    ExperimentMaterial, File, Experiment,
    Project,
    ColumnDef, Base, TrajectoryTypeDef,
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

@router.get("/material-states/{item_id}/detail")
def get_material_state_detail(item_id: str, db: Session = Depends(get_db)):
    ms = db.get(MaterialState, item_id)
    if not ms:
        raise HTTPException(404)
    result = _row(ms)
    result["material"] = _row(db.get(Material, ms.material_id)) if ms.material_id else None
    return result


# ── LaserBeam (flat, composite PK: laser_beam_id + beam_type) ────────────────

def _lb_row(item) -> dict:
    row = _row(item)
    row["_id"] = f"{item.laser_beam_id}~{item.beam_type}"
    return row


def _decode_lb_id(encoded: str):
    parts = encoded.split("~", 1)
    if len(parts) != 2:
        raise HTTPException(400, "Invalid laser_beam id format (expected laser_beam_id~beam_type)")
    return parts[0], parts[1]


_BEAM_TYPE_ORDER = case(
    (LaserBeam.beam_type == "single", 0),
    (LaserBeam.beam_type == "ring",   1),
    (LaserBeam.beam_type == "multi",  2),
    else_=9,
)

@router.get("/laser-beams")
def list_laser_beams(db: Session = Depends(get_db)):
    return [_lb_row(r) for r in db.query(LaserBeam).order_by(LaserBeam.laser_beam_id, _BEAM_TYPE_ORDER).all()]


@router.post("/laser-beams", status_code=201)
def create_laser_beam(body: dict = Body(...), db: Session = Depends(get_db)):
    body.pop("_id", None)
    laser_beam_id = body.pop("laser_beam_id", None) or str(uuid.uuid4())
    beam_type = body.get("beam_type")
    if not beam_type:
        raise HTTPException(400, "beam_type is required")
    if db.get(LaserBeam, (laser_beam_id, beam_type)):
        raise HTTPException(409, "LaserBeam row already exists")
    filtered = {k: v for k, v in body.items() if hasattr(LaserBeam, k)}
    item = LaserBeam(laser_beam_id=laser_beam_id, **filtered)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _lb_row(item)


@router.put("/laser-beams/{encoded_id}")
def update_laser_beam(encoded_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    lb_id, btype = _decode_lb_id(encoded_id)
    item = db.get(LaserBeam, (lb_id, btype))
    if not item:
        raise HTTPException(404)
    body.pop("_id", None)
    for k, v in body.items():
        if k not in ("laser_beam_id", "beam_type") and hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return _lb_row(item)


@router.delete("/laser-beams/{encoded_id}", status_code=204)
def delete_laser_beam(encoded_id: str, db: Session = Depends(get_db)):
    lb_id, btype = _decode_lb_id(encoded_id)
    item = db.get(LaserBeam, (lb_id, btype))
    if not item:
        raise HTTPException(404)
    db.delete(item)
    db.commit()


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
    ld = db.get(LaserDevice, item_id)
    if not ld:
        raise HTTPException(404)
    result = _row(ld)
    if ld.laser_beam_id:
        lb_rows = db.query(LaserBeam).filter(LaserBeam.laser_beam_id == ld.laser_beam_id).all()
        result["laser_beams"] = [_lb_row(r) for r in lb_rows]
    else:
        result["laser_beams"] = []
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


# ── Optics (flat, composite PK: optics_id + optics_role) ─────────────────────

def _optics_row(item) -> dict:
    row = _row(item)
    row["_id"] = f"{item.optics_id}~{item.optics_role}"
    return row


def _decode_optics_id(encoded: str):
    parts = encoded.split("~", 1)
    if len(parts) != 2:
        raise HTTPException(400, "Invalid optics id format (expected optics_id~optics_role)")
    return parts[0], parts[1]


_OPTICS_ROLE_ORDER = case(
    (Optics.optics_role == "main", 0),
    (Optics.optics_role == "sub",  1),
    (Optics.optics_role == "OCT",  2),
    else_=9,
)

@router.get("/optics")
def list_optics(db: Session = Depends(get_db)):
    return [_optics_row(r) for r in db.query(Optics).order_by(Optics.optics_id, _OPTICS_ROLE_ORDER).all()]


@router.post("/optics", status_code=201)
def create_optics(body: dict = Body(...), db: Session = Depends(get_db)):
    body.pop("_id", None)
    optics_id = body.pop("optics_id", None) or str(uuid.uuid4())
    optics_role = body.get("optics_role")
    if not optics_role:
        raise HTTPException(400, "optics_role is required")
    if db.get(Optics, (optics_id, optics_role)):
        raise HTTPException(409, "Optics row already exists")
    filtered = {k: v for k, v in body.items() if hasattr(Optics, k)}
    item = Optics(optics_id=optics_id, **filtered)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _optics_row(item)


@router.put("/optics/{encoded_id}")
def update_optics(encoded_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    oid, role = _decode_optics_id(encoded_id)
    item = db.get(Optics, (oid, role))
    if not item:
        raise HTTPException(404)
    body.pop("_id", None)
    for k, v in body.items():
        if k not in ("optics_id", "optics_role") and hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return _optics_row(item)


@router.delete("/optics/{encoded_id}", status_code=204)
def delete_optics(encoded_id: str, db: Session = Depends(get_db)):
    oid, role = _decode_optics_id(encoded_id)
    item = db.get(Optics, (oid, role))
    if not item:
        raise HTTPException(404)
    db.delete(item)
    db.commit()


@router.get("/optics/{encoded_id}/detail")
def get_optics_detail(encoded_id: str, db: Session = Depends(get_db)):
    oid, role = _decode_optics_id(encoded_id)
    item = db.get(Optics, (oid, role))
    if not item:
        raise HTTPException(404)
    return _enrich_optics(item, db)

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
    gs = db.get(GalvanoSystem, item_id)
    if not gs:
        raise HTTPException(404)
    result = _row(gs)
    result["ftheta"] = _row(db.get(Ftheta, gs.ftheta_id)) if gs.ftheta_id else None
    if gs.optics_id:
        optics_rows = db.query(Optics).filter(Optics.optics_id == gs.optics_id).order_by(_OPTICS_ROLE_ORDER).all()
        result["optics"] = [_enrich_optics(r, db) for r in optics_rows]
    else:
        result["optics"] = []
    return result


# ── Shared enrichment helpers ─────────────────────────────────────────────────

def _enrich_optics(item: Optics, db) -> dict:
    row = _optics_row(item)
    if item.laser_device_id:
        ld = db.get(LaserDevice, item.laser_device_id)
        if ld:
            ld_data = _row(ld)
            if ld.laser_beam_id:
                lb_rows = db.query(LaserBeam).filter(LaserBeam.laser_beam_id == ld.laser_beam_id).all()
                ld_data["laser_beams"] = [_lb_row(r) for r in lb_rows]
            else:
                ld_data["laser_beams"] = []
            row["laser_device"] = ld_data
        else:
            row["laser_device"] = None
    else:
        row["laser_device"] = None
    row["doe"] = _row(db.get(Doe, item.doe_id)) if item.doe_id else None
    return row


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

@router.get("/welding-conditions/{item_id}/detail")
def get_welding_condition_detail(item_id: str, db: Session = Depends(get_db)):
    wc = db.get(WeldingCondition, item_id)
    if not wc:
        raise HTTPException(404)
    result = _row(wc)
    if wc.trajectory_set_id:
        ts = db.get(TrajectorySet, wc.trajectory_set_id)
        if ts:
            ts_data = _row(ts)
            if ts.main_trajectory_id:
                mt = db.get(MainTrajectory, ts.main_trajectory_id)
                if mt:
                    mt_data = _row(mt)
                    mt_data["line_parameter"] = _row(db.get(LineParameter, mt.main_trajectory_parameter_id)) if mt.main_trajectory_parameter_id else None
                    ts_data["main_trajectory"] = mt_data
                else:
                    ts_data["main_trajectory"] = None
            else:
                ts_data["main_trajectory"] = None
            if ts.sub_trajectory_id:
                st = db.get(SubTrajectory, ts.sub_trajectory_id)
                if st:
                    st_data = _row(st)
                    st_data["wobbling_parameter"] = _row(db.get(WobblingParameter, st.sub_trajectory_parameter_id)) if st.sub_trajectory_parameter_id else None
                    ts_data["sub_trajectory"] = st_data
                else:
                    ts_data["sub_trajectory"] = None
            else:
                ts_data["sub_trajectory"] = None
            result["trajectory_set"] = ts_data
        else:
            result["trajectory_set"] = None
    else:
        result["trajectory_set"] = None
    return result


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

@router.get("/main-trajectories/{item_id}/detail")
def get_main_trajectory_detail(item_id: str, db: Session = Depends(get_db)):
    mt = db.get(MainTrajectory, item_id)
    if not mt:
        raise HTTPException(404)
    result = _row(mt)
    result["line_parameter"] = _row(db.get(LineParameter, mt.main_trajectory_parameter_id)) if mt.main_trajectory_parameter_id else None
    return result


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

@router.get("/sub-trajectories/{item_id}/detail")
def get_sub_trajectory_detail(item_id: str, db: Session = Depends(get_db)):
    st = db.get(SubTrajectory, item_id)
    if not st:
        raise HTTPException(404)
    result = _row(st)
    result["wobbling_parameter"] = _row(db.get(WobblingParameter, st.sub_trajectory_parameter_id)) if st.sub_trajectory_parameter_id else None
    return result


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


# ── Project ───────────────────────────────────────────────────────────────────

@router.get("/projects")
def list_projects_master(db: Session = Depends(get_db)):
    return _list_all(Project, db)

@router.get("/projects/{item_id}")
def get_project_master(item_id: str, db: Session = Depends(get_db)):
    return _get_one(Project, "project_id", item_id, db)

@router.post("/projects", status_code=201)
def create_project_master(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(Project, "project_id", body, db)

@router.put("/projects/{item_id}")
def update_project_master(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    return _update_one(Project, "project_id", item_id, body, db)

@router.delete("/projects/{item_id}", status_code=204)
def delete_project_master(item_id: str, db: Session = Depends(get_db)):
    _delete_one(Project, "project_id", item_id, db)


# ── ExperimentMaterial ───────────────────────────────────────────────────────

@router.get("/experiment-materials")
def list_experiment_materials(db: Session = Depends(get_db)):
    return _list_all(ExperimentMaterial, db)

@router.get("/experiment-materials/{item_id}")
def get_experiment_material(item_id: str, db: Session = Depends(get_db)):
    rows = db.query(ExperimentMaterial).filter(
        ExperimentMaterial.experiment_material_id == item_id
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="Not found")
    return [_row(r) for r in rows]

@router.post("/experiment-materials", status_code=201)
def create_experiment_material(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(ExperimentMaterial, "experiment_material_id", body, db)

@router.put("/experiment-materials/{item_id}")
def update_experiment_material(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    # body must contain material_role to identify the specific row
    role = body.get("material_role")
    if not role:
        raise HTTPException(status_code=422, detail="material_role is required")
    item = db.get(ExperimentMaterial, (item_id, role))
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.items():
        if k not in ("experiment_material_id", "material_role") and hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return _row(item)

@router.delete("/experiment-materials/{item_id}", status_code=204)
def delete_experiment_material(item_id: str, db: Session = Depends(get_db)):
    rows = db.query(ExperimentMaterial).filter(
        ExperimentMaterial.experiment_material_id == item_id
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="Not found")
    for r in rows:
        db.delete(r)
    db.commit()

@router.get("/experiment-materials/{item_id}/detail")
def get_experiment_material_detail(item_id: str, db: Session = Depends(get_db)):
    rows = db.query(ExperimentMaterial).filter(
        ExperimentMaterial.experiment_material_id == item_id
    ).all()
    if not rows:
        raise HTTPException(404)
    result = []
    for em in rows:
        em_data = _row(em)
        if em.material_state_id:
            ms = db.get(MaterialState, em.material_state_id)
            if ms:
                ms_data = _row(ms)
                ms_data["material"] = _row(db.get(Material, ms.material_id)) if ms.material_id else None
                em_data["material_state"] = ms_data
            else:
                em_data["material_state"] = None
        else:
            em_data["material_state"] = None
        result.append(em_data)
    return result


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
def list_column_defs(table_name: str | None = None, db: Session = Depends(get_db)):
    q = db.query(ColumnDef).order_by(ColumnDef.table_name, ColumnDef.order_index)
    if table_name:
        q = q.filter(ColumnDef.table_name == table_name)
    return [_row(r) for r in q.all()]


@router.post("/column-defs/init", status_code=201)
def init_column_defs(db: Session = Depends(get_db)):
    """Auto-populate ColumnDef from SQLAlchemy models (deduplicates existing, then adds missing)."""
    # ── Step 1: deduplicate existing rows ──────────────────────────────────
    from collections import defaultdict
    all_rows = db.query(ColumnDef).all()
    groups: dict = defaultdict(list)
    for r in all_rows:
        groups[(r.table_name, r.column_name)].append(r)
    deleted = 0
    for key, rows in groups.items():
        if len(rows) <= 1:
            continue
        # prefer the row with is_id='pk', then smallest order_index
        rows.sort(key=lambda r: (0 if r.is_id == "pk" else 1, r.order_index or 0))
        for dup in rows[1:]:
            db.delete(dup)
            deleted += 1
    db.commit()

    # ── Step 2: add missing column defs ────────────────────────────────────
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
    return {"deleted_duplicates": deleted, "created": created}


@router.post("/column-defs/sync-fk/{column_name}")
def sync_fk_for_column(column_name: str, db: Session = Depends(get_db)):
    """Set is_id='fk' on all column_def rows with given column_name that aren't already 'pk'."""
    rows = db.query(ColumnDef).filter(
        ColumnDef.column_name == column_name,
        ColumnDef.is_id != "pk",
    ).all()
    for row in rows:
        row.is_id = "fk"
    db.commit()
    return {"updated": len(rows)}


@router.post("/column-defs/reorder", status_code=200)
def reorder_column_defs(body: list = Body(...), db: Session = Depends(get_db)):
    """Bulk update order_index. Body: [{id, order_index}, ...]"""
    for item in body:
        row = db.get(ColumnDef, item["id"])
        if row:
            row.order_index = item["order_index"]
    db.commit()
    return {"updated": len(body)}


@router.post("/column-defs", status_code=201)
def create_column_def(body: dict = Body(...), db: Session = Depends(get_db)):
    return _create_one(ColumnDef, "column_def_id", body, db)


@router.get("/column-defs/{item_id}")
def get_column_def(item_id: str, db: Session = Depends(get_db)):
    return _get_one(ColumnDef, "column_def_id", item_id, db)


@router.delete("/column-defs/fk-by-column/{column_name}", status_code=204)
def delete_fk_by_column(column_name: str, db: Session = Depends(get_db)):
    """Delete all FK rows with the given column_name (is_id == 'fk')."""
    db.query(ColumnDef).filter(
        ColumnDef.column_name == column_name,
        ColumnDef.is_id == "fk",
    ).delete(synchronize_session=False)
    db.commit()


@router.put("/column-defs/{item_id}")
def update_column_def(item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    result = _update_one(ColumnDef, "column_def_id", item_id, body, db)
    # Re-sync trajectory types when trajectory_type candidates change
    row = db.get(ColumnDef, item_id)
    if row and row.column_name in ("main_trajectory_type", "sub_trajectory_type"):
        sync_trajectory_type_defs(db)
    return result


@router.delete("/column-defs/{item_id}", status_code=204)
def delete_column_def(item_id: str, db: Session = Depends(get_db)):
    _delete_one(ColumnDef, "column_def_id", item_id, db)


# ── Trajectory type defs ──────────────────────────────────────────────────────

# Built-in types that use legacy table/pk names (existing tables keep their names)
_TRAJ_BUILTINS: dict[tuple[str, str], tuple[str, str]] = {
    ("main", "line"):     ("line_parameter",     "main_trajectory_type_parameter_id"),
    ("sub",  "wobbling"): ("wobbling_parameter",  "sub_trajectory_type_parameter_id"),
}


def _parse_candidates(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = raw.replace("|", "/").split("/")
    return [p.split(";;")[0].strip() for p in parts if p.strip()]


def sync_trajectory_type_defs(db: Session) -> None:
    """Ensure trajectory_type_def table is populated from column_def candidates
    and that the corresponding parameter tables exist in the DB."""
    Base.metadata.create_all(bind=_main_engine, tables=[TrajectoryTypeDef.__table__])

    for parent, col_table, col_col in [
        ("main", "MAIN_TRAJECTORY", "main_trajectory_type"),
        ("sub",  "SUB_TRAJECTORY",  "sub_trajectory_type"),
    ]:
        row = db.execute(
            text("SELECT candidates FROM column_def WHERE table_name=:t AND column_name=:c"),
            {"t": col_table, "c": col_col},
        ).fetchone()
        if not row or not row[0]:
            continue
        for type_name in _parse_candidates(row[0]):
            exists = db.execute(
                text("SELECT 1 FROM trajectory_type_def WHERE parent=:p AND type_name=:n"),
                {"p": parent, "n": type_name},
            ).fetchone()
            if exists:
                continue
            builtin = _TRAJ_BUILTINS.get((parent, type_name))
            if builtin:
                param_table, pk_col = builtin
            else:
                param_table = f"{type_name}_parameter"
                pk_col      = f"{type_name}_parameter_id"
            # Create parameter table if missing
            db.execute(text(
                f'CREATE TABLE IF NOT EXISTS "{param_table}" '
                f'("{pk_col}" TEXT PRIMARY KEY, remarks TEXT)'
            ))
            db.commit()
            db.execute(
                text(
                    "INSERT OR IGNORE INTO trajectory_type_def "
                    "(type_def_id, parent, type_name, param_table, pk_col) "
                    "VALUES (:id, :p, :n, :tbl, :pk)"
                ),
                {"id": str(uuid.uuid4()), "p": parent, "n": type_name,
                 "tbl": param_table, "pk": pk_col},
            )
    db.commit()


@router.get("/trajectory-type-defs")
def list_trajectory_type_defs(db: Session = Depends(get_db)):
    Base.metadata.create_all(bind=_main_engine, tables=[TrajectoryTypeDef.__table__])
    rows = db.query(TrajectoryTypeDef).order_by(
        TrajectoryTypeDef.parent, TrajectoryTypeDef.type_name
    ).all()
    return [_row(r) for r in rows]


@router.post("/trajectory-type-defs/sync", status_code=200)
def trigger_sync(db: Session = Depends(get_db)):
    sync_trajectory_type_defs(db)
    return {"status": "ok"}


# ── Generic dynamic parameter table CRUD ─────────────────────────────────────
# Endpoint slug uses hyphens (e.g. circle-parameter → circle_parameter table)

def _slug_to_table(slug: str) -> str:
    return slug.replace("-", "_")


@router.get("/dyn-params/{slug}")
def list_dyn_params(slug: str, db: Session = Depends(get_db)):
    table = _slug_to_table(slug)
    rows = db.execute(text(f'SELECT * FROM "{table}"')).fetchall()
    if not rows:
        return []
    keys = list(rows[0]._fields)
    return [dict(zip(keys, r)) for r in rows]


@router.get("/dyn-params/{slug}/{item_id}")
def get_dyn_param(slug: str, item_id: str, db: Session = Depends(get_db)):
    table = _slug_to_table(slug)
    rows = db.execute(text(f'SELECT * FROM "{table}"')).fetchall()
    if not rows:
        raise HTTPException(404, "Not found")
    keys = list(rows[0]._fields)
    for r in rows:
        d = dict(zip(keys, r))
        if str(list(d.values())[0]) == item_id:
            return d
    raise HTTPException(404, "Not found")


@router.post("/dyn-params/{slug}", status_code=201)
def create_dyn_param(slug: str, body: dict = Body(...), db: Session = Depends(get_db)):
    table = _slug_to_table(slug)
    # Determine PK col
    tdef = db.execute(
        text("SELECT pk_col FROM trajectory_type_def WHERE param_table=:t"),
        {"t": table},
    ).fetchone()
    if not tdef:
        raise HTTPException(400, f"Unknown trajectory param table: {table}")
    pk_col = tdef[0]
    body.pop(pk_col, None)
    new_id = str(uuid.uuid4())
    cols = [pk_col] + [k for k in body if k != pk_col]
    placeholders = ", ".join(f":{c}" for c in cols)
    col_list = ", ".join(f'"{c}"' for c in cols)
    params = {pk_col: new_id, **{k: v for k, v in body.items() if k != pk_col}}
    db.execute(text(f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'), params)
    db.commit()
    row = db.execute(
        text(f'SELECT * FROM "{table}" WHERE "{pk_col}"=:id'), {"id": new_id}
    ).fetchone()
    return dict(zip(row._fields, row))


@router.put("/dyn-params/{slug}/{item_id}")
def update_dyn_param(slug: str, item_id: str, body: dict = Body(...), db: Session = Depends(get_db)):
    table = _slug_to_table(slug)
    tdef = db.execute(
        text("SELECT pk_col FROM trajectory_type_def WHERE param_table=:t"),
        {"t": table},
    ).fetchone()
    if not tdef:
        raise HTTPException(400, f"Unknown trajectory param table: {table}")
    pk_col = tdef[0]
    sets = ", ".join(f'"{k}"=:{k}' for k in body if k != pk_col)
    if not sets:
        raise HTTPException(400, "Nothing to update")
    params = {"__id": item_id, **{k: v for k, v in body.items() if k != pk_col}}
    db.execute(
        text(f'UPDATE "{table}" SET {sets} WHERE "{pk_col}"=:__id'), params
    )
    db.commit()
    row = db.execute(
        text(f'SELECT * FROM "{table}" WHERE "{pk_col}"=:id'), {"id": item_id}
    ).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return dict(zip(row._fields, row))


@router.delete("/dyn-params/{slug}/{item_id}", status_code=204)
def delete_dyn_param(slug: str, item_id: str, db: Session = Depends(get_db)):
    table = _slug_to_table(slug)
    tdef = db.execute(
        text("SELECT pk_col FROM trajectory_type_def WHERE param_table=:t"),
        {"t": table},
    ).fetchone()
    if not tdef:
        raise HTTPException(400, f"Unknown trajectory param table: {table}")
    pk_col = tdef[0]
    db.execute(
        text(f'DELETE FROM "{table}" WHERE "{pk_col}"=:id'), {"id": item_id}
    )
    db.commit()
