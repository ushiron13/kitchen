"""initial schema v0.4

Revision ID: 001
Revises:
Create Date: 2026-05-24
"""
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("PRAGMA foreign_keys = ON;")
    op.execute("PRAGMA journal_mode = WAL;")

    op.execute("""
    CREATE TABLE family_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        preferences_json TEXT,
        allergens_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )""")

    op.execute("""
    CREATE TABLE food_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL
            CHECK(category IN ('refrigerated','frozen','pantry','ambient','seasoning')),
        default_shelf_days INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )""")
    op.execute("CREATE INDEX idx_food_master_category ON food_master(category)")

    op.execute("""
    CREATE TABLE food_alias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        food_id INTEGER NOT NULL,
        alias TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL DEFAULT 'manual'
            CHECK(source IN ('manual','llm_inferred')),
        confidence REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(food_id) REFERENCES food_master(id) ON DELETE CASCADE
    )""")
    op.execute("CREATE INDEX idx_food_alias_alias   ON food_alias(alias)")
    op.execute("CREATE INDEX idx_food_alias_food_id ON food_alias(food_id)")

    op.execute("""
    CREATE TABLE stock_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        food_id INTEGER NOT NULL,
        quantity REAL NOT NULL CHECK(quantity >= 0),
        unit TEXT NOT NULL,
        expiry_date TEXT,
        opened INTEGER NOT NULL DEFAULT 0 CHECK(opened IN (0,1)),
        location TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(food_id) REFERENCES food_master(id)
    )""")
    op.execute("CREATE INDEX idx_stock_item_food_id     ON stock_item(food_id)")
    op.execute("CREATE INDEX idx_stock_item_expiry_date ON stock_item(expiry_date)")

    op.execute("""
    CREATE TABLE recipe (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        instructions_md TEXT NOT NULL,
        cook_time_min INTEGER,
        cost_estimate TEXT,
        image_path TEXT,
        source TEXT NOT NULL DEFAULT 'llm'
            CHECK(source IN ('llm','external','manual')),
        external_id TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1)),
        is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
        reuse_count INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )""")
    op.execute("CREATE INDEX idx_recipe_is_favorite ON recipe(is_favorite) WHERE is_archived=0")
    op.execute("CREATE INDEX idx_recipe_cook_time   ON recipe(cook_time_min) WHERE is_archived=0")
    op.execute("CREATE INDEX idx_recipe_archived    ON recipe(is_archived)")

    op.execute("""
    CREATE TABLE recipe_ingredient (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL,
        food_id INTEGER,
        raw_name TEXT,
        quantity REAL,
        unit TEXT,
        is_main INTEGER NOT NULL DEFAULT 0 CHECK(is_main IN (0,1)),
        notes TEXT,
        FOREIGN KEY(recipe_id) REFERENCES recipe(id) ON DELETE CASCADE,
        FOREIGN KEY(food_id)   REFERENCES food_master(id),
        CHECK(food_id IS NOT NULL OR raw_name IS NOT NULL)
    )""")
    op.execute("CREATE INDEX idx_recipe_ingredient_recipe_id ON recipe_ingredient(recipe_id)")
    op.execute("CREATE INDEX idx_recipe_ingredient_food_id   ON recipe_ingredient(food_id) WHERE food_id IS NOT NULL")
    op.execute("CREATE INDEX idx_recipe_ingredient_main      ON recipe_ingredient(food_id, is_main) WHERE food_id IS NOT NULL")
    op.execute("CREATE INDEX idx_recipe_ingredient_unresolved ON recipe_ingredient(recipe_id) WHERE food_id IS NULL")

    op.execute("""
    CREATE TABLE meal_plan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft'
            CHECK(status IN ('draft','confirmed','completed','cancelled')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )""")
    op.execute("CREATE INDEX idx_meal_plan_date_range ON meal_plan(start_date, end_date)")

    op.execute("""
    CREATE TABLE meal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_plan_id INTEGER,
        recipe_id INTEGER,
        served_date TEXT NOT NULL,
        meal_type TEXT NOT NULL
            CHECK(meal_type IN ('breakfast','lunch','dinner','snack')),
        status TEXT NOT NULL DEFAULT 'planned'
            CHECK(status IN ('planned','cooked','skipped')),
        concept TEXT,
        estimated_ingredients TEXT,
        cook_time_min_estimate INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(meal_plan_id) REFERENCES meal_plan(id) ON DELETE CASCADE,
        FOREIGN KEY(recipe_id)    REFERENCES recipe(id)
    )""")
    op.execute("CREATE INDEX idx_meal_plan_id    ON meal(meal_plan_id)")
    op.execute("CREATE INDEX idx_meal_served_date ON meal(served_date)")
    op.execute("CREATE INDEX idx_meal_recipe_id   ON meal(recipe_id)")

    op.execute("""
    CREATE TABLE stock_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_item_id INTEGER NOT NULL,
        tx_type TEXT NOT NULL
            CHECK(tx_type IN ('in','out','consume','waste','adjust')),
        quantity_delta REAL NOT NULL,
        meal_id INTEGER,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(stock_item_id) REFERENCES stock_item(id),
        FOREIGN KEY(meal_id)       REFERENCES meal(id)
    )""")
    op.execute("CREATE INDEX idx_stock_tx_item_id    ON stock_transaction(stock_item_id)")
    op.execute("CREATE INDEX idx_stock_tx_created_at ON stock_transaction(created_at)")

    op.execute("""
    CREATE TRIGGER trg_stock_quantity_auto_update
    AFTER INSERT ON stock_transaction
    BEGIN
        UPDATE stock_item
        SET quantity = quantity + NEW.quantity_delta,
            updated_at = datetime('now')
        WHERE id = NEW.stock_item_id;
    END""")

    op.execute("""
    CREATE TABLE meal_rating (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_id INTEGER NOT NULL,
        profile_id INTEGER NOT NULL,
        score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
        comment TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(meal_id)    REFERENCES meal(id) ON DELETE CASCADE,
        FOREIGN KEY(profile_id) REFERENCES family_profile(id),
        UNIQUE(meal_id, profile_id)
    )""")

    op.execute("""
    CREATE TABLE recipe_rating (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL,
        profile_id INTEGER NOT NULL,
        score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
        comment TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(recipe_id)  REFERENCES recipe(id) ON DELETE CASCADE,
        FOREIGN KEY(profile_id) REFERENCES family_profile(id),
        UNIQUE(recipe_id, profile_id)
    )""")

    op.execute("""
    CREATE TABLE shopping_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_plan_id INTEGER,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'draft'
            CHECK(status IN ('draft','active','completed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(meal_plan_id) REFERENCES meal_plan(id)
    )""")

    op.execute("""
    CREATE TABLE shopping_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL,
        food_id INTEGER,
        name TEXT,
        quantity REAL,
        unit TEXT,
        purchased INTEGER NOT NULL DEFAULT 0 CHECK(purchased IN (0,1)),
        needs_review INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(list_id)  REFERENCES shopping_list(id) ON DELETE CASCADE,
        FOREIGN KEY(food_id)  REFERENCES food_master(id)
    )""")
    op.execute("CREATE INDEX idx_shopping_item_list_id ON shopping_item(list_id)")

    # PRAGMA user_version
    op.execute("PRAGMA user_version = 4")


def downgrade() -> None:
    for tbl in [
        "shopping_item", "shopping_list", "recipe_rating", "meal_rating",
        "stock_transaction", "meal", "meal_plan", "recipe_ingredient",
        "recipe", "stock_item", "food_alias", "food_master", "family_profile",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {tbl}")
    op.execute("DROP TRIGGER IF EXISTS trg_stock_quantity_auto_update")
