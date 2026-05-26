import os
import warnings
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException

from backend.database import DB_DIR, MASTER_DB

router = APIRouter()

# ── .env 読み込み ─────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent.parent / ".env")
except ImportError:
    pass

PX_AI_ENDPOINT    = "https://pisc-newsol-openai-uat-mgd.azure-api.net/pxaiapi/2024-10-21"
PX_AI_API_VERSION = "2024-10-21"

AVAILABLE_MODELS = [
    {"id": "pisc-newsol-openai-uat-gpt-41",      "label": "GPT-4.1"},
    {"id": "pisc-newsol-openai-uat-gpt-41-mini",  "label": "GPT-4.1 mini"},
    {"id": "pisc-newsol-openai-uat-gpt-41-nano",  "label": "GPT-4.1 nano"},
    {"id": "pisc-newsol-openai-uat-gpt-4o",       "label": "GPT-4o"},
    {"id": "pisc-newsol-openai-uat-gpt-4o-mini",  "label": "GPT-4o mini"},
]
DEFAULT_MODEL = "pisc-newsol-openai-uat-gpt-41-mini"

_SYSTEM_PROMPT = """あなたはレーザー溶接実験データベースの分析専門家です。
SQLite データベースに対してクエリを実行し、ユーザーの質問に日本語で回答します。

主なテーブル:
- experiment       : 実験（welding_condition_id, result_id などで他テーブルと結合）
- welding_condition: 溶接条件（main_power_w, welding_speed_mm_s, main_focus_offset_mm 等）
- result           : 実験結果（oct_depth_mm, spatter_flag, crack_flag 等）
- material / material_state: 材料（material_name, thickness_mm 等）
- galvano_system   : ガルバノスキャナ（main_diameter_um 等）
- shielding_condition: シールドガス（gas_type, gas_flow_l_min 等）
- project          : プロジェクト分類

手順: まず get_schema でスキーマを確認し、query_sql で SELECT クエリを実行して回答する。
SELECT のみ使用（INSERT/UPDATE/DELETE は禁止）。最終回答は日本語で。"""


def _list_dbs_labeled() -> list[dict]:
    result: list[dict] = []
    if os.path.exists(os.path.join(DB_DIR, MASTER_DB)):
        result.append({"id": MASTER_DB, "label": "EXPERIMENT (共通DB)", "group": "EXPERIMENT"})
    proj_dir = os.path.join(DB_DIR, "projects")
    if os.path.isdir(proj_dir):
        for f in sorted(os.listdir(proj_dir)):
            if f.endswith(".db") and os.path.isfile(os.path.join(proj_dir, f)):
                stem = f[:-3]
                name = stem.split("_", 1)[1] if "_" in stem else stem
                result.append({"id": f"projects/{f}", "label": name, "group": "PROJECT"})
    return result


def _validate_db_path(db_path: str) -> str:
    full = os.path.abspath(os.path.join(DB_DIR, db_path))
    db_dir_abs = os.path.abspath(DB_DIR) + os.sep
    if not full.startswith(db_dir_abs):
        raise HTTPException(400, "Invalid db path")
    if not os.path.exists(full):
        raise HTTPException(404, f"DB not found: {db_path}")
    return full


def _setup_proxy() -> None:
    proxy = os.getenv("PX_AI_PROXY", "")
    if proxy:
        os.environ.setdefault("HTTP_PROXY", proxy)
        os.environ.setdefault("HTTPS_PROXY", proxy)


def _ask_pxai(question: str, db_full_path: str, history: list[dict] | None = None, deployment: str | None = None) -> str:
    """PX-AI Agent で質問に回答する。エラー時は例外を raise。"""
    _setup_proxy()

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        from langchain_openai import AzureChatOpenAI
        from langchain_community.utilities.sql_database import SQLDatabase
        from langchain_core.tools import tool
        from langchain_core.messages import HumanMessage, AIMessage
        from langgraph.prebuilt import create_react_agent

    api_key    = os.getenv("PX_AI_API_KEY", "")
    deployment = deployment or os.getenv("PX_AI_DEPLOYMENT", DEFAULT_MODEL)

    if not api_key or api_key.startswith("your-"):
        raise ValueError("PX_AI_API_KEY が設定されていません")

    llm = AzureChatOpenAI(
        azure_endpoint=PX_AI_ENDPOINT,
        api_key=api_key,
        api_version=PX_AI_API_VERSION,
        azure_deployment=deployment,
        temperature=0,
    )

    db = SQLDatabase.from_uri(f"sqlite:///{db_full_path}")

    @tool
    def get_schema() -> str:
        """データベースの全テーブルスキーマを返します。クエリ前に必ず確認。"""
        return db.get_table_info()

    @tool
    def query_sql(query: str) -> str:
        """SQLite の SELECT クエリを実行して結果を返します（SELECT のみ）。"""
        try:
            return db.run(query)
        except Exception as e:
            return f"Error: {e}"

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        agent = create_react_agent(
            model=llm,
            tools=[get_schema, query_sql],
            prompt=_SYSTEM_PROMPT,
        )

    # Build message list: history + current question
    history_msgs = []
    for h in (history or []):
        role = h.get("role", "")
        text = h.get("text", "")
        if role == "user":
            history_msgs.append(HumanMessage(content=text))
        elif role == "assistant":
            history_msgs.append(AIMessage(content=text))

    result = agent.invoke({"messages": history_msgs + [HumanMessage(content=question)]})
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            return msg.content
    return str(result["messages"][-1].content)


@router.get("/models")
def list_models():
    default = os.getenv("PX_AI_DEPLOYMENT", DEFAULT_MODEL)
    return {"models": AVAILABLE_MODELS, "default": default}


@router.get("/databases")
def list_databases():
    dbs = _list_dbs_labeled()
    default_id = dbs[0]["id"] if dbs else ""
    return {"databases": dbs, "default": default_id}


@router.post("/query")
def chat_query(body: dict = Body(...)):
    question:   str = body.get("question", "").strip()
    db_path:    str = body.get("db", MASTER_DB)
    history:    list = body.get("history", [])
    model:      str | None = body.get("model") or None

    if not question:
        raise HTTPException(400, "question is required")

    full = _validate_db_path(db_path)

    labeled   = _list_dbs_labeled()
    db_entry  = next((d for d in labeled if d["id"] == db_path), None)
    db_label  = db_entry["label"] if db_entry else db_path

    # ── PX-AI で回答 ────────────────────────────────────────────────────────
    try:
        message = _ask_pxai(question, full, history, deployment=model)
    except ValueError as e:
        # APIキー未設定
        message = f"⚠️ AI設定エラー: {e}\n\n.env の PX_AI_API_KEY を確認してください。"
    except Exception as e:
        message = f"⚠️ AI回答エラー: {e}"

    return {
        "db_label": db_label,
        "db": db_path,
        "experiment_count": None,
        "experiment_ids": [],
        "message": message,
    }
