import Dexie, { Table } from 'dexie'

export interface FoodRecord {
  id?: number
  name: string
  category: string
  default_shelf_days: number | null
  created_at: string
  updated_at: string
}

export interface StockItemRecord {
  id?: number
  food_id: number
  quantity: number
  unit: string
  expiry_date: string | null
  purchased_date: string | null
  opened: boolean
  location: string | null
  category_override: string | null
  created_at: string
  updated_at: string
}

export interface StockTransactionRecord {
  id?: number
  stock_item_id: number
  tx_type: string
  quantity_delta: number
  created_at: string
}

export interface MealPlanRecord {
  id?: number
  start_date: string
  end_date: string
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MealRecord {
  id?: number
  meal_plan_id: number
  recipe_id: number | null
  served_date: string
  meal_type: string
  status: string
  concept: string | null
  estimated_ingredients: string
  cook_time_min_estimate: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RecipeRecord {
  id?: number
  name: string
  instructions_md: string
  cook_time_min: number | null
  cost_estimate: string | null
  is_favorite: boolean
  reuse_count: number
  created_at: string
  updated_at: string
}

export interface RecipeIngredientRecord {
  id?: number
  recipe_id: number
  food_id: number | null
  raw_name: string | null
  quantity: number | null
  unit: string | null
  is_main: boolean
  notes: string | null
}

export interface ProfileRecord {
  id: number
  family_composition: string | null
  food_preferences: string | null
  allergies: string | null
  updated_at: string
}

class KitchenDB extends Dexie {
  foods!: Table<FoodRecord>
  stockItems!: Table<StockItemRecord>
  stockTransactions!: Table<StockTransactionRecord>
  mealPlans!: Table<MealPlanRecord>
  meals!: Table<MealRecord>
  recipes!: Table<RecipeRecord>
  recipeIngredients!: Table<RecipeIngredientRecord>
  profile!: Table<ProfileRecord>

  constructor() {
    super('KitchenDB')
    this.version(1).stores({
      foods: '++id, category, name',
      stockItems: '++id, food_id, expiry_date',
      stockTransactions: '++id, stock_item_id',
      mealPlans: '++id, start_date',
      meals: '++id, meal_plan_id, served_date',
      recipes: '++id, name, is_favorite',
      recipeIngredients: '++id, recipe_id, food_id',
      profile: 'id',
    })
  }
}

export const db = new KitchenDB()
