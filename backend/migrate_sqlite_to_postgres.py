import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, MetaData, text


# ============================================================
# CONFIGURATION
# ============================================================

# SQLite database on the machine where this script runs.
# Change this if your database is somewhere else.
SQLITE_PATH = Path(__file__).resolve().parent.parent / "instance" / "scheduler.db"

# PostgreSQL connection.
# When running inside the backend Docker container, this should
# come from the DATABASE_URL environment variable.
POSTGRES_URL = os.environ.get("DATABASE_URL")

if not POSTGRES_URL:
    print("ERROR: DATABASE_URL environment variable is not set.")
    sys.exit(1)

if not SQLITE_PATH.exists():
    print(f"ERROR: SQLite database not found:")
    print(f"       {SQLITE_PATH}")
    sys.exit(1)


# ============================================================
# TABLE ORDER
# ============================================================

# Parent tables must be migrated before child tables.
TABLE_ORDER = [
    "shift_types",
    "staff",
    "users",
    "schedule_entries",
    "shift_trade_requests",
    "overtime_slots",
    "overtime_bids",
]


# ============================================================
# ENGINES
# ============================================================

sqlite_url = f"sqlite:///{SQLITE_PATH}"

sqlite_engine = create_engine(sqlite_url)
postgres_engine = create_engine(POSTGRES_URL)


# ============================================================
# REFLECT DATABASES
# ============================================================

print()
print("=" * 60)
print("SQLite → PostgreSQL Migration")
print("=" * 60)
print()
print(f"SQLite : {SQLITE_PATH}")
print("Postgres:", POSTGRES_URL.replace(
    os.environ.get("POSTGRES_PASSWORD", ""),
    "********"
))
print()


sqlite_metadata = MetaData()
postgres_metadata = MetaData()

sqlite_metadata.reflect(bind=sqlite_engine)
postgres_metadata.reflect(bind=postgres_engine)


# ============================================================
# VERIFY TABLES
# ============================================================

print("Checking tables...")

for table_name in TABLE_ORDER:
    if table_name not in sqlite_metadata.tables:
        print(f"WARNING: SQLite table missing: {table_name}")

    if table_name not in postgres_metadata.tables:
        print(f"ERROR: PostgreSQL table missing: {table_name}")
        sys.exit(1)

print("Table check complete.")
print()


# ============================================================
# SHOW SOURCE COUNTS
# ============================================================

print("SQLite record counts:")
print("-" * 40)

with sqlite_engine.connect() as conn:
    source_counts = {}

    for table_name in TABLE_ORDER:
        if table_name not in sqlite_metadata.tables:
            source_counts[table_name] = 0
            continue

        count = conn.execute(
            text(f'SELECT COUNT(*) FROM "{table_name}"')
        ).scalar()

        source_counts[table_name] = count
        print(f"{table_name:25} {count}")

print()


# ============================================================
# CONFIRMATION
# ============================================================

print("WARNING:")
print("This migration will DELETE existing data from these")
print("PostgreSQL application tables before importing SQLite data.")
print()

answer = input("Type MIGRATE to continue: ")

if answer != "MIGRATE":
    print("Migration cancelled.")
    sys.exit(0)


# ============================================================
# DISABLE FOREIGN KEY CHECKS / CLEAR TABLES
# ============================================================

print()
print("Clearing PostgreSQL tables...")

with postgres_engine.begin() as conn:

    # PostgreSQL allows TRUNCATE ... CASCADE.
    # This clears dependent records safely.
    tables = ", ".join(f'"{name}"' for name in TABLE_ORDER)

    conn.execute(
        text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE")
    )

print("PostgreSQL tables cleared.")
print()


# ============================================================
# COPY DATA
# ============================================================

print("Copying data...")
print("-" * 40)

with sqlite_engine.connect() as sqlite_conn:
    with postgres_engine.begin() as pg_conn:

        for table_name in TABLE_ORDER:

            if table_name not in sqlite_metadata.tables:
                print(f"{table_name:25} SKIPPED (not in SQLite)")
                continue

            sqlite_table = sqlite_metadata.tables[table_name]
            postgres_table = postgres_metadata.tables[table_name]

            # Get columns from each database.
            sqlite_columns = {
                column.name for column in sqlite_table.columns
            }

            postgres_columns = {
                column.name for column in postgres_table.columns
            }

            # Only copy columns existing in BOTH databases.
            common_columns = [
                column.name
                for column in postgres_table.columns
                if column.name in sqlite_columns
            ]

            if not common_columns:
                print(f"{table_name:25} SKIPPED (no common columns)")
                continue

            # Read SQLite data.
            result = sqlite_conn.execute(
                sqlite_table.select()
            )

            rows = result.mappings().all()

            if not rows:
                print(f"{table_name:25} 0 records")
                continue

            # Build PostgreSQL insert.
            insert_values = []

            for row in rows:
                data = {
                    column: row[column]
                    for column in common_columns
                }

                insert_values.append(data)

            pg_conn.execute(
                postgres_table.insert(),
                insert_values
            )

            print(
                f"{table_name:25} {len(insert_values)} records"
            )


# ============================================================
# RESET POSTGRES SEQUENCES
# ============================================================

print()
print("Resetting PostgreSQL sequences...")
print("-" * 40)

with postgres_engine.begin() as conn:

    for table_name in TABLE_ORDER:

        table = postgres_metadata.tables.get(table_name)

        if table is None:
            continue

        # Find integer primary-key columns.
        for column in table.primary_key.columns:

            if not column.autoincrement:
                continue

            # Only reset integer ID columns.
            if str(column.type).lower().startswith("integer"):

                sequence_sql = text(
                    f"""
                    SELECT setval(
                        pg_get_serial_sequence(
                            :table_name,
                            :column_name
                        ),
                        COALESCE(
                            (SELECT MAX("{column.name}")
                             FROM "{table_name}"),
                            1
                        ),
                        (SELECT COUNT(*) > 0
                         FROM "{table_name}")
                    )
                    """
                )

                try:
                    conn.execute(
                        sequence_sql,
                        {
                            "table_name": table_name,
                            "column_name": column.name,
                        },
                    )

                    print(
                        f"{table_name}.{column.name} sequence reset"
                    )

                except Exception as exc:
                    print(
                        f"Could not reset sequence "
                        f"{table_name}.{column.name}: {exc}"
                    )


# ============================================================
# VERIFY COUNTS
# ============================================================

print()
print("=" * 60)
print("Migration verification")
print("=" * 60)
print()

migration_ok = True

with postgres_engine.connect() as conn:

    for table_name in TABLE_ORDER:

        if table_name not in postgres_metadata.tables:
            continue

        count = conn.execute(
            text(f'SELECT COUNT(*) FROM "{table_name}"')
        ).scalar()

        source_count = source_counts.get(table_name, 0)

        status = "OK" if count == source_count else "MISMATCH"

        if status != "OK":
            migration_ok = False

        print(
            f"{table_name:25} "
            f"SQLite={source_count:<6} "
            f"Postgres={count:<6} "
            f"{status}"
        )


print()

if migration_ok:
    print("=" * 60)
    print("MIGRATION SUCCESSFUL")
    print("=" * 60)
else:
    print("=" * 60)
    print("MIGRATION COMPLETED WITH MISMATCHES")
    print("=" * 60)