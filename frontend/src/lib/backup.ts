import { db } from './db'

export async function exportData(): Promise<void> {
  const [
    foods, stockItems, stockTransactions,
    mealPlans, meals, recipes, recipeIngredients, profile,
  ] = await Promise.all([
    db.foods.toArray(),
    db.stockItems.toArray(),
    db.stockTransactions.toArray(),
    db.mealPlans.toArray(),
    db.meals.toArray(),
    db.recipes.toArray(),
    db.recipeIngredients.toArray(),
    db.profile.toArray(),
  ])

  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    foods,
    stockItems,
    stockTransactions,
    mealPlans,
    meals,
    recipes,
    recipeIngredients,
    profile,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kitchen_backup_${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export interface ImportResult {
  foods: number
  stockItems: number
  recipes: number
  mealPlans: number
}

export async function importData(file: File): Promise<ImportResult> {
  const text = await file.text()
  const data = JSON.parse(text)

  if (!data.version || !Array.isArray(data.foods)) {
    throw new Error('無効なバックアップファイルです')
  }

  await db.transaction(
    'rw',
    [
      db.foods, db.stockItems, db.stockTransactions,
      db.mealPlans, db.meals, db.recipes, db.recipeIngredients, db.profile,
    ],
    async () => {
      await Promise.all([
        db.foods.clear(), db.stockItems.clear(), db.stockTransactions.clear(),
        db.mealPlans.clear(), db.meals.clear(), db.recipes.clear(),
        db.recipeIngredients.clear(), db.profile.clear(),
      ])

      if (data.foods?.length)             await db.foods.bulkPut(data.foods)
      if (data.stockItems?.length)        await db.stockItems.bulkPut(data.stockItems)
      if (data.stockTransactions?.length) await db.stockTransactions.bulkPut(data.stockTransactions)
      if (data.mealPlans?.length)         await db.mealPlans.bulkPut(data.mealPlans)
      if (data.meals?.length)             await db.meals.bulkPut(data.meals)
      if (data.recipes?.length)           await db.recipes.bulkPut(data.recipes)
      if (data.recipeIngredients?.length) await db.recipeIngredients.bulkPut(data.recipeIngredients)
      if (data.profile?.length)           await db.profile.bulkPut(data.profile)
    },
  )

  return {
    foods: data.foods?.length ?? 0,
    stockItems: data.stockItems?.length ?? 0,
    recipes: data.recipes?.length ?? 0,
    mealPlans: data.mealPlans?.length ?? 0,
  }
}
