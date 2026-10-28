import { getStaffLoginEmail, requireSupabase } from '../../frontend/services/supabase';
import type { Json } from '../types/database';

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
  threshold: number;
  lowStock: boolean;
  expiration: string | null;
  nearExpiry: boolean;
  minimumStock: number;
  type: string;
  unitName: string;
  receivedBatch: string;
  batchReference?: string;
  batches: { reference: string; receivedDate: string; expirationDate: string | null }[];
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
  if (!profile || !profile.active) {
    await client.auth.signOut();
    throw new Error('This account is inactive or has no profile. Contact the owner.');
  }

  let branch = 'All branches';
  if (profile.branch_id) {
    const { data: branchRecord, error: branchError } = await client
      .from('branches')
      .select('city, code')
      .eq('id', profile.branch_id)
      .maybeSingle();
    assertNoError(branchError);
    if (!branchRecord) throw new Error('The assigned branch is unavailable. Contact the owner.');
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

export async function signIn(loginIdentifier: string, password: string): Promise<AppUser> {
  const client = requireSupabase();
  const identifier = loginIdentifier.trim();
  const email = identifier.toLowerCase() === 'staff'
    ? getStaffLoginEmail()
    : identifier;
  const { error } = await client.auth.signInWithPassword({ email, password });
  assertNoError(error);
  const user = await getCurrentUser();
  if (!user) throw new Error('Supabase did not return an authenticated session.');
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

export async function loadInventory(branchId: string): Promise<InventoryItem[]> {
  const client = requireSupabase();
  const [inventoryResult, ingredientsResult, categoriesResult, batchesResult] = await Promise.all([
    client.from('inventory').select('branch_id, ingredient_id, quantity, minimum_stock, updated_at').eq('branch_id', branchId),
    client.from('ingredients').select('id, category_id, name, unit, active').eq('active', true).order('name'),
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

export async function loadOwnerInventory() {
  const branches = await loadBranches();
  const client = requireSupabase();
  const [inventoryResult, ingredientsResult, categoriesResult, batchesResult, transactionsResult, dailyChecksResult] = await Promise.all([
    client.from('inventory').select('branch_id, ingredient_id, quantity, minimum_stock, updated_at'),
    client.from('ingredients').select('id, category_id, name, unit, active').eq('active', true).order('name'),
    client.from('ingredient_categories').select('id, name'),
    client.from('ingredient_batches')
      .select('branch_id, ingredient_id, expiration_date, quantity_remaining')
      .gt('quantity_remaining', 0)
      .not('expiration_date', 'is', null)
      .order('expiration_date'),
    client.from('inventory_transactions')
      .select('id, reference, branch_id, ingredient_id, type, quantity, unit, transaction_date, reason')
      .order('transaction_date', { ascending: false })
      .limit(25),
    client.from('daily_stock_checks')
      .select('id, reference, branch_id, check_date, status, remarks')
      .order('created_at', { ascending: false })
      .limit(25),
  ]);
  assertNoError(inventoryResult.error);
  assertNoError(ingredientsResult.error);
  assertNoError(categoriesResult.error);
  assertNoError(batchesResult.error);
  assertNoError(transactionsResult.error);
  assertNoError(dailyChecksResult.error);
  return {
    branches,
    inventory: inventoryResult.data ?? [],
    ingredients: ingredientsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    batches: batchesResult.data ?? [],
    transactions: transactionsResult.data ?? [],
    dailyChecks: dailyChecksResult.data ?? [],
  };
}
