import sqlite3


def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def main():
    db_path = "sample.db"
    conn = get_connection(db_path)
    print(f"Connected to {db_path}")
    conn.close()


if __name__ == "__main__":
    main()
