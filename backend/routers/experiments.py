import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, text
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from backend.database import get_db
from backend.models import (
    Experiment, GalvanoSystem, Ftheta, Optics, LaserDevice, LaserBeam, Doe,
    WeldingCondition, TrajectorySet, MainTrajectory, SubTrajectory,
    LineParameter, WobblingParameter,
    ExperimentMaterial, MaterialState,
    ShieldingCondition, Result, Observation, File, Project,
)

router = APIRouter()


# --- Schemas ---
class ExperimentCreate(BaseModel):
    galvano_system_id: Optional[str] = None
    welding_condition_id: Optional[str] = None
    experiment_material_id: Optional[str] = None
    shielding_condition_id: Optional[str] = None
    result_id: Optional[str] = None
    observation_id: Optional[str] = None
    file_id: Optional[str] = None
    remarks: Optional[str] = None


class ExperimentUpdate(BaseModel):
    galvano_system_id: Optional[str] = None
    welding_condition_id: Optional[str] = None
    experiment_material_id: Optional[str] = None
    shielding_condition_id: Optional[str] = None
    result_id: Optional[str] = None
    observation_id: Optional[str] = None
    file_id: Optional[str] = None
    project_id: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/projects")
def list_experiment_projects(db: Session = Depends(get_db)):
    """Return distinct (project_id, project_name) pairs used in experiments."""
    rows = (
        db.query(Experiment.project_id)
        .filter(Experiment.project_id.isnot(None))
        .distinct()
        .all()
    )
    result = []
    for (pid,) in rows:
        proj = db.query(Project).filter(Project.project_id == pid).first()
        pname = proj.project_name if proj else pid
        result.append({"project_id": pid, "project_name": pname or pid})
    result.sort(key=lambda x: x["project_name"] or "")
    return result


# --- Endpoints ---
_STANDARD_EXP_COLS = frozenset({
    "experiment_id", "galvano_system_id", "welding_condition_id",
    "experiment_material_id", "shielding_condition_id",
    "result_id", "observation_id", "file_id", "project_id", "remarks",
})


def _get_custom_col_names(db: Session) -> list[str]:
    """Return names of experiment table columns beyond the standard set."""
    rows = db.execute(text("PRAGMA table_info(experiment)")).fetchall()
    return [r[1] for r in rows if r[1] not in _STANDARD_EXP_COLS]


def _add_custom_cols(items: list[dict], ids: list[str], db: Session) -> None:
    """Fetch custom column values and merge them into item dicts in-place."""
    custom = _get_custom_col_names(db)
    if not custom or not ids:
        return
    placeholders = ",".join(f":id{i}" for i in range(len(ids)))
    params = {f"id{i}": v for i, v in enumerate(ids)}
    cols_sql = ", ".join(f'"{c}"' for c in custom)
    rows = db.execute(
        text(f'SELECT experiment_id, {cols_sql} FROM experiment WHERE experiment_id IN ({placeholders})'),
        params,
    ).mappings()
    row_map = {r["experiment_id"]: dict(r) for r in rows}
    for item in items:
        row = row_map.get(item["experiment_id"])
        if row:
            for col in custom:
                item[col] = row.get(col)


@router.get("/")
def list_experiments(
    skip: int = 0,
    limit: int = Query(default=50, le=2000),
    remarks: Optional[str] = None,
    project_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Experiment)
    if remarks:
        query = query.filter(Experiment.remarks.contains(remarks))
    if project_id:
        query = query.filter(Experiment.project_id == project_id)
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    result = [_to_dict(e) for e in items]
    _add_custom_cols(result, [e.experiment_id for e in items], db)
    return {"total": total, "items": result}


@router.get("/{experiment_id}")
def get_experiment(experiment_id: str, db: Session = Depends(get_db)):
    exp = db.get(Experiment, experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    result = _to_dict(exp)
    _add_custom_cols([result], [experiment_id], db)
    return result


@router.post("/", status_code=201)
def create_experiment(body: ExperimentCreate, db: Session = Depends(get_db)):
    exp = Experiment(experiment_id=str(uuid.uuid4()), **body.model_dump())
    db.add(exp)
    db.commit()
    db.refresh(exp)
    result = _to_dict(exp)
    _add_custom_cols([result], [exp.experiment_id], db)
    return result


@router.put("/{experiment_id}")
def update_experiment(experiment_id: str, body: ExperimentUpdate, db: Session = Depends(get_db)):
    exp = db.get(Experiment, experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(exp, key, value)
    db.commit()
    db.refresh(exp)
    result = _to_dict(exp)
    _add_custom_cols([result], [experiment_id], db)
    return result


@router.delete("/{experiment_id}", status_code=204)
def delete_experiment(experiment_id: str, db: Session = Depends(get_db)):
    exp = db.get(Experiment, experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    db.delete(exp)
    db.commit()


@router.post("/{experiment_id}/clone", status_code=201)
def clone_experiment(experiment_id: str, db: Session = Depends(get_db)):
    src = db.get(Experiment, experiment_id)
    if not src:
        raise HTTPException(status_code=404, detail="Experiment not found")
    new_exp = Experiment(
        experiment_id=str(uuid.uuid4()),
        galvano_system_id=src.galvano_system_id,
        welding_condition_id=src.welding_condition_id,
        experiment_material_id=src.experiment_material_id,
        shielding_condition_id=src.shielding_condition_id,
        result_id=None,
        observation_id=None,
        file_id=None,
        remarks=f"[複製] {src.remarks or ''}",
    )
    db.add(new_exp)
    db.commit()
    db.refresh(new_exp)
    result = _to_dict(new_exp)
    _add_custom_cols([result], [new_exp.experiment_id], db)
    return result


@router.get("/{experiment_id}/detail")
def get_experiment_detail(experiment_id: str, db: Session = Depends(get_db)):
    exp = (
        db.query(Experiment)
        .options(
            joinedload(Experiment.galvano_system).joinedload(GalvanoSystem.ftheta),
            joinedload(Experiment.welding_condition).joinedload(WeldingCondition.trajectory_set)
                .joinedload(TrajectorySet.main_trajectory).joinedload(MainTrajectory.line_parameter),
            joinedload(Experiment.welding_condition).joinedload(WeldingCondition.trajectory_set)
                .joinedload(TrajectorySet.sub_trajectory).joinedload(SubTrajectory.wobbling_parameter),
            joinedload(Experiment.experiment_material).joinedload(ExperimentMaterial.material_state)
                .joinedload(MaterialState.material),
            joinedload(Experiment.shielding_condition),
            joinedload(Experiment.result),
            joinedload(Experiment.observation),
            joinedload(Experiment.file),
        )
        .filter(Experiment.experiment_id == experiment_id)
        .first()
    )
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return _to_detail(exp, db)


def _to_dict(exp: Experiment) -> dict:
    proj = exp.project
    return {
        "experiment_id": exp.experiment_id,
        "galvano_system_id": exp.galvano_system_id,
        "welding_condition_id": exp.welding_condition_id,
        "experiment_material_id": exp.experiment_material_id,
        "shielding_condition_id": exp.shielding_condition_id,
        "result_id": exp.result_id,
        "observation_id": exp.observation_id,
        "file_id": exp.file_id,
        "project_id": exp.project_id,
        "project_name": proj.project_name if proj else None,
        "remarks": exp.remarks,
    }


def _to_detail(exp: Experiment, db) -> dict:
    gs = exp.galvano_system
    wc = exp.welding_condition
    em = exp.experiment_material
    sc = exp.shielding_condition
    res = exp.result
    obs = exp.observation

    galvano = None
    if gs:
        ftheta = gs.ftheta
        optics_list = []
        if gs.optics_id:
            optics_rows = db.query(Optics).filter(Optics.optics_id == gs.optics_id).order_by(
                case((Optics.optics_role == "main", 0), (Optics.optics_role == "sub", 1), (Optics.optics_role == "OCT", 2), else_=9)
            ).all()
            for o in optics_rows:
                ld = db.get(LaserDevice, o.laser_device_id) if o.laser_device_id else None
                doe = db.get(Doe, o.doe_id) if o.doe_id else None
                ld_data = None
                if ld:
                    lb_rows = db.query(LaserBeam).filter(LaserBeam.laser_beam_id == ld.laser_beam_id).order_by(
                        case((LaserBeam.beam_type == "single", 0), (LaserBeam.beam_type == "ring", 1), (LaserBeam.beam_type == "multi", 2), else_=9)
                    ).all() if ld.laser_beam_id else []
                    ld_data = {
                        "manufacturer": ld.manufacturer,
                        "model_name": ld.model_name,
                        "serial_number": ld.serial_number,
                        "beam_structure": ld.beam_structure,
                        "remarks": ld.remarks,
                        "laser_beams": [
                            {
                                "beam_type": lb.beam_type,
                                "wavelength_nm": lb.wavelength_nm,
                                "numerical_aperture": lb.numerical_aperture,
                                "m2_value": lb.m2_value,
                                "bpp_mm_mrad": lb.bpp_mm_mrad,
                                "core_diameter_um": lb.core_diameter_um,
                                "ring_inner_diameter_um": lb.ring_inner_diameter_um,
                                "ring_outer_diameter_um": lb.ring_outer_diameter_um,
                            } for lb in lb_rows
                        ],
                    }
                optics_list.append({
                    "optics_id": o.optics_id,
                    "optics_role": o.optics_role,
                    "manufacturer": o.manufacturer,
                    "collimator_focal_mm": o.collimator_focal_mm,
                    "serial_number": o.serial_number,
                    "remarks": o.remarks,
                    "doe": {
                        "manufacturer": doe.manufacturer,
                        "model_name": doe.model_name,
                        "serial_number": doe.serial_number,
                        "profile_shape": doe.profile_shape,
                        "remarks": doe.remarks,
                    } if doe else None,
                    "laser_device": ld_data,
                })
        galvano = {
            "galvano_type": gs.galvano_type,
            "serial_number": gs.serial_number,
            "main_diameter_um": gs.main_diameter_um,
            "sub_diameter_um": gs.sub_diameter_um,
            "oct_diameter_um": gs.oct_diameter_um,
            "remarks": gs.remarks,
            "ftheta": {
                "manufacturer": ftheta.manufacturer,
                "model_name": ftheta.model_name,
                "serial_number": ftheta.serial_number,
                "ftheta_focal_mm": ftheta.ftheta_focal_mm,
                "remarks": ftheta.remarks,
            } if ftheta else None,
            "optics": optics_list,
        }

    welding = None
    if wc:
        ts = wc.trajectory_set
        ts_data = None
        if ts:
            mt = ts.main_trajectory
            st = ts.sub_trajectory
            mt_data = None
            if mt:
                lp = mt.line_parameter
                mt_data = {
                    "main_trajectory_type": mt.main_trajectory_type,
                    "remarks": mt.remarks,
                    "line_parameter": {
                        "length_mm": lp.length_mm,
                        "remarks": lp.remarks,
                    } if lp else None,
                }
            st_data = None
            if st:
                wp = st.wobbling_parameter
                st_data = {
                    "sub_trajectory_type": st.sub_trajectory_type,
                    "remarks": st.remarks,
                    "wobbling_parameter": {
                        "wobble_radius_mm": wp.wobble_radius_mm,
                        "wobble_frequency_hz": wp.wobble_frequency_hz,
                        "circumferential_speed": wp.circumferential_speed,
                        "remarks": wp.remarks,
                    } if wp else None,
                }
            ts_data = {
                "trajectory_csv_path": ts.trajectory_csv_path,
                "remarks": ts.remarks,
                "main_trajectory": mt_data,
                "sub_trajectory": st_data,
            }
        welding = {
            "main_power_w": wc.main_power_w,
            "sub_power_w": wc.sub_power_w,
            "welding_speed_mm_s": wc.welding_speed_mm_s,
            "main_focus_offset_mm": wc.main_focus_offset_mm,
            "sub_focus_offset_mm": wc.sub_focus_offset_mm,
            "remarks": wc.remarks,
            "trajectory_set": ts_data,
        }

    material = None
    if em:
        ms = em.material_state
        mat = ms.material if ms else None
        material = {
            "material_role": em.material_role,
            "remarks": em.remarks,
            "material_state": {
                "thickness_mm": ms.thickness_mm,
                "width_mm": ms.width_mm,
                "length_mm": ms.length_mm,
                "surface_condition": ms.surface_condition,
                "remarks": ms.remarks,
                "material": {
                    "material_name": mat.material_name,
                    "material_class": mat.material_class,
                    "density_kg_m3": mat.density_kg_m3,
                    "thermal_conductivity_w_mk": mat.thermal_conductivity_w_mk,
                    "reflectivity_1070nm": mat.reflectivity_1070nm,
                    "remarks": mat.remarks,
                } if mat else None,
            } if ms else None,
        }

    shielding = None
    if sc:
        shielding = {
            "gas_type": sc.gas_type, "gas_purity_percent": sc.gas_purity_percent,
            "gas_flow_l_min": sc.gas_flow_l_min, "gas_pressure_kpa": sc.gas_pressure_kpa,
            "nozzle_type": sc.nozzle_type, "nozzle_diameter_mm": sc.nozzle_diameter_mm,
            "nozzle_distance_mm": sc.nozzle_distance_mm, "nozzle_angle_deg": sc.nozzle_angle_deg,
            "remarks": sc.remarks,
        }

    result = None
    if res:
        result = {
            "oct_depth_mm": res.oct_depth_mm,
            "oct_surface_csv_path": res.oct_surface_csv_path,
            "oct_depth_csv_path": res.oct_depth_csv_path,
            "oct_result_csv_path": res.oct_result_csv_path,
            "cross_section_depth_mm": res.cross_section_depth_mm,
            "spatter_flag": res.spatter_flag, "spatter_severity": res.spatter_severity,
            "gap_opening_flag": res.gap_opening_flag,
            "crack_flag": res.crack_flag, "crack_severity": res.crack_severity,
            "glass_contamination": res.glass_contamination,
            "surface_contamination": res.surface_contamination,
            "penetration_flag": res.penetration_flag,
            "remarks": res.remarks,
        }

    observation = None
    if obs:
        observation = {
            "observer_name": obs.observer_name,
            "observation_datetime": obs.observation_datetime,
            "comment": obs.comment,
            "remarks": obs.remarks,
        }

    fil = exp.file
    file_data = None
    if fil:
        file_data = {
            "remarks": fil.remarks,
        }

    base = _to_dict(exp)
    _add_custom_cols([base], [exp.experiment_id], db)
    return {
        **base,
        "galvano_system": galvano,
        "welding_condition": welding,
        "experiment_material": material,
        "shielding_condition": shielding,
        "result": result,
        "observation": observation,
        "file": file_data,
    }
