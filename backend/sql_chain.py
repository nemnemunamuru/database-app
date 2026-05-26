"""
LangChain SQL Chain — experiment.db
シンプルな Chain 実装。スキーマ固定で毎回 SQL を生成→実行→解釈する。
Agent より高速だが、曖昧な質問や複数ステップが必要な場合は sql_agent.py を使うこと。

使い方:
    python sql_chain.py
    python sql_chain.py --question "溶込み深さが最も大きかった実験の条件は？"

必要な環境変数 (.env):
    OPENAI_API_KEY=sk-...
"""

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_community.utilities.sql_database import SQLDatabase

load_dotenv()

DB_PATH = Path(__file__).parent / "db" / "experiment.db"


def build_chain():
    db = SQLDatabase.from_uri(f"sqlite:///{DB_PATH}")
    schema = db.get_table_info()
    llm = ChatOpenAI(model="gpt-4o", temperature=0)

    # ── Step 1: 質問 → SQL クエリ生成 ──────────────────────────────────────
    sql_prompt = ChatPromptTemplate.from_messages([
        ("system", """あなたは SQLite の専門家です。
以下のデータベーススキーマを参考に、ユーザーの質問に答えるための SELECT クエリを生成してください。

## スキーマ
{schema}

## 規則
- SELECT 文のみ出力する（コメントや説明は不要）
- INSERT / UPDATE / DELETE は絶対に使わない
- 必要に応じて JOIN を使用する
- 結果を絞るために WHERE / HAVING を適切に使う
- SQLite の文法に従う
"""),
        ("human", "{question}"),
    ])

    # ── Step 2: SQL 結果 + 質問 → 日本語で解説 ─────────────────────────────
    interpret_prompt = ChatPromptTemplate.from_messages([
        ("system", """あなたはデータ分析の専門家です。
SQLクエリの実行結果をもとに、ユーザーの質問に対してわかりやすい日本語で回答してください。
専門用語には簡単な説明を添えてください。"""),
        ("human", """元の質問: {question}
実行クエリ: {query}
クエリ結果: {result}

この結果から何がわかりますか？"""),
    ])

    def generate_and_run(inputs: dict) -> dict:
        question = inputs["question"]
        # SQL 生成
        query_chain = sql_prompt | llm | StrOutputParser()
        query = query_chain.invoke({"schema": schema, "question": question})
        # SQL 実行
        try:
            result = db.run(query)
        except Exception as e:
            result = f"SQL 実行エラー: {e}"
        return {"question": question, "query": query, "result": result}

    chain = (
        RunnablePassthrough()
        | generate_and_run
        | interpret_prompt
        | llm
        | StrOutputParser()
    )
    return chain, schema


def ask(question: str) -> dict:
    """質問を投げて {'answer': str, 'query': str} を返す"""
    db = SQLDatabase.from_uri(f"sqlite:///{DB_PATH}")
    schema = db.get_table_info()
    llm = ChatOpenAI(model="gpt-4o", temperature=0)

    sql_prompt = ChatPromptTemplate.from_messages([
        ("system", """あなたは SQLite の専門家です。
以下のデータベーススキーマを参考に SELECT クエリのみを生成してください（説明不要）。
{schema}"""),
        ("human", "{question}"),
    ])
    interpret_prompt = ChatPromptTemplate.from_messages([
        ("system", "データ分析の専門家として、SQLクエリの結果をもとに日本語で回答してください。"),
        ("human", "質問: {question}\nクエリ: {query}\n結果: {result}\n\n回答:"),
    ])

    query = (sql_prompt | llm | StrOutputParser()).invoke(
        {"schema": schema, "question": question}
    )
    try:
        result = db.run(query)
    except Exception as e:
        result = f"SQL 実行エラー: {e}"

    answer = (interpret_prompt | llm | StrOutputParser()).invoke(
        {"question": question, "query": query, "result": result}
    )
    return {"answer": answer, "query": query}


def interactive_loop() -> None:
    print("=" * 60)
    print("レーザー溶接実験 DB チャットボット (LangChain Chain)")
    print("終了: 'exit' または 'quit'")
    print("=" * 60)

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

        result = ask(question)
        print(f"\n【生成クエリ】\n{result['query']}")
        print(f"\n【回答】\n{result['answer']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="実験DB SQL Chain")
    parser.add_argument("--question", "-q", type=str, default=None,
                        help="1 回だけ質問して終了する")
    args = parser.parse_args()

    if not os.getenv("OPENAI_API_KEY"):
        print("エラー: OPENAI_API_KEY が設定されていません。.env ファイルを確認してください。")
        raise SystemExit(1)

    if args.question:
        result = ask(args.question)
        print(f"\n【生成クエリ】\n{result['query']}")
        print(f"\n【回答】\n{result['answer']}")
    else:
        interactive_loop()
