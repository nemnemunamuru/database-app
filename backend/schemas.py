from typing import Optional
from pydantic import BaseModel


class MaterialIn(BaseModel):
    material_name: Optional[str] = None
    material_class: Optional[str] = None
    density_kg_m3: Optional[float] = None
    thermal_conductivity_w_mk: Optional[float] = None
    reflectivity_1070nm: Optional[float] = None
    remarks: Optional[str] = None

class MaterialOut(MaterialIn):
    material_id: str
    model_config = {"from_attributes": True}


class MaterialStateIn(BaseModel):
    material_id: Optional[str] = None
    thickness_mm: Optional[float] = None
    width_mm: Optional[float] = None
    length_mm: Optional[float] = None
    surface_condition: Optional[str] = None
    remarks: Optional[str] = None

class MaterialStateOut(MaterialStateIn):
    material_state_id: str
    model_config = {"from_attributes": True}


class LaserBeamIn(BaseModel):
    beam_type: Optional[str] = None
    wavelength_nm: Optional[float] = None
    numerical_aperture: Optional[float] = None
    m2_value: Optional[float] = None
    bpp_mm_mrad: Optional[float] = None
    core_diameter_um: Optional[float] = None
    ring_inner_diameter_um: Optional[float] = None
    ring_outer_diameter_um: Optional[float] = None
    remarks: Optional[str] = None

class LaserBeamOut(LaserBeamIn):
    laser_beam_id: str
    model_config = {"from_attributes": True}


class LaserDeviceIn(BaseModel):
    manufacturer: Optional[str] = None
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    beam_structure: Optional[str] = None
    laser_beam_id: Optional[str] = None
    remarks: Optional[str] = None

class LaserDeviceOut(LaserDeviceIn):
    laser_device_id: str
    model_config = {"from_attributes": True}


class FthetaIn(BaseModel):
    manufacturer: Optional[str] = None
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    ftheta_focal_mm: Optional[float] = None
    remarks: Optional[str] = None

class FthetaOut(FthetaIn):
    ftheta_id: str
    model_config = {"from_attributes": True}


class DoeIn(BaseModel):
    manufacturer: Optional[str] = None
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    profile_shape: Optional[str] = None
    remarks: Optional[str] = None

class DoeOut(DoeIn):
    doe_id: str
    model_config = {"from_attributes": True}


class OpticsIn(BaseModel):
    manufacturer: Optional[str] = None
    optics_role: Optional[str] = None
    collimator_focal_mm: Optional[float] = None
    serial_number: Optional[str] = None
    laser_device_id: Optional[str] = None
    doe_id: Optional[str] = None
    remarks: Optional[str] = None

class OpticsOut(OpticsIn):
    optics_id: str
    model_config = {"from_attributes": True}


class GalvanoSystemIn(BaseModel):
    galvano_type: Optional[str] = None
    serial_number: Optional[str] = None
    ftheta_id: Optional[str] = None
    optics_id: Optional[str] = None
    main_diameter_um: Optional[float] = None
    sub_diameter_um: Optional[float] = None
    oct_diameter_um: Optional[float] = None
    remarks: Optional[str] = None

class GalvanoSystemOut(GalvanoSystemIn):
    galvano_system_id: str
    model_config = {"from_attributes": True}


class WeldingConditionIn(BaseModel):
    main_power_w: Optional[float] = None
    sub_power_w: Optional[float] = None
    welding_speed_mm_s: Optional[float] = None
    main_focus_offset_mm: Optional[float] = None
    sub_focus_offset_mm: Optional[float] = None
    trajectory_set_id: Optional[str] = None
    remarks: Optional[str] = None

class WeldingConditionOut(WeldingConditionIn):
    welding_condition_id: str
    model_config = {"from_attributes": True}


class ShieldingConditionIn(BaseModel):
    gas_type: Optional[str] = None
    gas_purity_percent: Optional[float] = None
    gas_flow_l_min: Optional[float] = None
    gas_pressure_kpa: Optional[float] = None
    nozzle_type: Optional[str] = None
    nozzle_diameter_mm: Optional[float] = None
    nozzle_distance_mm: Optional[float] = None
    nozzle_angle_deg: Optional[float] = None
    remarks: Optional[str] = None

class ShieldingConditionOut(ShieldingConditionIn):
    shielding_condition_id: str
    model_config = {"from_attributes": True}


class ResultIn(BaseModel):
    oct_depth_mm: Optional[float] = None
    oct_surface_csv_path: Optional[str] = None
    oct_depth_csv_path: Optional[str] = None
    oct_result_csv_path: Optional[str] = None
    cross_section_depth_mm: Optional[float] = None
    spatter_flag: Optional[bool] = None
    spatter_severity: Optional[float] = None
    gap_opening_flag: Optional[bool] = None
    crack_flag: Optional[bool] = None
    crack_severity: Optional[float] = None
    glass_contamination: Optional[bool] = None
    surface_contamination: Optional[bool] = None
    penetration_flag: Optional[bool] = None
    remarks: Optional[str] = None

class ResultOut(ResultIn):
    result_id: str
    model_config = {"from_attributes": True}


class ObservationIn(BaseModel):
    observer_name: Optional[str] = None
    observation_datetime: Optional[str] = None
    comment: Optional[str] = None
    remarks: Optional[str] = None

class ObservationOut(ObservationIn):
    observation_id: str
    model_config = {"from_attributes": True}
