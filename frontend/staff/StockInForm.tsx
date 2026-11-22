import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { recordStockIn } from '../services/takosync';
import {
  STOCK_IN_MAX_LINES,
  STOCK_IN_SUPPLIER_MAX_LENGTH,
  purchaseUnitOf,
  stockInBaseQuantity,
  stockInLineQuantityLabel,
  validateStockIn,
  type StockInHeaderDraft,
  type StockInIngredient,
  type StockInLineDraft,
  type StockInReceipt,
  type StockInValidation,
} from '../services/stockIn';

const font = { regular: 'Poppins_400Regular', medium: 'Poppins_500Medium', semibold: 'Poppins_600SemiBold' } as const;

/** The workspace's own date field, passed in so every staff form shares one date picker. */
export type StockInDateField = React.ComponentType<{
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  error?: string;
  allowClear?: boolean;
  maxDate?: Date;
}>;

function toIso(date: Date | null): string {
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function displayDate(value: string | null): string {
  const date = value ? fromIso(value) : null;
  return date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function trimNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.secondaryText }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

let lineCounter = 0;
function newLine(): StockInLineDraft {
  lineCounter += 1;
  return { key: `line-${lineCounter}`, ingredientId: '', quantity: '', unit: 'base', expirationDate: '' };
}

/**
 * ST-09: Stock-In with a header (optional supplier or reference, date
 * purchased, date received) and one or more lines (ingredient from a searchable
 * list, quantity received, unit of measurement, expiration date). Saving asks
 * for a confirmation, shows the saved receipt, and is safe to retry.
 */
export default function StockInForm({
  branchId,
  branchLabel,
  today,
  ingredients,
  DateField,
  onBack,
  onSaved,
}: {
  branchId: string;
  branchLabel: string;
  /** The current business date. */
  today: Date;
  ingredients: StockInIngredient[];
  DateField: StockInDateField;
  onBack: () => void;
  /** Called after a save so the workspace reloads stock and alerts. */
  onSaved: (receipt: StockInReceipt) => void | Promise<void>;
}) {
  const { colors } = useTheme();
  const todayIso = toIso(today);
  const [header, setHeader] = useState<StockInHeaderDraft>({ supplierReference: '', datePurchased: todayIso, dateReceived: todayIso });
  const [lines, setLines] = useState<StockInLineDraft[]>(() => [newLine()]);
  const [validation, setValidation] = useState<StockInValidation | null>(null);
  const [pickerLine, setPickerLine] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [receipt, setReceipt] = useState<StockInReceipt | null>(null);
  // One request id per form fill: a retry or double tap returns the same receipt (c10).
  const requestId = useRef(crypto.randomUUID());
  const submitLock = useRef(false);

  const byId = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients]);
  const usedIds = new Set(lines.map((line) => line.ingredientId).filter(Boolean));
  const pickerItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ingredients
      .filter((item) => term === '' || `${item.name} ${item.category}`.toLowerCase().includes(term))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [ingredients, search]);

  const revalidate = (nextHeader: StockInHeaderDraft, nextLines: StockInLineDraft[]) => {
    if (validation) setValidation(validateStockIn(nextHeader, nextLines, ingredients, todayIso));
  };
  const changeHeader = (patch: Partial<StockInHeaderDraft>) => {
    const next = { ...header, ...patch };
    setHeader(next);
    setSubmitError('');
    revalidate(next, lines);
  };
  const changeLine = (key: string, patch: Partial<StockInLineDraft>) => {
    const next = lines.map((line) => (line.key === key ? { ...line, ...patch } : line));
    setLines(next);
    setSubmitError('');
    revalidate(header, next);
  };
  const removeLine = (key: string) => {
    const next = lines.filter((line) => line.key !== key);
    setLines(next);
    revalidate(header, next);
  };

  const review = () => {
    const result = validateStockIn(header, lines, ingredients, todayIso);
    setValidation(result);
    setSubmitError('');
    if (result.valid) setConfirming(true);
  };

  const submit = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const saved = await recordStockIn({ branchId, requestId: requestId.current, header, lines });
      setReceipt(saved);
      setConfirming(false);
      await onSaved(saved);
    } catch (error: unknown) {
      setConfirming(false);
      setSubmitError(error instanceof Error ? error.message : 'Unable to save the Stock-In. Please try again.');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const startAnother = () => {
    requestId.current = crypto.randomUUID();
    setHeader({ supplierReference: '', datePurchased: todayIso, dateReceived: todayIso });
    setLines([newLine()]);
    setValidation(null);
    setSubmitError('');
    setReceipt(null);
  };

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const inputStyle = (error?: string) => [
    styles.input,
    { color: colors.text, borderColor: error ? colors.error : colors.border, backgroundColor: colors.background },
  ];

  if (receipt) {
    return (
      <View style={styles.screen}>
        <View style={styles.headerBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Stocks" onPress={onBack} style={styles.back}>
            <Text style={[styles.backGlyph, { color: colors.text }]}>‹</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Stock-In</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={card}>
            <Text style={[styles.success, { color: colors.text }]} accessibilityRole="alert">✓ Stock-In saved successfully.</Text>
            <Text style={[styles.copy, { color: colors.secondaryText }]}>
              {receipt.reference} · {branchLabel} · Expected stock and alerts are updated.
            </Text>
            <Row label="Supplier / Reference" value={receipt.supplierReference ?? '—'} />
            <Row label="Date Purchased" value={displayDate(receipt.datePurchased)} />
            <Row label="Date Received" value={displayDate(receipt.dateReceived)} />
          </View>
          {receipt.lines.map((line) => (
            <View key={line.lineIndex} style={card}>
              <Text style={[styles.lineTitle, { color: colors.text }]}>{line.ingredientName}</Text>
              <Row label="Quantity received" value={`+${stockInLineQuantityLabel(line)}`} />
              <Row label="Expected quantity" value={`${trimNumber(line.beforeQuantity)} → ${trimNumber(line.afterQuantity)} ${line.baseUnit}`} />
              <Row label="Expiration Date" value={displayDate(line.expirationDate)} />
              <Row label="Transaction" value={line.movementReference} />
            </View>
          ))}
          <Text style={[styles.copy, { color: colors.secondaryText }]}>
            This saved Stock-In cannot be edited or deleted by staff. It is kept in Transaction History.
          </Text>
          <Pressable accessibilityRole="button" onPress={startAnother} style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent }, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>Record Another Stock-In</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}>
            <Text style={[styles.secondaryText, { color: colors.text }]}>Back to Stocks</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  const banner = submitError || validation?.summary || '';

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Stocks" onPress={onBack} style={styles.back}>
          <Text style={[styles.backGlyph, { color: colors.text }]}>‹</Text>
        </Pressable>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Stock-In</Text>
          <Text style={[styles.copy, { color: colors.secondaryText }]}>{branchLabel} · Receive ingredients and supplies</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {banner ? (
          <View style={[styles.banner, { borderColor: colors.error }]} accessibilityRole="alert">
            <Text style={[styles.error, { color: colors.error }]}>! {banner}</Text>
          </View>
        ) : null}

        <View style={card}>
          <Text style={[styles.section, { color: colors.text }]}>Delivery details</Text>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Supplier or Reference (optional)</Text>
          <TextInput
            value={header.supplierReference}
            onChangeText={(value) => changeHeader({ supplierReference: value })}
            placeholder="e.g. Seaside Market, OR-1182"
            placeholderTextColor={colors.secondaryText}
            maxLength={STOCK_IN_SUPPLIER_MAX_LENGTH}
            accessibilityLabel="Supplier or reference, optional"
            style={inputStyle(validation?.header.supplierReference)}
          />
          {validation?.header.supplierReference ? <Text style={[styles.error, { color: colors.error }]}>{validation.header.supplierReference}</Text> : null}
          <DateField
            label="Date Purchased *"
            value={fromIso(header.datePurchased)}
            maxDate={today}
            error={validation?.header.datePurchased}
            onChange={(date) => changeHeader({ datePurchased: toIso(date) })}
          />
          <DateField
            label="Date Received *"
            value={fromIso(header.dateReceived)}
            maxDate={today}
            error={validation?.header.dateReceived}
            onChange={(date) => changeHeader({ dateReceived: toIso(date) })}
          />
        </View>

        {lines.map((line, index) => {
          const ingredient = byId.get(line.ingredientId) ?? null;
          const errors = validation?.lines[index] ?? {};
          const pack = purchaseUnitOf(ingredient);
          const base = stockInBaseQuantity(line, ingredient);
          return (
            <View key={line.key} style={card}>
              <View style={styles.lineHeader}>
                <Text style={[styles.section, { color: colors.text }]}>Item {index + 1}</Text>
                {lines.length > 1 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove item ${index + 1}`} onPress={() => removeLine(line.key)}>
                    <Text style={[styles.remove, { color: colors.error }]}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Ingredient *</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Item ${index + 1} ingredient, ${ingredient ? ingredient.name : 'choose an ingredient'}`}
                onPress={() => { setSearch(''); setPickerLine(line.key); }}
                style={[styles.input, styles.picker, { borderColor: errors.ingredient ? colors.error : colors.border, backgroundColor: colors.background }]}
              >
                <Text style={[styles.pickerText, { color: ingredient ? colors.text : colors.secondaryText }]}>
                  {ingredient ? `${ingredient.name} · ${ingredient.category}` : 'Select an ingredient'}
                </Text>
                <Text style={{ color: colors.secondaryText }}>⌄</Text>
              </Pressable>
              {errors.ingredient ? <Text style={[styles.error, { color: colors.error }]}>{errors.ingredient}</Text> : null}

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Quantity Received *</Text>
              <TextInput
                value={line.quantity}
                onChangeText={(value) => changeLine(line.key, { quantity: value })}
                keyboardType="decimal-pad"
                placeholder="Enter quantity"
                placeholderTextColor={colors.secondaryText}
                accessibilityLabel={`Item ${index + 1} quantity received, required`}
                style={inputStyle(errors.quantity)}
              />
              {errors.quantity ? <Text style={[styles.error, { color: colors.error }]}>{errors.quantity}</Text> : null}

              <Text style={[styles.fieldLabel, { color: colors.text }]}>Unit of Measurement *</Text>
              <View style={styles.units}>
                {([['base', ingredient ? ingredient.unit : 'Base unit'], ...(pack ? [['pack', pack.label]] : [])] as Array<['base' | 'pack', string]>).map(([unit, label]) => {
                  const selected = line.unit === unit;
                  return (
                    <Pressable
                      key={unit}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Item ${index + 1} unit ${label}`}
                      onPress={() => changeLine(line.key, { unit })}
                      style={[styles.unit, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : colors.background }]}
                    >
                      <Text style={[styles.unitText, { color: selected ? '#FFFFFF' : colors.text }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {errors.unit ? <Text style={[styles.error, { color: colors.error }]}>{errors.unit}</Text> : null}
              {ingredient && line.unit === 'pack' && pack && base !== null ? (
                <Text style={[styles.hint, { color: colors.secondaryText }]}>
                  {line.quantity.trim()} pack × {trimNumber(pack.basePerPack)} {ingredient.unit} = {trimNumber(base)} {ingredient.unit} added to expected stock.
                </Text>
              ) : null}

              <DateField
                label={ingredient?.expirationTracking ? 'Expiration Date *' : 'Expiration Date'}
                value={fromIso(line.expirationDate)}
                allowClear
                error={errors.expirationDate}
                onChange={(date) => changeLine(line.key, { expirationDate: toIso(date) })}
              />
            </View>
          );
        })}

        {lines.length < STOCK_IN_MAX_LINES ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setLines((current) => [...current, newLine()])}
            style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>+ Add Another Item</Text>
          </Pressable>
        ) : null}
        <Text style={[styles.hint, { color: colors.secondaryText }]}>Each item is saved as its own lot with its expiration date.</Text>

        <Pressable accessibilityRole="button" onPress={review} style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent }, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Save</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}>
          <Text style={[styles.secondaryText, { color: colors.text }]}>Cancel</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={pickerLine !== null} transparent animationType="fade" onRequestClose={() => setPickerLine(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select an ingredient</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search ingredients or supplies…"
              placeholderTextColor={colors.secondaryText}
              accessibilityLabel="Search ingredients"
              style={inputStyle()}
            />
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {pickerItems.map((item) => {
                const taken = usedIds.has(item.id) && lines.find((line) => line.key === pickerLine)?.ingredientId !== item.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, ${item.category}, ${item.unit}${taken ? ', already in this Stock-In' : ''}`}
                    accessibilityState={{ disabled: taken }}
                    disabled={taken}
                    onPress={() => {
                      if (pickerLine) changeLine(pickerLine, { ingredientId: item.id, unit: 'base' });
                      setPickerLine(null);
                    }}
                    style={({ pressed }) => [styles.pickerRow, { borderColor: colors.border }, pressed && styles.pressed, taken && styles.disabled]}
                  >
                    <Text style={[styles.pickerText, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.hint, { color: colors.secondaryText }]}>
                      {item.category} · {item.unit}{item.expirationTracking ? ' · expires' : ''}{taken ? ' · already added' : ''}
                    </Text>
                  </Pressable>
                );
              })}
              {pickerItems.length === 0 ? <Text style={[styles.copy, { color: colors.secondaryText }]}>No items match your search.</Text> : null}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setPickerLine(null)} style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => { if (!submitting) setConfirming(false); }}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm Stock-In</Text>
            <Text style={[styles.copy, { color: colors.secondaryText }]}>
              Record this delivery for {branchLabel}? It cannot be edited or deleted after saving.
            </Text>
            <Text style={[styles.copy, { color: colors.text }]}>
              {header.supplierReference.trim() ? `${header.supplierReference.trim()} · ` : ''}Purchased {displayDate(header.datePurchased)} · Received {displayDate(header.dateReceived)}
            </Text>
            <ScrollView style={styles.confirmList}>
              {lines.map((line) => {
                const ingredient = byId.get(line.ingredientId);
                const base = stockInBaseQuantity(line, ingredient);
                if (!ingredient || base === null) return null;
                return (
                  <Text key={line.key} style={[styles.copy, { color: colors.text }]}>
                    {ingredient.name} · +{line.unit === 'pack' ? `${line.quantity.trim()} pack = ` : ''}{trimNumber(base)} {ingredient.unit}
                    {line.expirationDate ? ` · Expires ${displayDate(line.expirationDate)}` : ''}
                  </Text>
                );
              })}
            </ScrollView>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={submitting} onPress={() => setConfirming(false)} style={({ pressed }) => [styles.secondaryCompact, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting, busy: submitting }}
                disabled={submitting}
                onPress={() => void submit()}
                style={({ pressed }) => [styles.primaryCompact, { backgroundColor: colors.accent }, pressed && styles.pressed, submitting && styles.disabled]}
              >
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Confirm Stock-In</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontSize: 26, fontFamily: font.regular },
  title: { fontFamily: font.semibold, fontSize: 18 },
  content: { paddingHorizontal: 18, paddingBottom: 140, gap: 10 },
  card: { padding: 14, borderRadius: 16, borderWidth: 1, gap: 5 },
  section: { fontFamily: font.semibold, fontSize: 12 },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineTitle: { fontFamily: font.semibold, fontSize: 12 },
  remove: { fontFamily: font.medium, fontSize: 10 },
  fieldLabel: { fontFamily: font.medium, fontSize: 10, marginTop: 6 },
  input: { minHeight: 42, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, fontFamily: font.regular, fontSize: 11 },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerText: { fontFamily: font.regular, fontSize: 11 },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unit: { minHeight: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontFamily: font.medium, fontSize: 10 },
  copy: { fontFamily: font.regular, fontSize: 10, lineHeight: 15 },
  hint: { fontFamily: font.regular, fontSize: 9, lineHeight: 14 },
  success: { fontFamily: font.semibold, fontSize: 12 },
  error: { fontFamily: font.regular, fontSize: 9, lineHeight: 13 },
  banner: { padding: 10, borderRadius: 11, borderWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 2 },
  rowLabel: { fontFamily: font.regular, fontSize: 10 },
  rowValue: { flex: 1, textAlign: 'right', fontFamily: font.semibold, fontSize: 10 },
  primary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  primaryCompact: { minHeight: 42, minWidth: 120, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  primaryText: { color: '#FFFFFF', fontFamily: font.semibold, fontSize: 11 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  secondaryCompact: { minHeight: 42, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  secondaryText: { fontFamily: font.medium, fontSize: 10 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: 'rgba(16, 16, 39, 0.42)' },
  modal: { width: '100%', maxWidth: 370, maxHeight: '86%', padding: 18, borderRadius: 19, gap: 8 },
  modalTitle: { fontFamily: font.semibold, fontSize: 15 },
  pickerList: { maxHeight: 340 },
  pickerRow: { paddingVertical: 9, borderBottomWidth: 1 },
  confirmList: { maxHeight: 220 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 8 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.82 },
});
