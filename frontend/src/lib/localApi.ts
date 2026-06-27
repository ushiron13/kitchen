import {
  db,
  FoodRecord,
  StockItemRecord,
  MealPlanRecord,
  MealRecord,
  RecipeRecord,
} from './db'
import {
  generateMealPlan,
  generateRecipeFromConcept,
  generateSuggestedRecipes,
} from './ai'

function now(): string {
  return new Date().toISOString()
}

function toFood(r: FoodRecord & { id: number }) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    default_shelf_days: r.default_shelf_days,
  }
}

async function toStockItem(r: StockItemRecord & { id: number }) {
  const food = await db.foods.get(r.food_id)
  if (!food || food.id === undefined) throw new Error(`食材が見つかりません: id=${r.food_id}`)
  return {
    id: r.id,
    food_id: r.food_id,
    food_name: food.name,
    food_category: r.category_override ?? food.category,
    default_shelf_days: food.default_shelf_days,
    quantity: r.quantity,
    unit: r.unit,
    expiry_date: r.expiry_date,
    purchased_date: r.purchased_date,
    opened: r.opened,
    location: r.location,
  }
}

async function toMealPlan(plan: MealPlanRecord & { id: number }) {
  const meals = await db.meals.where('meal_plan_id').equals(plan.id).toArray()
  return {
    id: plan.id,
    start_date: plan.start_date,
    end_date: plan.end_date,
    status: plan.status,
    notes: plan.notes,
    meals: meals.map(m => toMeal(m as MealRecord & { id: number })),
    created_at: plan.created_at,
    updated_at: plan.updated_at,
  }
}

function toMeal(m: MealRecord & { id: number }) {
  let ingredients: string[] = []
  try { ingredients = JSON.parse(m.estimated_ingredients) } catch { /* ignore */ }
  return {
    id: m.id,
    meal_plan_id: m.meal_plan_id,
    recipe_id: m.recipe_id,
    served_date: m.served_date,
    meal_type: m.meal_type,
    status: m.status,
    concept: m.concept,
    estimated_ingredients: ingredients,
    cook_time_min_estimate: m.cook_time_min_estimate,
    notes: m.notes,
    created_at: m.created_at,
    updated_at: m.updated_at,
  }
}

async function toRecipe(r: RecipeRecord & { id: number }) {
  const ingredients = await db.recipeIngredients.where('recipe_id').equals(r.id).toArray()
  return {
    id: r.id,
    name: r.name,
    instructions_md: r.instructions_md,
    cook_time_min: r.cook_time_min,
    cost_estimate: r.cost_estimate,
    is_favorite: r.is_favorite,
    reuse_count: r.reuse_count,
    ingredients: ingredients.map(i => ({
      id: i.id!,
      food_id: i.food_id,
      raw_name: i.raw_name,
      quantity: i.quantity,
      unit: i.unit,
      is_main: i.is_main,
      notes: i.notes,
    })),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export function makeLocalApi(_apiKey: string) {
  return {
    // ---- Foods ----
    getFoods: async () => {
      const all = await db.foods.toArray()
      return all.map(f => toFood(f as FoodRecord & { id: number }))
    },

    createFood: async (p: { name: string; category: string; default_shelf_days?: number }) => {
      const t = now()
      const id = await db.foods.add({
        name: p.name,
        category: p.category,
        default_shelf_days: p.default_shelf_days ?? null,
        created_at: t,
        updated_at: t,
      })
      const record = await db.foods.get(id)
      return toFood(record as FoodRecord & { id: number })
    },

    updateFood: async (id: number, p: { name?: string; category?: string; default_shelf_days?: number | null }) => {
      await db.foods.update(id, { ...p, updated_at: now() })
      const record = await db.foods.get(id)
      return toFood(record as FoodRecord & { id: number })
    },

    deleteFood: async (id: number) => {
      const count = await db.stockItems.where('food_id').equals(id).count()
      if (count > 0) throw new Error('この食材は在庫で使用されているため削除できません')
      await db.foods.delete(id)
    },

    // ---- Stock ----
    getStock: async () => {
      const items = await db.stockItems.toArray()
      return Promise.all(items.map(i => toStockItem(i as StockItemRecord & { id: number })))
    },

    createStock: async (p: {
      food_id: number
      quantity: number
      unit: string
      expiry_date?: string
      purchased_date?: string
      category?: string
    }) => {
      const t = now()
      const id = await db.stockItems.add({
        food_id: p.food_id,
        quantity: p.quantity,
        unit: p.unit,
        expiry_date: p.expiry_date ?? null,
        purchased_date: p.purchased_date ?? null,
        opened: false,
        location: null,
        category_override: p.category ?? null,
        created_at: t,
        updated_at: t,
      })
      const record = await db.stockItems.get(id)
      return toStockItem(record as StockItemRecord & { id: number })
    },

    updateStock: async (id: number, p: {
      quantity?: number
      unit?: string
      expiry_date?: string | null
      purchased_date?: string | null
      category?: string | null
    }) => {
      const updates: Partial<StockItemRecord> = { updated_at: now() }
      if (p.quantity !== undefined) updates.quantity = p.quantity
      if (p.unit !== undefined) updates.unit = p.unit
      if ('expiry_date' in p) updates.expiry_date = p.expiry_date ?? null
      if ('purchased_date' in p) updates.purchased_date = p.purchased_date ?? null
      if ('category' in p) updates.category_override = p.category ?? null
      await db.stockItems.update(id, updates)
      const record = await db.stockItems.get(id)
      return toStockItem(record as StockItemRecord & { id: number })
    },

    consumeStock: async (itemId: number, delta: number) => {
      const item = await db.stockItems.get(itemId)
      if (!item) throw new Error('在庫アイテムが見つかりません')
      const newQty = Math.max(0, item.quantity - Math.abs(delta))
      const t = now()
      await db.transaction('rw', [db.stockItems, db.stockTransactions], async () => {
        await db.stockItems.update(itemId, { quantity: newQty, updated_at: t })
        await db.stockTransactions.add({
          stock_item_id: itemId,
          tx_type: 'consume',
          quantity_delta: -Math.abs(delta),
          created_at: t,
        })
      })
      const record = await db.stockItems.get(itemId)
      return toStockItem(record as StockItemRecord & { id: number })
    },

    deleteStock: async (itemId: number) => {
      await db.stockItems.delete(itemId)
    },

    // ---- Meal Plans ----
    createMealPlan: async (p: {
      start_date: string
      days: number
      meal_types: string[]
      preferences?: string
    }) => {
      const stockItems = await db.stockItems.toArray()
      const foods = await db.foods.toArray()
      const foodMap = new Map(foods.map(f => [f.id!, f]))

      const stockSummary = stockItems.length > 0
        ? stockItems.map(i => {
            const food = foodMap.get(i.food_id)
            if (!food) return null
            const expiryStr = i.expiry_date ? `（期限: ${i.expiry_date}）` : ''
            return `- ${food.name}: ${i.quantity}${i.unit}${expiryStr}`
          }).filter(Boolean).join('\n')
        : '（在庫なし）'

      const profile = await db.profile.get(1)
      const profileParts: string[] = []
      if (profile?.family_composition) profileParts.push(`家族構成: ${profile.family_composition}`)
      if (profile?.food_preferences) profileParts.push(`食事傾向: ${profile.food_preferences}`)
      if (profile?.allergies) profileParts.push(`アレルギー・禁忌: ${profile.allergies}`)

      const skeletons = await generateMealPlan(_apiKey, {
        stockSummary,
        startDate: p.start_date,
        days: p.days,
        mealTypes: p.meal_types,
        preferences: p.preferences ?? '',
        profileText: profileParts.join('\n'),
      })

      if (skeletons.length === 0) throw new Error('献立の生成に失敗しました')

      const endDate = skeletons.reduce((max, m) => m.served_date > max ? m.served_date : max, p.start_date)
      const t = now()

      const planId = await db.mealPlans.add({
        start_date: p.start_date,
        end_date: endDate,
        status: 'active',
        notes: null,
        created_at: t,
        updated_at: t,
      })

      const mealRecords = skeletons.map(s => ({
        meal_plan_id: planId as number,
        recipe_id: null,
        served_date: s.served_date,
        meal_type: s.meal_type,
        status: 'planned',
        concept: s.concept,
        estimated_ingredients: JSON.stringify(s.estimated_ingredients ?? []),
        cook_time_min_estimate: s.cook_time_min_estimate ?? null,
        notes: null,
        created_at: t,
        updated_at: t,
      }))
      await db.meals.bulkAdd(mealRecords)

      const plan = await db.mealPlans.get(planId)
      return toMealPlan(plan as MealPlanRecord & { id: number })
    },

    getMealPlans: async () => {
      const plans = await db.mealPlans.orderBy('start_date').reverse().toArray()
      return Promise.all(plans.map(p => toMealPlan(p as MealPlanRecord & { id: number })))
    },

    getMealPlan: async (id: number) => {
      const plan = await db.mealPlans.get(id)
      if (!plan) throw new Error('献立プランが見つかりません')
      return toMealPlan(plan as MealPlanRecord & { id: number })
    },

    deleteMealPlan: async (planId: number) => {
      await db.transaction('rw', [db.mealPlans, db.meals], async () => {
        await db.meals.where('meal_plan_id').equals(planId).delete()
        await db.mealPlans.delete(planId)
      })
    },

    deleteMeal: async (mealId: number) => {
      await db.meals.delete(mealId)
    },

    updateMealStatus: async (mealId: number, s: 'planned' | 'cooked' | 'skipped') => {
      await db.meals.update(mealId, { status: s, updated_at: now() })
    },

    getShoppingList: async (planId: number) => {
      const plan = await db.mealPlans.get(planId)
      if (!plan) throw new Error('献立プランが見つかりません')

      const meals = await db.meals.where('meal_plan_id').equals(planId).toArray()
      const allNames = new Set<string>()
      for (const meal of meals) {
        try {
          const ings: string[] = JSON.parse(meal.estimated_ingredients)
          ings.forEach(name => allNames.add(name))
        } catch { /* ignore */ }
      }

      const stockItems = await db.stockItems.toArray()
      const foods = await db.foods.toArray()
      const foodMap = new Map(foods.map(f => [f.id!, f]))
      const stockMap = new Map<string, { qty: number; unit: string }>()
      for (const item of stockItems) {
        const food = foodMap.get(item.food_id)
        if (!food) continue
        const key = food.name.toLowerCase()
        const existing = stockMap.get(key)
        if (!existing || item.quantity > existing.qty) {
          stockMap.set(key, { qty: item.quantity, unit: item.unit })
        }
      }

      const items = [...allNames].map(name => {
        const key = name.toLowerCase()
        const stock = stockMap.get(key)
        return {
          name,
          in_stock: !!stock && stock.qty > 0,
          stock_quantity: stock?.qty ?? null,
          stock_unit: stock?.unit ?? null,
        }
      })

      return { meal_plan_id: planId, items }
    },

    // ---- Recipes ----
    generateRecipe: async (mealId: number) => {
      const meal = await db.meals.get(mealId)
      if (!meal) throw new Error('献立が見つかりません')

      const concept = meal.concept ?? 'おまかせ料理'
      let ingredients: string[] = []
      try { ingredients = JSON.parse(meal.estimated_ingredients) } catch { /* ignore */ }

      // F-RECIPE-02: 同名レシピがあれば再利用してコスト節約
      const existing = await db.recipes.filter(r => r.name === concept).first()
      if (existing && existing.id !== undefined) {
        if (meal.recipe_id !== existing.id) {
          await db.recipes.update(existing.id, { reuse_count: existing.reuse_count + 1, updated_at: now() })
          await db.meals.update(mealId, { recipe_id: existing.id, updated_at: now() })
        }
        return toRecipe(existing as RecipeRecord & { id: number })
      }

      const result = await generateRecipeFromConcept(_apiKey, concept, ingredients)
      const t = now()
      const recipeId = await db.recipes.add({
        name: result.name,
        instructions_md: result.instructions_md,
        cook_time_min: result.cook_time_min,
        cost_estimate: result.cost_estimate,
        is_favorite: false,
        reuse_count: 0,
        created_at: t,
        updated_at: t,
      })
      if (result.ingredients?.length) {
        await db.recipeIngredients.bulkAdd(
          result.ingredients.map(i => ({
            recipe_id: recipeId as number,
            food_id: null,
            raw_name: i.raw_name,
            quantity: i.quantity,
            unit: i.unit,
            is_main: i.is_main,
            notes: null,
          }))
        )
      }
      await db.meals.update(mealId, { recipe_id: recipeId as number, updated_at: t })

      const recipe = await db.recipes.get(recipeId)
      return toRecipe(recipe as RecipeRecord & { id: number })
    },

    getRecipe: async (id: number) => {
      const recipe = await db.recipes.get(id)
      if (!recipe) throw new Error('レシピが見つかりません')
      return toRecipe(recipe as RecipeRecord & { id: number })
    },

    listRecipes: async (q?: string, _foodName?: string) => {
      let all = await db.recipes.toArray()
      if (q) {
        const lower = q.toLowerCase()
        all = all.filter(r => r.name.toLowerCase().includes(lower))
      }
      return Promise.all(all.map(r => toRecipe(r as RecipeRecord & { id: number })))
    },

    suggestRecipes: async (foodNames: string[], count = 1) => {
      const results = await generateSuggestedRecipes(_apiKey, foodNames, count)
      if (results.length === 0) throw new Error('レシピ提案に失敗しました')

      const t = now()
      const recipes = []
      for (const result of results) {
        const recipeId = await db.recipes.add({
          name: result.name,
          instructions_md: result.instructions_md,
          cook_time_min: result.cook_time_min,
          cost_estimate: result.cost_estimate,
          is_favorite: false,
          reuse_count: 0,
          created_at: t,
          updated_at: t,
        })
        if (result.ingredients?.length) {
          await db.recipeIngredients.bulkAdd(
            result.ingredients.map(i => ({
              recipe_id: recipeId as number,
              food_id: null,
              raw_name: i.raw_name,
              quantity: i.quantity,
              unit: i.unit,
              is_main: i.is_main,
              notes: null,
            }))
          )
        }
        const recipe = await db.recipes.get(recipeId)
        recipes.push(await toRecipe(recipe as RecipeRecord & { id: number }))
      }
      return recipes
    },

    // ---- Profile ----
    getProfile: async () => {
      let profile = await db.profile.get(1)
      if (!profile) {
        profile = {
          id: 1,
          family_composition: null,
          food_preferences: null,
          allergies: null,
          updated_at: now(),
        }
        await db.profile.put(profile)
      }
      return {
        family_composition: profile.family_composition,
        food_preferences: profile.food_preferences,
        allergies: profile.allergies,
        updated_at: profile.updated_at,
      }
    },

    updateProfile: async (p: {
      family_composition?: string | null
      food_preferences?: string | null
      allergies?: string | null
    }) => {
      const existing = await db.profile.get(1)
      const t = now()
      const updated = {
        id: 1,
        family_composition: 'family_composition' in p ? (p.family_composition ?? null) : (existing?.family_composition ?? null),
        food_preferences: 'food_preferences' in p ? (p.food_preferences ?? null) : (existing?.food_preferences ?? null),
        allergies: 'allergies' in p ? (p.allergies ?? null) : (existing?.allergies ?? null),
        updated_at: t,
      }
      await db.profile.put(updated)
      return {
        family_composition: updated.family_composition,
        food_preferences: updated.food_preferences,
        allergies: updated.allergies,
        updated_at: t,
      }
    },
  }
}
