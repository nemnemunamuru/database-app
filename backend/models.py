import uuid
from sqlalchemy import (
    Boolean, Column, Float, ForeignKey, Integer, String, Text
)
from sqlalchemy.orm import DeclarativeBase, relationship


def new_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


# ── Laser beam (flat: composite PK laser_beam_id + beam_type) ────────────────
class LaserBeam(Base):
    __tablename__ = "laser_beam"
    laser_beam_id          = Column(String, primary_key=True)
    beam_type              = Column(String, primary_key=True)
    wavelength_nm          = Column(Float)
    numerical_aperture     = Column(Float)
    m2_value               = Column(Float)
    bpp_mm_mrad            = Column(Float)
    core_diameter_um       = Column(Float)
    ring_inner_diameter_um = Column(Float)
    ring_outer_diameter_um = Column(Float)
    remarks                = Column(Text)


class LaserDevice(Base):
    __tablename__ = "laser_device"
    laser_device_id = Column(String, primary_key=True, default=new_uuid)
    manufacturer    = Column(String)
    model_name      = Column(String)
    serial_number   = Column(String)
    beam_structure  = Column(String)
    laser_beam_id   = Column(String)   # group ref → laser_beam.laser_beam_id (no FK)
    remarks         = Column(Text)

    optics_list = relationship("Optics", back_populates="laser_device")


class Doe(Base):
    __tablename__ = "doe"
    doe_id = Column(String, primary_key=True, default=new_uuid)
    manufacturer = Column(String)
    model_name = Column(String)
    serial_number = Column(String)
    profile_shape = Column(String)
    remarks = Column(Text)

    optics_list = relationship("Optics", back_populates="doe")


# ── Optics (flat: composite PK optics_id + optics_role) ──────────────────────
class Optics(Base):
    __tablename__ = "optics"
    optics_id           = Column(String, primary_key=True)
    optics_role         = Column(String, primary_key=True)
    manufacturer        = Column(String)
    collimator_focal_mm = Column(Float)
    serial_number       = Column(String)
    laser_device_id     = Column(String, ForeignKey("laser_device.laser_device_id"))
    doe_id              = Column(String, ForeignKey("doe.doe_id"))
    remarks             = Column(Text)

    laser_device = relationship("LaserDevice", back_populates="optics_list")
    doe          = relationship("Doe", back_populates="optics_list")


class Ftheta(Base):
    __tablename__ = "ftheta"
    ftheta_id = Column(String, primary_key=True, default=new_uuid)
    manufacturer = Column(String)
    model_name = Column(String)
    serial_number = Column(String)
    ftheta_focal_mm = Column(Float)
    remarks = Column(Text)

    galvano_systems = relationship("GalvanoSystem", back_populates="ftheta")


class GalvanoSystem(Base):
    __tablename__ = "galvano_system"
    galvano_system_id = Column(String, primary_key=True, default=new_uuid)
    galvano_type = Column(String)
    serial_number = Column(String)
    ftheta_id = Column(String, ForeignKey("ftheta.ftheta_id"))
    optics_id = Column(String)   # group ref → optics.optics_id (no FK; composite PK)
    main_diameter_um = Column(Float)
    sub_diameter_um = Column(Float)
    oct_diameter_um = Column(Float)
    remarks = Column(Text)

    ftheta = relationship("Ftheta", back_populates="galvano_systems")
    experiments = relationship("Experiment", back_populates="galvano_system")


class LineParameter(Base):
    __tablename__ = "line_parameter"
    main_trajectory_type_parameter_id = Column(String, primary_key=True, default=new_uuid)
    length_mm = Column(Float)
    remarks = Column(Text)

    main_trajectories = relationship("MainTrajectory", back_populates="line_parameter")


class CircleParameter(Base):
    __tablename__ = "circle_parameter"
    main_trajectory_type_parameter_id = Column(String, primary_key=True, default=new_uuid)


class SpiralParameter(Base):
    __tablename__ = "spiral_parameter"
    main_trajectory_type_parameter_id = Column(String, primary_key=True, default=new_uuid)


class MainTrajectory(Base):
    __tablename__ = "main_trajectory"
    main_trajectory_id = Column(String, primary_key=True, default=new_uuid)
    main_trajectory_parameter_id = Column(String, ForeignKey("line_parameter.main_trajectory_type_parameter_id"))
    main_trajectory_type = Column(String)
    remarks = Column(Text)

    line_parameter = relationship("LineParameter", back_populates="main_trajectories")
    trajectory_sets_main = relationship("TrajectorySet", foreign_keys="TrajectorySet.main_trajectory_id",
                                        back_populates="main_trajectory")


class WobblingParameter(Base):
    __tablename__ = "wobbling_parameter"
    sub_trajectory_type_parameter_id = Column(String, primary_key=True, default=new_uuid)
    wobble_radius_mm = Column(Float)
    wobble_frequency_hz = Column(Float)
    circumferential_speed = Column(Float)
    remarks = Column(Text)

    sub_trajectories = relationship("SubTrajectory", back_populates="wobbling_parameter")


class EightParameter(Base):
    __tablename__ = "eight_parameter"
    sub_trajectory_type_parameter_id = Column(String, primary_key=True, default=new_uuid)


class RasterParameter(Base):
    __tablename__ = "raster_parameter"
    sub_trajectory_type_parameter_id = Column(String, primary_key=True, default=new_uuid)


class SubTrajectory(Base):
    __tablename__ = "sub_trajectory"
    sub_trajectory_id = Column(String, primary_key=True, default=new_uuid)
    sub_trajectory_parameter_id = Column(String, ForeignKey("wobbling_parameter.sub_trajectory_type_parameter_id"))
    sub_trajectory_type = Column(String)
    remarks = Column(Text)

    wobbling_parameter = relationship("WobblingParameter", back_populates="sub_trajectories")
    trajectory_sets_sub = relationship("TrajectorySet", foreign_keys="TrajectorySet.sub_trajectory_id",
                                       back_populates="sub_trajectory")


class TrajectorySet(Base):
    __tablename__ = "trajectory_set"
    trajectory_set_id = Column(String, primary_key=True, default=new_uuid)
    main_trajectory_id = Column(String, ForeignKey("main_trajectory.main_trajectory_id"))
    sub_trajectory_id = Column(String, ForeignKey("sub_trajectory.sub_trajectory_id"))
    trajectory_csv_path = Column(String)
    remarks = Column(Text)

    main_trajectory = relationship("MainTrajectory", foreign_keys=[main_trajectory_id],
                                   back_populates="trajectory_sets_main")
    sub_trajectory = relationship("SubTrajectory", foreign_keys=[sub_trajectory_id],
                                  back_populates="trajectory_sets_sub")
    welding_conditions = relationship("WeldingCondition", back_populates="trajectory_set")


class WeldingCondition(Base):
    __tablename__ = "welding_condition"
    welding_condition_id = Column(String, primary_key=True, default=new_uuid)
    main_power_w = Column(Float)
    sub_power_w = Column(Float)
    welding_speed_mm_s = Column(Float)
    main_focus_offset_mm = Column(Float)
    sub_focus_offset_mm = Column(Float)
    trajectory_set_id = Column(String, ForeignKey("trajectory_set.trajectory_set_id"))
    remarks = Column(Text)

    trajectory_set = relationship("TrajectorySet", back_populates="welding_conditions")
    experiments = relationship("Experiment", back_populates="welding_condition")


class Material(Base):
    __tablename__ = "material"
    material_id = Column(String, primary_key=True, default=new_uuid)
    material_name = Column(String)
    material_class = Column(String)
    density_kg_m3 = Column(Float)
    thermal_conductivity_w_mk = Column(Float)
    reflectivity_1070nm = Column(Float)
    remarks = Column(Text)

    material_states = relationship("MaterialState", back_populates="material")


class MaterialState(Base):
    __tablename__ = "material_state"
    material_state_id = Column(String, primary_key=True, default=new_uuid)
    material_id = Column(String, ForeignKey("material.material_id"))
    thickness_mm = Column(Float)
    width_mm = Column(Float)
    length_mm = Column(Float)
    surface_condition = Column(String)
    remarks = Column(Text)

    material = relationship("Material", back_populates="material_states")
    experiment_materials = relationship("ExperimentMaterial", back_populates="material_state")


# ── Experiment material ──────────────────────────────────────────────────────
class ExperimentMaterial(Base):
    __tablename__ = "experiment_material"
    experiment_material_id = Column(String, primary_key=True, default=new_uuid)
    material_state_id = Column(String, ForeignKey("material_state.material_state_id"))
    material_role = Column(String)
    remarks = Column(Text)

    material_state = relationship("MaterialState", back_populates="experiment_materials")
    experiments = relationship("Experiment", back_populates="experiment_material")


class ShieldingCondition(Base):
    __tablename__ = "shielding_condition"
    shielding_condition_id = Column(String, primary_key=True, default=new_uuid)
    gas_type = Column(String)
    gas_purity_percent = Column(Float)
    gas_flow_l_min = Column(Float)
    gas_pressure_kpa = Column(Float)
    nozzle_type = Column(String)
    nozzle_diameter_mm = Column(Float)
    nozzle_distance_mm = Column(Float)
    nozzle_angle_deg = Column(Float)
    remarks = Column(Text)

    experiments = relationship("Experiment", back_populates="shielding_condition")


class Result(Base):
    __tablename__ = "result"
    result_id = Column(String, primary_key=True, default=new_uuid)
    oct_depth_mm = Column(Float)
    oct_surface_csv_path = Column(String)
    oct_depth_csv_path = Column(String)
    oct_result_csv_path = Column(String)
    cross_section_depth_mm = Column(Float)
    spatter_flag = Column(Boolean)
    spatter_severity = Column(Float)
    gap_opening_flag = Column(Boolean)
    crack_flag = Column(Boolean)
    crack_severity = Column(Float)
    glass_contamination = Column(Boolean)
    surface_contamination = Column(Boolean)
    penetration_flag = Column(Boolean)
    remarks = Column(Text)

    experiments = relationship("Experiment", back_populates="result")


class Observation(Base):
    __tablename__ = "observation"
    observation_id = Column(String, primary_key=True, default=new_uuid)
    observer_name = Column(String)
    observation_datetime = Column(String)
    comment = Column(Text)
    remarks = Column(Text)

    experiments = relationship("Experiment", back_populates="observation")


class File(Base):
    __tablename__ = "file"
    file_id = Column(String, primary_key=True, default=new_uuid)
    remarks = Column(Text)

    experiments = relationship("Experiment", back_populates="file")


class Project(Base):
    __tablename__ = "project"
    project_id   = Column(String, primary_key=True, default=new_uuid)
    project_name = Column(String)

    experiments = relationship("Experiment", back_populates="project")


class Experiment(Base):
    __tablename__ = "experiment"
    experiment_id = Column(String, primary_key=True, default=new_uuid)
    galvano_system_id = Column(String, ForeignKey("galvano_system.galvano_system_id"))
    welding_condition_id = Column(String, ForeignKey("welding_condition.welding_condition_id"))
    experiment_material_id = Column(String, ForeignKey("experiment_material.experiment_material_id"))
    shielding_condition_id = Column(String, ForeignKey("shielding_condition.shielding_condition_id"))
    result_id = Column(String, ForeignKey("result.result_id"))
    observation_id = Column(String, ForeignKey("observation.observation_id"))
    file_id = Column(String, ForeignKey("file.file_id"))
    project_id = Column(String, ForeignKey("project.project_id"))
    remarks = Column(Text)

    galvano_system = relationship("GalvanoSystem", back_populates="experiments")
    welding_condition = relationship("WeldingCondition", back_populates="experiments")
    experiment_material = relationship("ExperimentMaterial", back_populates="experiments")
    shielding_condition = relationship("ShieldingCondition", back_populates="experiments")
    result = relationship("Result", back_populates="experiments")
    observation = relationship("Observation", back_populates="experiments")
    file = relationship("File", back_populates="experiments")
    project = relationship("Project", back_populates="experiments")


class ColumnDef(Base):
    __tablename__ = "column_def"
    column_def_id = Column(String, primary_key=True, default=new_uuid)
    table_name = Column(String, nullable=False)
    column_name = Column(String, nullable=False)
    data_type = Column(String)
    unit = Column(String)
    is_id = Column(String, default="")
    is_computed = Column(Boolean, default=False)
    formula = Column(Text)
    candidates = Column(Text)
    order_index = Column(Integer, default=0)



