import { requireSupabase } from './supabase';
import type { Database, Json } from '../../backend/types/database';

export type AppUser = {
  id: string;
  role: 'Owner' | 'Staff';
  displayName: string;
  email: string;
  branchId: string | null;
  branch: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  quantityPrecision: number;
  expirationTracking: boolean;
  threshold: number;
  lowStock: boolean;
  expiration: string | null;
  nearExpiry: boolean;
  minimumStock: number;
  type: string;
  unitName: string;
  receivedBatch: string;
  batchReference?: string;
  batches: {
    reference: string;
    receivedDate: string;
    expirationDate: string | null;
    expirationDateIso: string | null;
    quantityRemaining: number;
  }[];
  lastUpdated: string;
  emoji: string;
  tint: string;
};

export type InventoryTransactionInput = {
  ingredientId: string;
  type: 'stock_in' | 'stock_out' | 'usage' | 'waste' | 'spoilage' | 'adjustment';
  quantity: number;
  transactionDate: string;
  reason?: string;
  notes?: string;
  batchReference?: string;
  expirationDate?: string | null;
};

export type TransactionHistoryItem = {
  id: string;
  reference: string;
  type: 'Stock-In' | 'Stock-Out / Usage' | 'Usage' | 'Waste' | 'Spoilage';
  ingredientId: string;
  ingredientName: string;
  category: string;
  quantity: number;
  unit: string;
  movement: number;
  branchId: string;
  branch: string;
  staffId: string;
  staff: string;
  transactionDate: Date;
  reason: string;
  notes: string;
  beforeQuantity: number;
  afterQuantity: number;
  batchReference: string | null;
};

export type OwnerSale = {
  id: string;
  transaction_reference: string;
  branch_id: string;
  total_amount: number;
  payment_method: string;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
};

export type OwnerSaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type OwnerSalesData = {
  sales: OwnerSale[];
  todaySales: OwnerSale[];
  previousSales: OwnerSale[];
  items: OwnerSaleItem[];
};

export type ProductMenuItem = {
  id: string;
  product_name: string;
  description: string;
  price: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
};

export type IngredientCategoryRecord = {
  id: string;
  name: string;
  created_at: string;
};

export type IngredientConfigurationRecord = {
  id: string;
  category_id: string;
  name: string;
  unit: string;
  quantity_precision: number;
  expiration_tracking: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeIngredientRecord = {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity_required: number;
  unit_of_measure: string;
};

const ingredientVisuals: Record<string, { emoji: string; tint: string; type: string }> = {
  octopus: { emoji: '🐙', tint: '#FCE9DE', type: 'Frozen seafood' },
  flour: { emoji: '🌾', tint: '#FFF1D8', type: 'Dry goods' },
  eggs: { emoji: '🥚', tint: '#FFF4D8', type: 'Fresh eggs' },
  sauces: { emoji: '🧴', tint: '#FBE7E9', type: 'Takoyaki sauce' },
  'japanese-mayonnaise': { emoji: '🥫', tint: '#FFF4D8', type: 'Japanese mayonnaise' },
  'bonito-flakes': { emoji: '🐟', tint: '#FFF1D8', type: 'Dried fish flakes' },
  'spring-onions': { emoji: '🌱', tint: '#E8F6EC', type: 'Fresh produce' },
  'cooking-oil': { emoji: '🫗', tint: '#FFF4D8', type: 'Cooking oil' },
};

function assertNoError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function makeRecordId(prefix: string, value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || prefix;
  return `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function assertUniqueNameError(error: { message: string; code?: string } | null, label: string): void {
  if (error?.code === '23505') throw new Error(`A ${label} with this name already exists.`);
  assertNoError(error);
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function branchLabel(city: string, code: string): string {
  const number = Number(code.replace(/\D/g, '')) || code;
  return `${city ? `${city} · ` : ''}Branch ${number}`;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const client = requireSupabase();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  assertNoError(sessionError);
  const session = sessionData.session;
  if (!session) return null;

  const { data: profile, error } = await client
    .from('profiles')
    .select('id, email, full_name, role, branch_id, active')
    .eq('id', session.user.id)
    .maybeSingle();
  assertNoError(error);
  if (!profile) {
    await client.auth.signOut();
    throw new Error('No TakoSync profile exists for this account. Ask the owner to provision it.');
  }
  if (!profile.active) {
    await client.auth.signOut();
    throw new Error('This account is inactive. Ask the owner to reactivate it.');
  }
  if (profile.role === 'staff' && !profile.branch_id) {
    await client.auth.signOut();
    throw new Error('This staff account has no assigned branch. Ask the owner to assign one.');
  }

  let branch = 'All branches';
  if (profile.branch_id) {
    const { data: branchRecord, error: branchError } = await client
      .from('branches')
      .select('city, code')
      .eq('id', profile.branch_id)
      .maybeSingle();
    assertNoError(branchError);
    if (!branchRecord) {
      await client.auth.signOut();
      throw new Error('The assigned branch is inactive or unavailable. Ask the owner to check the assignment.');
    }
    branch = branchLabel(branchRecord.city, branchRecord.code);
  }

  return {
    id: profile.id,
    role: profile.role === 'owner' ? 'Owner' : 'Staff',
    displayName: profile.full_name || session.user.user_metadata.full_name || profile.email,
    email: profile.email || session.user.email || '',
    branchId: profile.branch_id,
    branch,
  };
}

export async function signIn(
  email: string,
  password: string,
  expectedRole: AppUser['role'],
): Promise<AppUser> {
  const client = requireSupabase();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Enter the email address registered with Supabase.');
  const { error } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
  if (error) {
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      throw new Error('Email or password is incorrect.');
    }
    if (error.message.toLowerCase().includes('email not confirmed')) {
      throw new Error('Confirm this email address before signing in.');
    }
    throw new Error(error.message);
  }
  const user = await getCurrentUser();
  if (!user) throw new Error('Supabase did not return an authenticated session.');
  if (user.role !== expectedRole) {
    await client.auth.signOut();
    throw new Error(`This account does not have ${expectedRole} access.`);
  }
  return user;
}

export async function signOut(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut();
  assertNoError(error);
}

export async function loadBranches() {
  const { data, error } = await requireSupabase()
    .from('branches')
    .select('id, code, name, city, active')
    .eq('active', true)
    .order('code');
  assertNoError(error);
  return data ?? [];
}

export async function loadOwnerSalesData(input: {
  start: Date;
  end: Date;
  branchId: string | null;
  includePrevious?: boolean;
}): Promise<OwnerSalesData> {
  if (
    !Number.isFinite(input.start.getTime()) ||
    !Number.isFinite(input.end.getTime()) ||
    input.start >= input.end
  ) {
    throw new Error('Choose a valid sales reporting date range.');
  }

  const client = requireSupabase();
  const pageSize = 500;
  const fetchSales = async (start: Date, end: Date): Promise<OwnerSale[]> => {
    const sales: OwnerSale[] = [];
    for (let offset = 0; ; offset += pageSize) {
      let query = client.from('sales')
        .select('id, transaction_reference, branch_id, total_amount, payment_method, status, created_at')
        .eq('status', 'completed')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (input.branchId) query = query.eq('branch_id', input.branchId);
      const { data, error } = await query.range(offset, offset + pageSize - 1);
      assertNoError(error);
      sales.push(...(data ?? []));
      if ((data?.length ?? 0) < pageSize) break;
    }
    return sales;
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const rangeIncludesToday = input.start <= todayStart && input.end >= tomorrowStart;
  const durationDays = Math.max(1, Math.round((input.end.getTime() - input.start.getTime()) / 86_400_000));
  const previousEnd = new Date(input.start);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - durationDays);
  const [sales, todaySales, previousSales] = await Promise.all([
    fetchSales(input.start, input.end),
    rangeIncludesToday ? Promise.resolve(null) : fetchSales(todayStart, tomorrowStart),
    input.includePrevious ? fetchSales(previousStart, previousEnd) : Promise.resolve([]),
  ]);
  const currentDaySales = todaySales ?? sales.filter((sale) => {
    const createdAt = new Date(sale.created_at).getTime();
    return createdAt >= todayStart.getTime() && createdAt < tomorrowStart.getTime();
  });

  const saleItems: OwnerSalesData['items'] = [];
  const productNames = new Map<string, string>();
  const saleIds = sales.map((sale) => sale.id);
  for (let saleOffset = 0; saleOffset < saleIds.length; saleOffset += pageSize) {
    const saleIdBatch = saleIds.slice(saleOffset, saleOffset + pageSize);
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await client.from('sale_items')
        .select('id, sale_id, product_id, quantity, unit_price, subtotal')
        .in('sale_id', saleIdBatch)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      assertNoError(error);
      saleItems.push(...(data ?? []).map((item) => ({
        ...item,
        product_name: '',
      })));
      if ((data?.length ?? 0) < pageSize) break;
    }
  }

  const productIds = [...new Set(saleItems.map((item) => item.product_id))];
  for (let offset = 0; offset < productIds.length; offset += pageSize) {
    const { data, error } = await client.from('products')
      .select('id, product_name')
      .in('id', productIds.slice(offset, offset + pageSize));
    assertNoError(error);
    for (const product of data ?? []) productNames.set(product.id, product.product_name);
  }

  return {
    sales,
    todaySales: currentDaySales,
    previousSales,
    items: saleItems.map((item) => ({
      ...item,
      product_name: productNames.get(item.product_id) ?? 'Product unavailable',
    })),
  };
}

export async function loadInventory(branchId: string): Promise<InventoryItem[]> {
  const client = requireSupabase();
  const [inventoryResult, ingredientsResult, categoriesResult, batchesResult] = await Promise.all([
    client.from('inventory').select('branch_id, ingredient_id, quantity, minimum_stock, updated_at').eq('branch_id', branchId),
    client.from('ingredients')
      .select('id, category_id, name, unit, quantity_precision, expiration_tracking, active')
      .eq('active', true)
      .order('name'),
    client.from('ingredient_categories').select('id, name'),
    client.from('ingredient_batches')
      .select('ingredient_id, batch_reference, received_date, expiration_date, quantity_remaining')
      .eq('branch_id', branchId)
      .gt('quantity_remaining', 0)
      .order('expiration_date', { ascending: true, nullsFirst: false }),
  ]);
  assertNoError(inventoryResult.error);
  assertNoError(ingredientsResult.error);
  assertNoError(categoriesResult.error);
  assertNoError(batchesResult.error);

  const inventory = new Map((inventoryResult.data ?? []).map((row) => [row.ingredient_id, row]));
  const categories = new Map((categoriesResult.data ?? []).map((row) => [row.id, row.name]));
  const batches = new Map<string, NonNullable<typeof batchesResult.data>>();
  for (const batch of batchesResult.data ?? []) {
    batches.set(batch.ingredient_id, [...(batches.get(batch.ingredient_id) ?? []), batch]);
  }

  return (ingredientsResult.data ?? []).map((ingredient) => {
    const stock = inventory.get(ingredient.id);
    const itemBatches = batches.get(ingredient.id) ?? [];
    const nextBatch = itemBatches.find((batch) => batch.expiration_date);
    const expirationDate = nextBatch?.expiration_date ?? null;
    const expirationTime = expirationDate ? new Date(`${expirationDate}T00:00:00`).getTime() : null;
    const daysUntilExpiration = expirationTime === null
      ? null
      : Math.ceil((expirationTime - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    const minimumStock = Number(stock?.minimum_stock ?? 0);
    const quantity = Number(stock?.quantity ?? 0);
    const visual = ingredientVisuals[ingredient.id] ?? { emoji: '📦', tint: '#F2F2F4', type: categories.get(ingredient.category_id) ?? 'Ingredient' };
    const formattedExpiration = formatDate(expirationDate);
    const firstBatch = itemBatches[0];
    return {
      id: ingredient.id,
      name: ingredient.name,
      category: categories.get(ingredient.category_id) ?? 'Other',
      quantity,
      unit: ingredient.unit,
      quantityPrecision: ingredient.quantity_precision,
      expirationTracking: ingredient.expiration_tracking,
      threshold: minimumStock,
      lowStock: quantity <= 0 || (minimumStock > 0 && quantity <= minimumStock),
      expiration: formattedExpiration,
      nearExpiry: daysUntilExpiration !== null && daysUntilExpiration <= 7,
      minimumStock,
      type: visual.type,
      unitName: ingredient.unit === 'kg'
        ? 'Kilograms (kg)'
        : ingredient.unit === 'pcs'
          ? 'Pieces (pcs)'
          : ingredient.unit === 'L'
            ? 'Liters (L)'
            : `${ingredient.unit} (${ingredient.unit})`,
      receivedBatch: firstBatch
        ? `${firstBatch.batch_reference} · ${formatDate(firstBatch.received_date)}`
        : 'No active batch',
      batchReference: firstBatch?.batch_reference,
      batches: itemBatches.map((batch) => ({
        reference: batch.batch_reference,
        receivedDate: formatDate(batch.received_date) ?? '',
        expirationDate: formatDate(batch.expiration_date),
        expirationDateIso: batch.expiration_date,
        quantityRemaining: Number(batch.quantity_remaining),
      })),
      lastUpdated: stock ? new Date(stock.updated_at).toLocaleString('en-GB') : 'Not yet stocked',
      emoji: visual.emoji,
      tint: visual.tint,
    };
  });
}

export async function recordInventoryTransactions(branchId: string, transactions: InventoryTransactionInput[]) {
  const payload: Json = transactions.map((item) => ({
    ingredient_id: item.ingredientId,
    type: item.type,
    quantity: item.quantity,
    transaction_date: item.transactionDate,
    reason: item.reason ?? '',
    notes: item.notes ?? '',
    batch_reference: item.batchReference ?? null,
    expiration_date: item.expirationDate ?? null,
  }));
  const { data, error } = await requireSupabase().rpc('record_inventory_transactions', {
    p_branch_id: branchId,
    p_transactions: payload,
  });
  assertNoError(error);
  if (!data || data.length !== transactions.length) {
    throw new Error('The saved inventory transaction response was incomplete.');
  }
  return data;
}

export async function submitDailyStockCheck(input: {
  branchId: string;
  checkDate: string;
  remarks: string;
  lines: { ingredientId: string; recordedQuantity: number; physicalQuantity: number; unit: string }[];
}) {
  const payload: Json = input.lines.map((line) => ({
    ingredient_id: line.ingredientId,
    recorded_quantity: line.recordedQuantity,
    physical_quantity: line.physicalQuantity,
    unit: line.unit,
  }));
  const { data, error } = await requireSupabase().rpc('submit_daily_stock_check', {
    p_branch_id: input.branchId,
    p_check_date: input.checkDate,
    p_remarks: input.remarks,
    p_lines: payload,
  });
  assertNoError(error);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The saved daily check returned an invalid receipt.');
  }
  const receipt = data as Record<string, Json>;
  if (
    typeof receipt.id !== 'string' ||
    typeof receipt.reference !== 'string' ||
    (receipt.status !== 'submitted' && receipt.status !== 'pending_owner_review')
  ) {
    throw new Error('The saved daily check returned an incomplete receipt.');
  }
  if (!Array.isArray(receipt.lines)) {
    throw new Error('The saved daily check returned no count-line details.');
  }
  const lines = receipt.lines.map((value) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof value.ingredient_id !== 'string' ||
      typeof value.recorded_quantity !== 'number' ||
      typeof value.physical_quantity !== 'number' ||
      typeof value.difference !== 'number' ||
      typeof value.unit !== 'string'
    ) {
      throw new Error('The saved daily check returned invalid count-line details.');
    }
    return {
      ingredientId: value.ingredient_id,
      recordedQuantity: value.recorded_quantity,
      physicalQuantity: value.physical_quantity,
      difference: value.difference,
      unit: value.unit,
    };
  });
  return {
    id: receipt.id,
    reference: receipt.reference,
    status: receipt.status,
    counted: typeof receipt.counted === 'number' ? receipt.counted : lines.length,
    discrepancies: typeof receipt.discrepancies === 'number' ? receipt.discrepancies : 0,
    checkDate: typeof receipt.check_date === 'string' ? receipt.check_date : input.checkDate,
    lines,
  };
}

export async function loadTransactionHistory(branchId: string): Promise<TransactionHistoryItem[]> {
  const client = requireSupabase();
  const [ingredientsResult, categoriesResult, batchesResult, profilesResult, branchResult] = await Promise.all([
    client.from('ingredients').select('id, name, category_id'),
    client.from('ingredient_categories').select('id, name'),
    client.from('ingredient_batches').select('id, batch_reference'),
    client.from('profiles').select('id, full_name'),
    client.from('branches').select('city, code').eq('id', branchId).maybeSingle(),
  ]);
  assertNoError(ingredientsResult.error);
  assertNoError(categoriesResult.error);
  assertNoError(batchesResult.error);
  assertNoError(profilesResult.error);
  assertNoError(branchResult.error);
  if (!branchResult.data) throw new Error('The assigned branch is unavailable.');

  const transactions: NonNullable<Awaited<ReturnType<typeof fetchTransactionPage>>> = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchTransactionPage(client, branchId, offset, pageSize);
    transactions.push(...page);
    if (page.length < pageSize) break;
  }

  const ingredients = new Map((ingredientsResult.data ?? []).map((row) => [row.id, row]));
  const categories = new Map((categoriesResult.data ?? []).map((row) => [row.id, row.name]));
  const profiles = new Map((profilesResult.data ?? []).map((row) => [row.id, row.full_name]));
  const batches = new Map((batchesResult.data ?? []).map((row) => [row.id, row.batch_reference]));
  const typeNames: Record<string, TransactionHistoryItem['type']> = {
    stock_in: 'Stock-In',
    stock_out: 'Stock-Out / Usage',
    usage: 'Usage',
    waste: 'Waste',
    spoilage: 'Spoilage',
    adjustment: 'Stock-Out / Usage',
  };
  const branch = branchLabel(branchResult.data.city, branchResult.data.code);
  return transactions.flatMap((row) => {
    const ingredient = ingredients.get(row.ingredient_id);
    if (!ingredient) return [];
    return {
      id: row.id,
      reference: row.reference,
      type: typeNames[row.type],
      ingredientId: row.ingredient_id,
      ingredientName: ingredient.name,
      category: categories.get(ingredient.category_id) ?? 'Other',
      quantity: Number(row.quantity),
      unit: row.unit,
      movement: Number(row.movement),
      branchId: row.branch_id,
      branch,
      staffId: row.actor_id,
      staff: profiles.get(row.actor_id) ?? 'Unknown user',
      transactionDate: new Date(row.transaction_date),
      reason: row.reason,
      notes: row.notes,
      beforeQuantity: Number(row.before_quantity),
      afterQuantity: Number(row.after_quantity),
      batchReference: row.batch_id ? batches.get(row.batch_id) ?? null : null,
    };
  });
}

async function fetchTransactionPage(
  client: ReturnType<typeof requireSupabase>,
  branchId: string,
  offset: number,
  pageSize: number,
) {
  const { data, error } = await client.from('inventory_transactions')
    .select('id, reference, branch_id, ingredient_id, actor_id, type, quantity, unit, movement, before_quantity, after_quantity, transaction_date, reason, notes, batch_id')
    .eq('branch_id', branchId)
    .order('transaction_date', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + pageSize - 1);
  assertNoError(error);
  return data ?? [];
}

export async function loadProducts(): Promise<ProductMenuItem[]> {
  const { data, error } = await requireSupabase()
    .from('products')
    .select('id, product_name, description, price, is_available, created_at, updated_at')
    .order('product_name', { ascending: true });
  assertNoError(error);
  return (data ?? []).map((row) => ({
    ...row,
    price: Number(row.price),
  }));
}

export async function loadIngredientRecipeConfiguration(): Promise<{
  ingredients: IngredientConfigurationRecord[];
  categories: IngredientCategoryRecord[];
  recipeIngredients: RecipeIngredientRecord[];
}> {
  const client = requireSupabase();
  const [ingredientsResult, categoriesResult, recipesResult] = await Promise.all([
    client.from('ingredients')
      .select('id, category_id, name, unit, quantity_precision, expiration_tracking, active, created_at, updated_at')
      .order('name', { ascending: true }),
    client.from('ingredient_categories')
      .select('id, name, created_at')
      .order('name', { ascending: true }),
    client.from('recipes')
      .select('id, product_id, ingredient_id, quantity_required, unit_of_measure')
      .order('product_id', { ascending: true }),
  ]);
  assertNoError(ingredientsResult.error);
  assertNoError(categoriesResult.error);
  assertNoError(recipesResult.error);
  return {
    ingredients: ingredientsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    recipeIngredients: (recipesResult.data ?? []).map((line) => ({
      ...line,
      quantity_required: Number(line.quantity_required),
    })),
  };
}

export async function createIngredientCategory(name: string): Promise<IngredientCategoryRecord> {
  const categoryName = name.trim();
  if (!categoryName) throw new Error('Category name is required.');

  const client = requireSupabase();
  const { data: existingCategories, error: existingError } = await client
    .from('ingredient_categories')
    .select('id, name, created_at');
  assertNoError(existingError);
  const existing = (existingCategories ?? []).find((category) =>
    category.name.trim().toLocaleLowerCase() === categoryName.toLocaleLowerCase(),
  );
  if (existing) return existing;

  const { data, error } = await client
    .from('ingredient_categories')
    .insert({ id: makeRecordId('category', categoryName), name: categoryName })
    .select('id, name, created_at')
    .single();
  assertUniqueNameError(error, 'category');
  if (!data) throw new Error('The ingredient category could not be created.');
  return data;
}

export async function createIngredient(input: {
  name: string;
  category_id: string;
  unit: string;
}): Promise<IngredientConfigurationRecord> {
  const name = input.name.trim();
  if (!name) throw new Error('Ingredient name is required.');
  if (!input.category_id) throw new Error('Choose an ingredient category.');
  if (!input.unit.trim()) throw new Error('Choose a unit of measurement.');

  const { data, error } = await requireSupabase()
    .from('ingredients')
    .insert({
      id: makeRecordId('ingredient', name),
      name,
      category_id: input.category_id,
      unit: input.unit,
      quantity_precision: input.unit === 'pcs' || input.unit === 'g' ? 0 : 2,
      expiration_tracking: false,
      active: true,
    })
    .select('id, category_id, name, unit, quantity_precision, expiration_tracking, active, created_at, updated_at')
    .single();
  assertUniqueNameError(error, 'ingredient');
  if (!data) throw new Error('The ingredient could not be created.');
  return data;
}

export async function updateIngredient(
  ingredientId: string,
  updates: { name: string; category_id: string; unit: string },
): Promise<IngredientConfigurationRecord> {
  const name = updates.name.trim();
  if (!ingredientId) throw new Error('The ingredient to update is missing.');
  if (!name) throw new Error('Ingredient name is required.');
  if (!updates.category_id) throw new Error('Choose an ingredient category.');
  if (!updates.unit.trim()) throw new Error('Choose a unit of measurement.');

  const { data, error } = await requireSupabase()
    .from('ingredients')
    .update({ name, category_id: updates.category_id, unit: updates.unit })
    .eq('id', ingredientId)
    .select('id, category_id, name, unit, quantity_precision, expiration_tracking, active, created_at, updated_at')
    .single();
  assertUniqueNameError(error, 'ingredient');
  if (!data) throw new Error('The ingredient could not be updated.');
  return data;
}

export async function saveProductRecipe(
  productId: string,
  lines: { ingredient_id: string; quantity_required: number; unit_of_measure: string }[],
): Promise<RecipeIngredientRecord[]> {
  if (!productId) throw new Error('Choose a menu product.');
  const ingredientIds = new Set<string>();
  for (const line of lines) {
    if (!line.ingredient_id) throw new Error('Choose an ingredient for every recipe entry.');
    if (!Number.isFinite(line.quantity_required) || line.quantity_required <= 0) {
      throw new Error('Every recipe quantity must be greater than zero.');
    }
    if (!line.unit_of_measure.trim()) throw new Error('Every recipe entry must have a unit of measurement.');
    if (ingredientIds.has(line.ingredient_id)) {
      throw new Error('An ingredient can only appear once in a recipe.');
    }
    ingredientIds.add(line.ingredient_id);
  }

  const client = requireSupabase();
  const { data: currentLines, error: loadError } = await client
    .from('recipes')
    .select('id, ingredient_id')
    .eq('product_id', productId);
  assertNoError(loadError);

  if (lines.length) {
    const { error } = await client
      .from('recipes')
      .upsert(
        lines.map((line) => ({
          product_id: productId,
          ingredient_id: line.ingredient_id,
          quantity_required: line.quantity_required,
          unit_of_measure: line.unit_of_measure,
        })),
        { onConflict: 'product_id,ingredient_id' },
      );
    assertNoError(error);
  }

  const removedIds = (currentLines ?? [])
    .filter((line) => !ingredientIds.has(line.ingredient_id))
    .map((line) => line.id);
  if (removedIds.length) {
    const { error } = await client
      .from('recipes')
      .delete()
      .eq('product_id', productId)
      .in('id', removedIds);
    assertNoError(error);
  }

  const { data, error } = await client
    .from('recipes')
    .select('id, product_id, ingredient_id, quantity_required, unit_of_measure')
    .eq('product_id', productId)
    .order('ingredient_id', { ascending: true });
  assertNoError(error);
  return (data ?? []).map((line) => ({
    ...line,
    quantity_required: Number(line.quantity_required),
  }));
}

export async function createProduct(input: {
  product_name: string;
  description: string;
  price: number;
  is_available: boolean;
}): Promise<ProductMenuItem> {
  const productName = input.product_name.trim();
  const description = input.description.trim();
  const price = Number(input.price);
  if (!productName) throw new Error('Product name is required.');
  if (!Number.isFinite(price) || price < 0) throw new Error('Selling price must be a valid number greater than or equal to zero.');

  const { data, error } = await requireSupabase()
    .from('products')
    .insert({
      product_name: productName,
      description,
      price,
      is_available: Boolean(input.is_available),
    })
    .select('id, product_name, description, price, is_available, created_at, updated_at')
    .single();
  assertNoError(error);
  if (!data) throw new Error('The product could not be created.');
  return { ...data, price: Number(data.price) };
}

export async function updateProduct(
  productId: string,
  updates: Partial<{ product_name: string; description: string; price: number; is_available: boolean }>,
): Promise<ProductMenuItem> {
  const payload: Record<string, unknown> = {};
  if ('product_name' in updates && typeof updates.product_name === 'string') {
    const productName = updates.product_name.trim();
    if (!productName) throw new Error('Product name is required.');
    payload.product_name = productName;
  }
  if ('description' in updates) payload.description = (updates.description ?? '').trim();
  if ('price' in updates) {
    const price = Number(updates.price);
    if (!Number.isFinite(price) || price < 0) throw new Error('Selling price must be a valid number greater than or equal to zero.');
    payload.price = price;
  }
  if ('is_available' in updates) payload.is_available = Boolean(updates.is_available);

  const updatePayload: {
    product_name?: string;
    description?: string;
    price?: number;
    is_available?: boolean;
  } = payload;

  const { data, error } = await requireSupabase()
    .from('products')
    .update(updatePayload)
    .eq('id', productId)
    .select('id, product_name, description, price, is_available, created_at, updated_at')
    .single();
  assertNoError(error);
  if (!data) throw new Error('The product could not be updated.');
  return { ...data, price: Number(data.price) };
}

export async function loadOwnerInventory() {
  const branches = await loadBranches();
  const client = requireSupabase();
  const pageSize = 500;
  const [inventoryResult, ingredientsResult, categoriesResult, batchesResult] = await Promise.all([
    client.from('inventory').select('branch_id, ingredient_id, quantity, minimum_stock, updated_at'),
    client.from('ingredients').select('id, category_id, name, unit, expiration_tracking, active').eq('active', true).order('name'),
    client.from('ingredient_categories').select('id, name'),
    client.from('ingredient_batches')
      .select('id, branch_id, ingredient_id, batch_reference, expiration_date, quantity_remaining')
      .gt('quantity_remaining', 0)
      .not('expiration_date', 'is', null)
      .order('expiration_date')
      .order('id', { ascending: false })
      .range(0, pageSize - 1),
  ]);
  assertNoError(inventoryResult.error);
  assertNoError(ingredientsResult.error);
  assertNoError(categoriesResult.error);
  assertNoError(batchesResult.error);

  const batches = [...(batchesResult.data ?? [])];
  for (let offset = pageSize; (batchesResult.data?.length ?? 0) === pageSize; offset += pageSize) {
    const { data, error } = await client.from('ingredient_batches')
      .select('id, branch_id, ingredient_id, batch_reference, expiration_date, quantity_remaining')
      .gt('quantity_remaining', 0)
      .not('expiration_date', 'is', null)
      .order('expiration_date')
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    assertNoError(error);
    batches.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }

  return {
    branches,
    inventory: inventoryResult.data ?? [],
    ingredients: ingredientsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    batches,
  };
}

export async function loadOwnerActivityData(input: {
  start: Date;
  end: Date;
  branchId: string | null;
}) {
  if (
    !Number.isFinite(input.start.getTime()) ||
    !Number.isFinite(input.end.getTime()) ||
    input.start >= input.end
  ) {
    throw new Error('Choose a valid activity reporting date range.');
  }

  const client = requireSupabase();
  const pageSize = 500;
  const transactionQuery = (offset: number) => {
    let query = client.from('inventory_transactions')
      .select('id, reference, branch_id, ingredient_id, type, quantity, unit, transaction_date')
      .gte('transaction_date', input.start.toISOString())
      .lt('transaction_date', input.end.toISOString())
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false });
    if (input.branchId) query = query.eq('branch_id', input.branchId);
    return query.range(offset, offset + pageSize - 1);
  };
  const transactions: {
    id: string;
    reference: string;
    branch_id: string;
    ingredient_id: string;
    type: Database['public']['Enums']['inventory_transaction_type'];
    quantity: number;
    unit: string;
    transaction_date: string;
  }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await transactionQuery(offset);
    assertNoError(error);
    transactions.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }

  const auditLogs: Database['public']['Tables']['audit_logs']['Row'][] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from('audit_logs')
      .select('id, user_id, branch_id, action, description, created_at')
      .gte('created_at', input.start.toISOString())
      .lt('created_at', input.end.toISOString())
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (input.branchId) query = query.eq('branch_id', input.branchId);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    assertNoError(error);
    auditLogs.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }

  type OwnerDailyCheck = {
    id: string;
    reference: string;
    branch_id: string;
    check_date: string;
    status: string;
    remarks: string;
    created_at: string;
  };
  const loadCheckPage = async (offset: number, pendingOnly: boolean) => {
    let query = client.from('daily_stock_checks')
      .select('id, reference, branch_id, check_date, status, remarks, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (pendingOnly) query = query.eq('status', 'pending_owner_review');
    else query = query.gte('created_at', input.start.toISOString()).lt('created_at', input.end.toISOString());
    if (input.branchId) query = query.eq('branch_id', input.branchId);
    const result = await query.range(offset, offset + pageSize - 1);
    assertNoError(result.error);
    return result.data ?? [];
  };
  const [recentFirstPage, pendingFirstPage] = await Promise.all([
    loadCheckPage(0, false),
    loadCheckPage(0, true),
  ]);
  const recentChecks: OwnerDailyCheck[] = [...recentFirstPage];
  const pendingChecks: OwnerDailyCheck[] = [...pendingFirstPage];
  if (recentFirstPage.length === pageSize) {
    for (let offset = pageSize; ; offset += pageSize) {
      const page = await loadCheckPage(offset, false);
      recentChecks.push(...page);
      if (page.length < pageSize) break;
    }
  }
  if (pendingFirstPage.length === pageSize) {
    for (let offset = pageSize; ; offset += pageSize) {
      const page = await loadCheckPage(offset, true);
      pendingChecks.push(...page);
      if (page.length < pageSize) break;
    }
  }
  const checksById = new Map([...recentChecks, ...pendingChecks].map((check) => [check.id, check]));
  const dailyChecks = [...checksById.values()];
  const countLines: {
    daily_stock_check_id: string;
    ingredient_id: string;
    recorded_quantity: number;
    physical_quantity: number;
    difference: number;
    unit: string;
  }[] = [];
  for (let index = 0; index < dailyChecks.length; index += 10) {
    const { data, error } = await client.from('daily_stock_count_lines')
      .select('daily_stock_check_id, ingredient_id, recorded_quantity, physical_quantity, difference, unit')
      .in('daily_stock_check_id', dailyChecks.slice(index, index + 10).map((check) => check.id));
    assertNoError(error);
    countLines.push(...(data ?? []));
  }

  return { transactions, dailyChecks, countLines, auditLogs };
}
