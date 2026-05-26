"""
LangChain SQL Agent (Tool Calling) — experiment.db
自然言語でレーザー溶接実験データベースに問い合わせするエージェント。

使い方:
    python sql_agent.py
    python sql_agent.py --question "スパッタが発生した実験の溶接速度の平均は？"

必要な環境変数 (.env):
    OPENAI_API_KEY=sk-...
"""

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import Tool
from langchain_openai import ChatOpenAI
from langchain_community.utilities.sql_database import SQLDatabase
from langchain.agents import AgentExecutor, create_openai_tools_agent

load_dotenv()

# ── DB パス ──────────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent / "db" / "experiment.db"


def build_agent(verbose: bool = True) -> AgentExecutor:
    db = SQLDatabase.from_uri(f"sqlite:///{DB_PATH}")
    llm = ChatOpenAI(model="gpt-4o", temperature=0)

    def run_query(query: str) -> str:
        try:
            return db.run(query)
        except Exception as e:
            return f"Error: {e}"

    tools = [
        Tool(
            name="get_schema",
            func=lambda _: db.get_table_info(),
            description=(
                "データベース内の全テーブルのスキーマ（CREATE TABLE 文）を返します。"
                "クエリを書く前に必ずこのツールでスキーマを確認してください。"
            ),
        ),
        Tool(
            name="query_sql",
            func=run_query,
            description=(
                "SQLite の SQL クエリを実行し、結果を文字列で返します。"
                "クエリは SELECT のみ使用してください（INSERT/UPDATE/DELETE は禁止）。"
            ),
        ),
    ]

    system_prompt = """あなたはレーザー溶接実験データベースの分析専門家です。
SQLite データベースに対してクエリを実行し、ユーザーの質問に日本語で回答します。

## データベース概要
このデータベースはレーザー溶接実験の管理システムです。主なテーブル:
- experiment       : 実験の中心テーブル（各外部キーで他テーブルに接続）
- welding_condition: 溶接条件（出力, 速度, フォーカスオフセットなど）
- result           : 実験結果（溶込み深さ, スパッタ, 欠陥フラグなど）
- material / material_state: 材料情報
- galvano_system   : ガルバノスキャナ設定
- shielding_condition: シールドガス条件
- laser_device / laser_beam: レーザー装置情報
- project          : プロジェクト分類
- observation      : 観察コメント

## 手順
1. まず get_schema でスキーマを確認する
2. 適切な JOIN を含む SELECT クエリを query_sql で実行する
3. 結果をわかりやすく日本語で解説する

## 注意
- SELECT のみ使用（データ変更禁止）
- カラム名が不明な場合は必ずスキーマを確認する
- 集計・統計・条件絞り込みを積極的に活用する
"""

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{input}"),
        ("assistant", "{agent_scratchpad}"),
    ])

    agent = create_openai_tools_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent, tools=tools, verbose=verbose)


def ask(question: str, verbose: bool = True) -> str:
    executor = build_agent(verbose=verbose)
    try:
        response = executor.invoke({"input": question})
        return response["output"]
    except Exception as e:
        return f"エラー: {e}"


def interactive_loop() -> None:
    print("=" * 60)
    print("レーザー溶接実験 DB チャットボット (LangChain Agent)")
    print("終了: 'exit' または 'quit'")
    print("=" * 60)

    # エージェントを一度だけ構築（毎回 schema 取得を省くため）
    executor = build_agent(verbose=True)

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
            result = executor.invoke({"input": question})
            print("\n【回答】")
            print(result["output"])
        except Exception as e:
            print(f"エラー: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="実験DB SQL エージェント")
    parser.add_argument("--question", "-q", type=str, default=None,
                        help="1 回だけ質問して終了する")
    parser.add_argument("--quiet", action="store_true",
                        help="エージェントの思考ログを非表示にする")
    args = parser.parse_args()

    if not os.getenv("OPENAI_API_KEY"):
        print("エラー: OPENAI_API_KEY が設定されていません。.env ファイルを確認してください。")
        raise SystemExit(1)

    if args.question:
        answer = ask(args.question, verbose=not args.quiet)
        print("\n【回答】")
        print(answer)
    else:
        interactive_loop()
