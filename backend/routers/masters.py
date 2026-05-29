import uuid
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
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


# ── TrajectoryTypeDefs (stub: returns empty list) ──────────────────────────────────────────

@router.get("/trajectory-type-defs")
def list_trajectory_type_defs():
    """動的トラジェクトリパラメータタブ定義の一覧（現在は未使用・空リストを返す）"""
    return []


@router.post("/trajectory-type-defs/sync")
def sync_trajectory_type_defs():
    """trajectory-type-defs の同期（スタブ）"""
    return {"synced": 0}


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
    return _update_one(ColumnDef, "column_def_id", item_id, body, db)


@router.delete("/column-defs/{item_id}", status_code=204)
def delete_column_def(item_id: str, db: Session = Depends(get_db)):
    _delete_one(ColumnDef, "column_def_id", item_id, db)
