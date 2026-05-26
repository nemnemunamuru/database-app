"""
PX-AI SQL Agent (LangChain + AzureChatOpenAI) — experiment.db
パナソニック PX-AI API（Azure OpenAI 互換）を使って
自然言語でレーザー溶接実験データベースに問い合わせするエージェント。

使い方:
    python sql_agent_pxai.py
    python sql_agent_pxai.py --question "スパッタが発生した実験の溶接速度の平均は？"
    python sql_agent_pxai.py --question "..." --chain  # Chain モードで実行

必要な .env 設定:
    PX_AI_API_KEY=your-pxai-api-key-here
    PX_AI_PROXY=http://your-proxy:port
    PX_AI_DEPLOYMENT=pisc-newsol-openai-uat-gpt-4o-mini  # モデル選択
"""

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import AzureChatOpenAI
from langchain_community.utilities.sql_database import SQLDatabase
from langgraph.prebuilt import create_react_agent

load_dotenv()

# ── DB パス ──────────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent / "db" / "experiment.db"

# ── PX-AI 接続定数 ────────────────────────────────────────────────────────────
ENDPOINT       = "https://pisc-newsol-openai-uat-mgd.azure-api.net/pxaiapi/2024-10-21"
API_VERSION    = "2024-10-21"

# デプロイ名→モデルの対応（参考）
DEPLOYMENTS = {
    "gpt-4o"       : "pisc-newsol-openai-uat-gpt-4o",
    "gpt-4o-mini"  : "pisc-newsol-openai-uat-gpt-4o-mini",
    "gpt-4.1"      : "pisc-newsol-openai-uat-gpt-41",
    "gpt-4.1-mini" : "pisc-newsol-openai-uat-gpt-41-mini",
    "gpt-4.1-nano" : "pisc-newsol-openai-uat-gpt-41-nano",
}

SYSTEM_PROMPT = """あなたはレーザー溶接実験データベースの分析専門家です。
SQLite データベースに対してクエリを実行し、ユーザーの質問に日本語で回答します。

## データベース概要
このデータベースはレーザー溶接実験の管理システムです。主なテーブル:
- experiment       : 実験の中心テーブル（各外部キーで他テーブルに接続）
- welding_condition: 溶接条件（出力[W], 速度[mm/s], フォーカスオフセットなど）
- result           : 実験結果（溶込み深さ[mm], スパッタフラグ, 欠陥フラグなど）
- material / material_state: 材料情報（材質名, 厚み, 表面状態など）
- galvano_system   : ガルバノスキャナ設定（スポット径など）
- shielding_condition: シールドガス条件（ガス種, 流量など）
- laser_device / laser_beam: レーザー装置・ビーム情報
- project          : プロジェクト分類
- observation      : 観察コメント

## 手順
1. まず get_schema でスキーマを確認する
2. 適切な JOIN を含む SELECT クエリを query_sql で実行する
3. 結果をわかりやすく日本語で解説する

## 注意
- SELECT のみ使用（INSERT/UPDATE/DELETE は禁止）
- 集計・統計・条件絞り込みを積極的に活用する
"""


def _setup_proxy() -> None:
    """プロキシを環境変数にセット（社内ネットワーク必須）"""
    proxy = os.getenv("PX_AI_PROXY", "")
    if proxy:
        os.environ.setdefault("HTTP_PROXY", proxy)
        os.environ.setdefault("HTTPS_PROXY", proxy)


def _build_llm() -> AzureChatOpenAI:
    api_key = os.getenv("PX_AI_API_KEY", "")
    deployment = os.getenv("PX_AI_DEPLOYMENT", "pisc-newsol-openai-uat-gpt-4o-mini")
    if not api_key or api_key.startswith("your-"):
        raise ValueError(
            "PX_AI_API_KEY が設定されていません。.env ファイルを確認してください。"
        )
    return AzureChatOpenAI(
        azure_endpoint=ENDPOINT,
        api_key=api_key,
        api_version=API_VERSION,
        azure_deployment=deployment,
        temperature=0,
    )


# ────────────────────────────────────────────────────────────────────────────
# Agent モード（Tool Calling）
# ────────────────────────────────────────────────────────────────────────────

def build_agent(verbose: bool = True):
    _setup_proxy()
    db = SQLDatabase.from_uri(f"sqlite:///{DB_PATH}")
    llm = _build_llm()

    @tool
    def get_schema() -> str:
        """データベース内の全テーブルのスキーマ（CREATE TABLE 文）を返します。クエリを書く前に必ず確認してください。"""
        return db.get_table_info()

    @tool
    def query_sql(query: str) -> str:
        """SQLite の SELECT クエリを実行し、結果を文字列で返します。SELECT のみ使用可（INSERT/UPDATE/DELETE は禁止）。"""
        try:
            return db.run(query)
        except Exception as e:
            return f"Error: {e}"

    agent = create_react_agent(
        model=llm,
        tools=[get_schema, query_sql],
        prompt=SYSTEM_PROMPT,
    )
    return agent


def ask_agent(question: str, verbose: bool = True) -> str:
    agent = build_agent(verbose=verbose)
    try:
        result = agent.invoke({"messages": [HumanMessage(content=question)]})
        # 最後の AI メッセージを取得
        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
                return msg.content
        return str(result["messages"][-1].content)
    except Exception as e:
        return f"エラー: {e}"


# ────────────────────────────────────────────────────────────────────────────
# Chain モード（シンプル・高速）
# ────────────────────────────────────────────────────────────────────────────

def ask_chain(question: str) -> dict:
    """質問を投げて {'answer': str, 'query': str} を返す"""
    _setup_proxy()
    db = SQLDatabase.from_uri(f"sqlite:///{DB_PATH}")
    schema = db.get_table_info()
    llm = _build_llm()

    sql_prompt = ChatPromptTemplate.from_messages([
        ("system", f"""あなたは SQLite の専門家です。
以下のデータベーススキーマを参考に SELECT クエリのみを生成してください（説明不要）。
INSERT/UPDATE/DELETE は絶対に使わないでください。

## スキーマ
{schema}"""),
        ("human", "{question}"),
    ])
    interpret_prompt = ChatPromptTemplate.from_messages([
        ("system", "データ分析の専門家として、SQLクエリの結果をもとに日本語でわかりやすく回答してください。"),
        ("human", "質問: {question}\nクエリ: {query}\n結果: {result}\n\n回答:"),
    ])

    query = (sql_prompt | llm | StrOutputParser()).invoke({"question": question})
    try:
        result = db.run(query)
    except Exception as e:
        result = f"SQL 実行エラー: {e}"

    answer = (interpret_prompt | llm | StrOutputParser()).invoke(
        {"question": question, "query": query, "result": result}
    )
    return {"answer": answer, "query": query}


# ────────────────────────────────────────────────────────────────────────────
# 対話ループ
# ────────────────────────────────────────────────────────────────────────────

def interactive_loop(use_chain: bool = False) -> None:
    mode = "Chain" if use_chain else "Agent (Tool Calling)"
    print("=" * 60)
    print(f"レーザー溶接実験 DB チャットボット — PX-AI [{mode}]")
    deployment = os.getenv("PX_AI_DEPLOYMENT", "pisc-newsol-openai-uat-gpt-4o-mini")
    print(f"モデル: {deployment}")
    print("終了: 'exit' または 'quit'")
    print("=" * 60)

    agent = None if use_chain else build_agent(verbose=True)

    while True:
        try:
            question = input("\n質問: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n終了します。")
            break
        if not question:
            continue
        if question.lower() in {"exit", "quit", "終了"}:
            print("終了します。")
            break

        try:
            if use_chain:
                r = ask_chain(question)
                print(f"\n【生成クエリ】\n{r['query']}")
                print(f"\n【回答】\n{r['answer']}")
            else:
                result = agent.invoke({"messages": [HumanMessage(content=question)]})
                for msg in reversed(result["messages"]):
                    if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
                        print("\n【回答】")
                        print(msg.content)
                        break
        except Exception as e:
            print(f"エラー: {e}")


# ────────────────────────────────────────────────────────────────────────────
# エントリポイント
# ────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PX-AI 実験DB SQL エージェント")
    parser.add_argument("--question", "-q", type=str, default=None,
                        help="1 回だけ質問して終了する")
    parser.add_argument("--chain", action="store_true",
                        help="Chain モードで実行（Agent より高速だが複雑な質問は不得手）")
    parser.add_argument("--quiet", action="store_true",
                        help="エージェントの思考ログを非表示にする（Agent モード時）")
    args = parser.parse_args()

    try:
        _build_llm()  # APIキー・設定チェック
    except ValueError as e:
        print(f"設定エラー: {e}")
        raise SystemExit(1)

    if args.question:
        if args.chain:
            r = ask_chain(args.question)
            print(f"\n【生成クエリ】\n{r['query']}")
            print(f"\n【回答】\n{r['answer']}")
        else:
            answer = ask_agent(args.question, verbose=not args.quiet)
            print("\n【回答】")
            print(answer)
    else:
        interactive_loop(use_chain=args.chain)
