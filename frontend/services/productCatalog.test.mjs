import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStaffMenuProducts,
  createOwnerProduct,
  isMissingMaxOrderQuantityColumn,
  parseCatalogPrice,
  standardProductVariants,
  updateOwnerProduct,
} from './productCatalog.ts';

class FakeSupabase {
  constructor() {
    this.tables = {
      products: [],
      product_variants: [],
      branch_product_visibility: [],
    };
    this.nextId = 1;
    this.fail = null;
  }

  from(table) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.action = 'select';
    this.payload = null;
    this.filters = [];
  }

  insert(payload) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  select(columns) {
    if (this.action === 'select') this.columns = columns ?? '*';
    return this;
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  single() {
    return this.execute(true);
  }

  maybeSingle() {
    return this.execute(true);
  }

  then(resolve, reject) {
    return this.execute(false).then(resolve, reject);
  }

  async execute(single) {
    const failure = this.client.fail;
    const injected = failure?.(this.table, this.action, this.payload, this.filters, this.columns);
    if (injected) {
      // A test may return its own error object (for example a PostgREST missing-column error).
      return { data: null, error: typeof injected === 'object' ? injected : { message: 'injected database failure' } };
    }

    const rows = this.client.tables[this.table];
    const matching = rows.filter((row) =>
      this.filters.every(([column, value]) => row[column] === value),
    );
    if (this.action === 'insert') {
      const inputs = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = inputs.map((input) => {
        const row = { ...input, id: input.id ?? `id-${this.client.nextId++}` };
        rows.push(row);
        if (this.table === 'product_variants') {
          for (const branchId of ['branch-a', 'branch-b']) {
            this.client.tables.branch_product_visibility.push({
              branch_id: branchId,
              product_variant_id: row.id,
              is_visible: row.is_available,
            });
          }
        }
        return row;
      });
      return { data: single ? created[0] : created, error: null };
    }
    if (this.action === 'update') {
      for (const row of matching) Object.assign(row, this.payload);
      return { data: single ? matching[0] ?? null : matching, error: null };
    }
    if (this.action === 'delete') {
      this.client.tables[this.table] = rows.filter((row) => !matching.includes(row));
      if (this.table === 'products') {
        const deletedIds = new Set(matching.map((row) => row.id));
        const variantIds = new Set(this.client.tables.product_variants
          .filter((variant) => deletedIds.has(variant.product_id))
          .map((variant) => variant.id));
        this.client.tables.product_variants = this.client.tables.product_variants
          .filter((variant) => !deletedIds.has(variant.product_id));
        this.client.tables.branch_product_visibility = this.client.tables.branch_product_visibility
          .filter((visibility) => !variantIds.has(visibility.product_variant_id));
      }
      return { data: single ? matching[0] ?? null : matching, error: null };
    }
    return { data: single ? matching[0] ?? null : matching, error: null };
  }
}

const prices = [49, 89, 120];
const productInput = {
  product_name: 'Takoyaki Special',
  description: 'Special filling',
  is_available: true,
  variants: standardProductVariants.map((variant, index) => ({
    ...variant,
    price: prices[index],
  })),
};

test('Owner product creation writes the product and standard POS variants with owner-set prices', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, productInput);

  assert.equal(product.price, 49);
  assert.equal(client.tables.products.length, 1);
  assert.deepEqual(client.tables.product_variants.map((variant) => ({
    variant_code: variant.variant_code,
    size_label: variant.size_label,
    piece_count: variant.piece_count,
    price: variant.price,
    active: variant.active,
    is_available: variant.is_available,
  })), standardProductVariants.map((variant, index) => ({
    ...variant,
    price: prices[index],
    active: true,
    is_available: true,
  })));
  assert.equal(client.tables.branch_product_visibility.length, 6);
  assert.ok(client.tables.branch_product_visibility.every((row) => row.is_visible));
});

test('Staff catalog gets current Owner names, variant labels, prices, and availability', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, productInput);
  const variants = client.tables.product_variants.map((variant) => ({
    ...variant,
    price: Number(variant.price),
  }));
  const visible = new Set(client.tables.branch_product_visibility
    .filter((row) => row.branch_id === 'branch-a' && row.is_visible)
    .map((row) => row.product_variant_id));
  const catalog = buildStaffMenuProducts(
    [{ ...product, category: 'Flavors', is_available: true }],
    variants,
    visible,
  );

  assert.deepEqual(catalog.map((item) => [item.name, item.sizeLabel, item.pieceCount, item.price, item.isAvailable]), [
    ['Takoyaki Special', '4 PCS', 4, 49, true],
    ['Takoyaki Special', '8 PCS', 8, 89, true],
    ['Takoyaki Special', '10+1 PCS', 11, 120, true],
  ]);
  assert.ok(catalog.every((item) => item.category === 'Flavors'));
});

test('product price edits update variant prices without overwriting branch or variant settings', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, productInput);
  const [regular, medium, large] = client.tables.product_variants;
  client.tables.product_variants[1].active = false;
  client.tables.branch_product_visibility[0].is_visible = false;

  const updated = await updateOwnerProduct(client, product.id, {
    product_name: 'Renamed Special',
    description: 'Updated description',
    is_available: false,
    variants: [
      { id: regular.id, price: 55 },
      { id: medium.id, price: 95 },
      { id: large.id, price: 130 },
    ],
  });

  assert.equal(updated.price, 55);
  assert.deepEqual(client.tables.product_variants.map((variant) => variant.price), [55, 95, 130]);
  assert.equal(client.tables.products[0].product_name, 'Renamed Special');
  assert.equal(client.tables.products[0].is_available, false);
  assert.equal(client.tables.product_variants[1].active, false);
  assert.equal(client.tables.branch_product_visibility[0].is_visible, false);
  const visibleVariantIds = new Set(client.tables.branch_product_visibility
    .filter((row) => row.branch_id === 'branch-b' && row.is_visible)
    .map((row) => row.product_variant_id));
  const staffProducts = buildStaffMenuProducts(
    [updated],
    client.tables.product_variants,
    visibleVariantIds,
  );
  assert.deepEqual(staffProducts.map((variant) => [variant.price, variant.isAvailable]), [
    [55, false],
    [130, false],
  ]);
});

test('unavailable, inactive, or branch-hidden menu variants cannot enter the Staff catalog', async () => {
  const products = [{ id: 'p1', product_name: 'Product', description: '', is_available: false }];
  const variants = [
    { id: 'v1', product_id: 'p1', size_label: '4 PCS', price: 49, piece_count: 4, active: true, is_available: true },
    { id: 'v2', product_id: 'p1', size_label: '8 PCS', price: 89, piece_count: 8, active: false, is_available: true },
    { id: 'v3', product_id: 'p1', size_label: '10+1 PCS', price: 120, piece_count: 11, active: true, is_available: false },
    { id: 'v4', product_id: 'p1', size_label: 'Branch hidden', price: 150, piece_count: 12, active: true, is_available: true },
  ];
  const catalog = buildStaffMenuProducts(products, variants, new Set(['v1', 'v2', 'v3']));

  assert.deepEqual(catalog.map((variant) => [variant.id, variant.isAvailable]), [
    ['v1', false],
    ['v3', false],
  ]);
});

test('Staff catalog rejects invalid prices instead of silently turning them into zero', () => {
  const products = [{ id: 'p1', product_name: 'Product', description: '', is_available: true }];
  const variant = { id: 'v1', product_id: 'p1', size_label: '4 PCS', piece_count: 4, active: true, is_available: true };

  assert.throws(
    () => buildStaffMenuProducts(products, [{ ...variant, price: null }], new Set(['v1'])),
    /invalid price/,
  );
  assert.throws(() => parseCatalogPrice('', 'Add-on sauce'), /invalid price/);
  assert.throws(() => parseCatalogPrice(Number.NaN, 'Add-on sauce'), /invalid price/);
  assert.equal(parseCatalogPrice('12.50', 'Add-on sauce'), 12.5);
});

test('failed variant creation removes the incomplete product and reports the failure', async () => {
  const client = new FakeSupabase();
  client.fail = (table, action) => table === 'product_variants' && action === 'insert';

  await assert.rejects(
    createOwnerProduct(client, productInput),
    /incomplete product was removed/,
  );
  assert.equal(client.tables.products.length, 0);
  assert.equal(client.tables.product_variants.length, 0);
});

test('failed product creation reports the write error without creating variants', async () => {
  const client = new FakeSupabase();
  client.fail = (table, action) => table === 'products' && action === 'insert';

  await assert.rejects(createOwnerProduct(client, productInput), /Unable to create the product/);
  assert.equal(client.tables.products.length, 0);
  assert.equal(client.tables.product_variants.length, 0);
});

test('failed variant price update rolls back earlier variant updates and does not report success', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, productInput);
  const [regular, medium, large] = client.tables.product_variants;
  let failed = false;
  client.fail = (table, action, payload, filters) => {
    if (
      !failed &&
      table === 'product_variants' &&
      action === 'update' &&
      payload?.price === 95 &&
      filters.some(([column, value]) => column === 'id' && value === medium.id)
    ) {
      failed = true;
      return true;
    }
    return false;
  };

  await assert.rejects(
    updateOwnerProduct(client, product.id, {
      product_name: 'Should not save',
      description: 'Should not save',
      is_available: false,
      variants: [
        { id: regular.id, price: 55 },
        { id: medium.id, price: 95 },
        { id: large.id, price: 130 },
      ],
    }),
    /injected database failure/,
  );
  assert.deepEqual(client.tables.product_variants.map((variant) => variant.price), prices);
  assert.equal(client.tables.products[0].product_name, productInput.product_name);
  assert.equal(client.tables.products[0].is_available, true);
});

test('failed product update rolls back variant prices', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, productInput);
  const [regular, medium, large] = client.tables.product_variants;
  client.fail = (table, action) => table === 'products' && action === 'update';

  await assert.rejects(
    updateOwnerProduct(client, product.id, {
      product_name: 'Should not save',
      description: 'Should not save',
      is_available: false,
      variants: [
        { id: regular.id, price: 55 },
        { id: medium.id, price: 95 },
        { id: large.id, price: 130 },
      ],
    }),
    /Unable to update the product/,
  );
  assert.deepEqual(client.tables.product_variants.map((variant) => variant.price), prices);
  assert.equal(client.tables.products[0].product_name, productInput.product_name);
});

test('Owner sets a maximum quantity per order for each size (OW-21 c4)', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, {
    ...productInput,
    variants: productInput.variants.map((variant, index) => ({ ...variant, max_order_quantity: index === 0 ? 10 : null })),
  });
  assert.deepEqual(client.tables.product_variants.map((variant) => variant.max_order_quantity), [10, undefined, undefined]);
  const [regular, medium, large] = client.tables.product_variants;

  await updateOwnerProduct(client, product.id, {
    ...productInput,
    variants: [
      { id: regular.id, price: 49, max_order_quantity: null },
      { id: medium.id, price: 89, max_order_quantity: 6 },
      { id: large.id, price: 120 },
    ],
  });
  assert.deepEqual(client.tables.product_variants.map((variant) => variant.max_order_quantity ?? null), [null, 6, null]);

  const staff = buildStaffMenuProducts(
    [{ ...product, category: 'Flavors' }],
    client.tables.product_variants,
    new Set(client.tables.product_variants.map((variant) => variant.id)),
  );
  assert.deepEqual(staff.map((variant) => variant.maxQuantity), [null, 6, null]);
});

test('a maximum quantity per order must be a whole number greater than zero (OW-21 c6)', async () => {
  for (const invalid of [0, -1, 2.5]) {
    await assert.rejects(
      createOwnerProduct(new FakeSupabase(), {
        ...productInput,
        variants: productInput.variants.map((variant) => ({ ...variant, max_order_quantity: invalid })),
      }),
      /whole number greater than zero/,
    );
  }
});

test('a failed product update also rolls back a changed maximum, including back to none', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, productInput);
  const [regular, medium, large] = client.tables.product_variants;
  client.fail = (table, action) => table === 'products' && action === 'update';
  await assert.rejects(
    updateOwnerProduct(client, product.id, {
      ...productInput,
      variants: [
        { id: regular.id, price: 49, max_order_quantity: 3 },
        { id: medium.id, price: 89 },
        { id: large.id, price: 120 },
      ],
    }),
    /Unable to update the product/,
  );
  assert.equal(client.tables.product_variants[0].max_order_quantity, null);
});

test('product edits still work before the maximum-quantity migration is applied', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, productInput);
  const [regular, medium, large] = client.tables.product_variants;
  const writes = [];
  client.fail = (table, action, payload, _filters, columns) => {
    if (table !== 'product_variants') return false;
    if (action === 'select' && /max_order_quantity/.test(columns ?? '')) {
      return { code: '42703', message: 'column product_variants.max_order_quantity does not exist' };
    }
    if (action === 'update') writes.push(payload);
    return false;
  };
  await updateOwnerProduct(client, product.id, {
    ...productInput,
    variants: [
      { id: regular.id, price: 55, max_order_quantity: 4 },
      { id: medium.id, price: 89 },
      { id: large.id, price: 120 },
    ],
  });
  assert.deepEqual(writes, [{ price: 55 }], 'only the price is written');
  assert.equal(client.tables.product_variants[0].price, 55);
});

test('missing-column detection only matches the maximum-quantity column', () => {
  assert.equal(isMissingMaxOrderQuantityColumn({ code: '42703', message: 'column product_variants.max_order_quantity does not exist' }), true);
  assert.equal(isMissingMaxOrderQuantityColumn({ code: 'PGRST204', message: "Could not find the 'max_order_quantity' column" }), true);
  assert.equal(isMissingMaxOrderQuantityColumn({ code: '42703', message: 'column products.category does not exist' }), false);
  assert.equal(isMissingMaxOrderQuantityColumn(null), false);
});

test('OW-21 c2, c6: flavor and portion type are saved; prices must be greater than zero', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, { ...productInput, flavor: 'Octobits', portion_type: 'Combo + Cheese' });
  assert.equal(client.tables.products[0].flavor, 'Octobits');
  assert.equal(client.tables.products[0].portion_type, 'Combo + Cheese');
  // OW-21 c7: the POS shows combos from the Combo category.
  assert.equal(client.tables.products[0].category, 'Combo');
  await assert.rejects(
    createOwnerProduct(new FakeSupabase(), { ...productInput, variants: productInput.variants.map((v, i) => (i === 1 ? { ...v, price: 0 } : v)) }),
    { message: 'The selling price for 8 PCS must be greater than zero.' },
  );
  await assert.rejects(createOwnerProduct(new FakeSupabase(), { ...productInput, flavor: ' ' }), { message: 'Enter the flavor.' });
  await assert.rejects(createOwnerProduct(new FakeSupabase(), { ...productInput, portion_type: 'Large' }), { message: 'Choose the portion type.' });
  const [regular, medium, large] = client.tables.product_variants;
  await assert.rejects(
    updateOwnerProduct(client, product.id, { ...productInput, variants: [{ id: regular.id, price: 0 }, { id: medium.id, price: 89 }, { id: large.id, price: 120 }] }),
    { message: 'The selling price for this size must be greater than zero.' },
  );
});

test('OW-21 c3: pieces per portion can be edited and must be a whole number greater than zero', async () => {
  const client = new FakeSupabase();
  const product = await createOwnerProduct(client, productInput);
  const [regular, medium, large] = client.tables.product_variants;
  await updateOwnerProduct(client, product.id, {
    ...productInput,
    variants: [{ id: regular.id, price: 49, piece_count: 5 }, { id: medium.id, price: 89 }, { id: large.id, price: 120 }],
  });
  assert.deepEqual(client.tables.product_variants.map((variant) => variant.piece_count), [5, 8, 11]);
  await assert.rejects(
    updateOwnerProduct(client, product.id, { ...productInput, variants: [{ id: regular.id, price: 49, piece_count: 0 }, { id: medium.id, price: 89 }, { id: large.id, price: 120 }] }),
    { message: 'The number of pieces per portion for this size must be a whole number greater than zero.' },
  );
});
