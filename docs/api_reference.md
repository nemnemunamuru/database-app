# API Reference — Laser Experiment Database

- **Base URL**: `http://localhost:8000`
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- すべての ID は **UUID** 形式（例: `3fa85f64-5717-4562-b3fc-2c963f66afa6`）
- リクエスト／レスポンスのボディは **JSON**
- 複合 PK エンドポイントの `{encoded_id}` は `{id}~{type}` を **URLエンコード**した文字列（例: `abc~single` → `abc~single`）

---

## 1. Experiments `/api/experiments`

実験の基本情報を管理します。各実験は他のマスタデータへの参照 ID を持ちます。

### エンドポイント一覧

| Method | Path | 説明 | 成功時ステータス |
|--------|------|------|:---------:|
| `GET` | `/api/experiments/` | 実験一覧取得（ページング・フィルタ対応） | 200 |
| `GET` | `/api/experiments/{experiment_id}` | 実験1件取得 | 200 |
| `POST` | `/api/experiments/` | 実験新規作成 | 201 |
| `PUT` | `/api/experiments/{experiment_id}` | 実験更新 | 200 |
| `DELETE` | `/api/experiments/{experiment_id}` | 実験削除 | 204 |
| `POST` | `/api/experiments/{experiment_id}/clone` | 実験を複製（result/observation/file はコピーしない） | 201 |
| `GET` | `/api/experiments/{experiment_id}/detail` | 実験詳細（全関連データをネストして返す） | 200 |

### クエリパラメータ（GET /）

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `skip` | int | 0 | スキップ件数 |
| `limit` | int | 50 (最大500) | 取得件数 |
| `remarks` | string | — | remarks の部分一致フィルタ |

### リクエストボディ（POST / PUT）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|:----:|------|
| `galvano_system_id` | UUID | — | ガルバノシステム参照 |
| `welding_condition_id` | UUID | — | 溶接条件参照 |
| `experiment_material_id` | UUID | — | 実験材料参照 |
| `shielding_condition_id` | UUID | — | シールド条件参照 |
| `result_id` | UUID | — | 結果参照 |
| `observation_id` | UUID | — | 観察記録参照 |
| `file_id` | UUID | — | ファイル参照 |
| `remarks` | string | — | メモ |

---

## 2. Masters `/api/masters`

各種マスタデータの CRUD を提供します。基本パターンは共通です。

### 共通 CRUD パターン

| Method | Path | 説明 |
|--------|------|------|
| `GET` | `/{resource}` | 一覧取得 |
| `GET` | `/{resource}/{id}` | 1件取得 |
| `POST` | `/{resource}` | 新規作成 → 201 |
| `PUT` | `/{resource}/{id}` | 更新 → 200 |
| `DELETE` | `/{resource}/{id}` | 削除 → 204 |

---

### 2-1. Materials `/api/masters/materials`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `material_id` | UUID (PK) | 自動生成 |
| `material_name` | string | 材料名（例: SUS304） |
| `material_class` | string | 材料分類（例: stainless） |
| `density_kg_m3` | float | 密度 [kg/m³] |
| `thermal_conductivity_w_mk` | float | 熱伝導率 [W/m·K] |
| `reflectivity_1070nm` | float | 1070nm 反射率 |
| `remarks` | string | メモ |

---

### 2-2. Material States `/api/masters/material-states`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `material_state_id` | UUID (PK) | 自動生成 |
| `material_id` | UUID (FK→material) | 材料参照 |
| `thickness_mm` | float | 板厚 [mm] |
| `width_mm` | float | 幅 [mm] |
| `length_mm` | float | 長さ [mm] |
| `surface_condition` | string | 表面状態（例: polished） |
| `remarks` | string | メモ |

---

### 2-3. Laser Beams `/api/masters/laser-beams`

> **複合 PK**: `(laser_beam_id, beam_type)` — `{encoded_id}` = `{laser_beam_id}~{beam_type}`
> `beam_type` の値: `single` / `ring` / `multi`

| Method | Path | 説明 |
|--------|------|------|
| `GET` | `/api/masters/laser-beams` | 一覧取得（beam_type 順: single→ring→multi） |
| `POST` | `/api/masters/laser-beams` | 新規作成 |
| `PUT` | `/api/masters/laser-beams/{encoded_id}` | 更新 |
| `DELETE` | `/api/masters/laser-beams/{encoded_id}` | 削除 |

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `laser_beam_id` | string (PK) | デバイスグループ識別子 |
| `beam_type` | string (PK) | `single` / `ring` / `multi` |
| `wavelength_nm` | float | 波長 [nm] |
| `numerical_aperture` | float | 開口数 NA |
| `m2_value` | float | ビーム品質 M² |
| `bpp_mm_mrad` | float | BPP [mm·mrad] |
| `core_diameter_um` | float | コア径 [μm] |
| `ring_inner_diameter_um` | float | リング内径 [μm] |
| `ring_outer_diameter_um` | float | リング外径 [μm] |
| `remarks` | string | メモ |

---

### 2-4. Laser Devices `/api/masters/laser-devices`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `laser_device_id` | UUID (PK) | 自動生成 |
| `manufacturer` | string | メーカー名 |
| `model_name` | string | 型番 |
| `serial_number` | string | シリアル番号 |
| `beam_structure` | string | ビーム構造（例: single/ring） |
| `laser_beam_id` | string | レーザービームグループ参照 |
| `remarks` | string | メモ |

**追加エンドポイント:**

`GET /api/masters/laser-devices/{item_id}/detail` — デバイスに紐づくレーザービーム一覧を含む詳細データを返します。

---

### 2-5. FTheta レンズ `/api/masters/ftheta`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `ftheta_id` | UUID (PK) | 自動生成 |
| `manufacturer` | string | メーカー名 |
| `model_name` | string | 型番 |
| `serial_number` | string | シリアル番号 |
| `ftheta_focal_mm` | float | 焦点距離 [mm] |
| `remarks` | string | メモ |

---

### 2-6. Optics `/api/masters/optics`

> **複合 PK**: `(optics_id, optics_role)` — `{encoded_id}` = `{optics_id}~{optics_role}`
> `optics_role` の値: `main` / `sub` / `OCT`

| Method | Path | 説明 |
|--------|------|------|
| `GET` | `/api/masters/optics` | 一覧取得（role 順: main→sub→OCT） |
| `POST` | `/api/masters/optics` | 新規作成 |
| `PUT` | `/api/masters/optics/{encoded_id}` | 更新 |
| `DELETE` | `/api/masters/optics/{encoded_id}` | 削除 |
| `GET` | `/api/masters/optics/{encoded_id}/detail` | 詳細（レーザーデバイス・DOE 含む） |

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `optics_id` | string (PK) | 光学系グループ識別子 |
| `optics_role` | string (PK) | `main` / `sub` / `OCT` |
| `manufacturer` | string | メーカー名 |
| `collimator_focal_mm` | float | コリメータ焦点距離 [mm] |
| `serial_number` | string | シリアル番号 |
| `laser_device_id` | UUID (FK) | レーザーデバイス参照 |
| `doe_id` | UUID (FK) | DOE 参照 |
| `remarks` | string | メモ |

---

### 2-7. DOE `/api/masters/doe`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `doe_id` | UUID (PK) | 自動生成 |
| `manufacturer` | string | メーカー名 |
| `model_name` | string | 型番 |
| `serial_number` | string | シリアル番号 |
| `profile_shape` | string | プロファイル形状 |
| `remarks` | string | メモ |

---

### 2-8. Galvano Systems `/api/masters/galvano-systems`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `galvano_system_id` | UUID (PK) | 自動生成 |
| `galvano_type` | string | ガルバノタイプ |
| `serial_number` | string | シリアル番号 |
| `ftheta_id` | UUID (FK) | Fθ レンズ参照 |
| `optics_id` | string | 光学系グループ参照 |
| `main_diameter_um` | float | メインビーム径 [μm] |
| `sub_diameter_um` | float | サブビーム径 [μm] |
| `oct_diameter_um` | float | OCT ビーム径 [μm] |
| `remarks` | string | メモ |

**追加エンドポイント:**

`GET /api/masters/galvano-systems/{item_id}/detail` — Fθ・光学系（main/sub/OCT）・レーザーデバイス・レーザービームを含む完全なツリーを返します。

---

### 2-9. Welding Conditions `/api/masters/welding-conditions`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `welding_condition_id` | UUID (PK) | 自動生成 |
| `main_power_w` | float | メインビーム出力 [W] |
| `sub_power_w` | float | サブビーム出力 [W] |
| `welding_speed_mm_s` | float | 溶接速度 [mm/s] |
| `main_focus_offset_mm` | float | メインフォーカスオフセット [mm] |
| `sub_focus_offset_mm` | float | サブフォーカスオフセット [mm] |
| `trajectory_set_id` | UUID (FK) | トラジェクトリセット参照 |
| `remarks` | string | メモ |

---

### 2-10. Trajectory Sets `/api/masters/trajectory-sets`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `trajectory_set_id` | UUID (PK) | 自動生成 |
| `main_trajectory_id` | UUID (FK) | メイントラジェクトリ参照 |
| `sub_trajectory_id` | UUID (FK) | サブトラジェクトリ参照 |
| `trajectory_csv_path` | string | CSV ファイルパス |
| `remarks` | string | メモ |

**追加エンドポイント:** `GET /api/masters/trajectory-sets/{item_id}/detail`

---

### 2-11. Main Trajectories `/api/masters/main-trajectories`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `main_trajectory_id` | UUID (PK) | 自動生成 |
| `main_trajectory_type` | string | トラジェクトリ種別 |
| `main_trajectory_parameter_id` | UUID (FK) | ラインパラメータ参照 |
| `remarks` | string | メモ |

---

### 2-12. Line Parameters `/api/masters/line-parameters`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `main_trajectory_type_parameter_id` | UUID (PK) | 自動生成 |
| `length_mm` | float | ライン長さ [mm] |
| `remarks` | string | メモ |

---

### 2-13. Sub Trajectories `/api/masters/sub-trajectories`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `sub_trajectory_id` | UUID (PK) | 自動生成 |
| `sub_trajectory_type` | string | サブトラジェクトリ種別 |
| `sub_trajectory_parameter_id` | UUID (FK) | ウォブリングパラメータ参照 |
| `remarks` | string | メモ |

---

### 2-14. Wobbling Parameters `/api/masters/wobbling-parameters`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `sub_trajectory_type_parameter_id` | UUID (PK) | 自動生成 |
| `wobble_radius_mm` | float | ウォブル半径 [mm] |
| `wobble_frequency_hz` | float | ウォブル周波数 [Hz] |
| `circumferential_speed` | float | 周速度 |
| `remarks` | string | メモ |

---

### 2-15. Shielding Conditions `/api/masters/shielding-conditions`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `shielding_condition_id` | UUID (PK) | 自動生成 |
| `gas_type` | string | ガス種（例: Ar, N2） |
| `gas_purity_percent` | float | ガス純度 [%] |
| `gas_flow_l_min` | float | 流量 [L/min] |
| `gas_pressure_kpa` | float | 圧力 [kPa] |
| `nozzle_type` | string | ノズル形状 |
| `nozzle_diameter_mm` | float | ノズル径 [mm] |
| `nozzle_distance_mm` | float | ノズルワーク間距離 [mm] |
| `nozzle_angle_deg` | float | ノズル角度 [°] |
| `remarks` | string | メモ |

---

### 2-16. Results `/api/masters/results`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `result_id` | UUID (PK) | 自動生成 |
| `oct_depth_mm` | float | OCT 計測深さ [mm] |
| `oct_surface_csv_path` | string | OCT 表面データ CSV パス |
| `oct_depth_csv_path` | string | OCT 深さデータ CSV パス |
| `oct_result_csv_path` | string | OCT 結果 CSV パス |
| `cross_section_depth_mm` | float | 断面深さ [mm] |
| `spatter_flag` | boolean | スパッタ発生フラグ |
| `spatter_severity` | float | スパッタ重篤度 |
| `gap_opening_flag` | boolean | ギャップ開口フラグ |
| `crack_flag` | boolean | 割れフラグ |
| `crack_severity` | float | 割れ重篤度 |
| `glass_contamination` | boolean | ガラス汚染フラグ |
| `surface_contamination` | boolean | 表面汚染フラグ |
| `penetration_flag` | boolean | 完全貫通フラグ |
| `remarks` | string | メモ |

---

### 2-17. Observations `/api/masters/observations`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `observation_id` | UUID (PK) | 自動生成 |
| `observer_name` | string | 観察者名 |
| `observation_datetime` | string | 観察日時（ISO 8601 形式推奨） |
| `comment` | text | コメント |
| `remarks` | string | メモ |

---

### 2-18. Files `/api/masters/files`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `file_id` | UUID (PK) | 自動生成 |
| `remarks` | string | メモ |

---

### 2-19. Experiment Materials `/api/masters/experiment-materials`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `experiment_material_id` | UUID (PK) | 自動生成 |
| `material_state_id` | UUID (FK) | 材料状態参照 |
| `material_role` | string | 材料役割（例: top, bottom） |
| `remarks` | string | メモ |

---

### 2-20. Column Definitions `/api/masters/column-defs`

Settings ページの表示設定（テーブル定義）を管理します。

| Method | Path | 説明 |
|--------|------|------|
| `GET` | `/api/masters/column-defs` | 一覧（`?table_name=TABLE` でフィルタ可） |
| `POST` | `/api/masters/column-defs/init` | モデル定義からカラム定義を自動生成 |
| `POST` | `/api/masters/column-defs/sync-fk/{column_name}` | 指定カラム名の FK 行を同期 |
| `POST` | `/api/masters/column-defs` | 1件作成 |
| `GET` | `/api/masters/column-defs/{item_id}` | 1件取得 |
| `PUT` | `/api/masters/column-defs/{item_id}` | 更新 |
| `DELETE` | `/api/masters/column-defs/{item_id}` | 削除 |
| `DELETE` | `/api/masters/column-defs/fk-by-column/{column_name}` | 指定カラム名の FK 行を一括削除 |

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `column_def_id` | UUID (PK) | 自動生成 |
| `table_name` | string | テーブル名（大文字、例: `EXPERIMENT`） |
| `column_name` | string | カラム名 |
| `data_type` | string | `string` / `float` / `integer` / `boolean` / `text` / `uuid` |
| `unit` | string | 単位（例: `mm`, `W`） |
| `is_id` | string | `pk`（主キー）/ `fk`（外部キー）/ 空文字 |
| `candidates` | string | 選択肢（カンマ区切り） |
| `order_index` | integer | 表示順 |

---

## 3. Import / Export `/api/io`

| Method | Path | Content-Type | 説明 |
|--------|------|:------------:|------|
| `GET` | `/api/io/tables` | JSON | エクスポート可能なテーブル名一覧 |
| `GET` | `/api/io/export/full` | JSON | 全テーブルのデータを JSON で一括エクスポート |
| `GET` | `/api/io/export/table/{table_name}` | JSON | 指定テーブルのデータを JSON でエクスポート |
| `GET` | `/api/io/export/zip` | ZIP | 全テーブルを CSV にして ZIP ダウンロード |
| `GET` | `/api/io/export/db` | binary | SQLite DB ファイルをダウンロード |
| `POST` | `/api/io/import/json` | JSON | JSON 形式でデータをインポート（既存データと結合） |
| `POST` | `/api/io/import/csv/{table_name}` | multipart | 指定テーブルへ CSV をインポート |
| `POST` | `/api/io/import/db` | multipart | SQLite DB ファイルをインポート（全データ上書き） |
| `POST` | `/api/io/merge/db` | multipart | SQLite DB ファイルをマージ（既存データ保持、重複はスキップ） |

---

## 4. Docs `/api/docs`

| Method | Path | 説明 |
|--------|------|------|
| `GET` | `/api/docs/er_diagram_live` | column_def から Mermaid ER ダイアグラムを動的生成。同時に `docs/er_diagram.mmd` を更新 |
| `GET` | `/api/docs/{filename}` | `docs/` フォルダ内のファイルをプレーンテキストで取得（パストラバーサル防止あり） |

### ER Diagram Live レスポンス例

```
erDiagram
    EXPERIMENT {
        uuid experiment_id PK
        uuid galvano_system_id FK
        ...
    }
    EXPERIMENT }o--|| GALVANO_SYSTEM : ""
    ...
```

---

## 5. データ関係図（概要）

```
EXPERIMENT
 ├── GALVANO_SYSTEM
 │    ├── FTHETA
 │    └── OPTICS (main / sub / OCT)
 │         └── LASER_DEVICE
 │              └── LASER_BEAM (single / ring / multi)
 │              └── DOE
 ├── WELDING_CONDITION
 │    └── TRAJECTORY_SET
 │         ├── MAIN_TRAJECTORY → LINE_PARAMETER
 │         └── SUB_TRAJECTORY  → WOBBLING_PARAMETER
 ├── EXPERIMENT_MATERIAL
 │    └── MATERIAL_STATE → MATERIAL
 ├── SHIELDING_CONDITION
 ├── RESULT
 ├── OBSERVATION
 └── FILE
```
