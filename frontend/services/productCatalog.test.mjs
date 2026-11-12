import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStaffMenuProducts,
  createOwnerProduct,
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

  select() {
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
    if (failure?.(this.table, this.action, this.payload, this.filters)) {
      return { data: null, error: { message: 'injected database failure' } };
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
    [{ ...product, is_available: true }],
    variants,
    visible,
  );

  assert.deepEqual(catalog.map((item) => [item.name, item.sizeLabel, item.pieceCount, item.price, item.isAvailable]), [
    ['Takoyaki Special', '4 PCS', 4, 49, true],
    ['Takoyaki Special', '8 PCS', 8, 89, true],
    ['Takoyaki Special', '10+1 PCS', 11, 120, true],
  ]);
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
