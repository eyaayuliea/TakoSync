import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createIngredient,
  createIngredientCategory,
  loadIngredientRecipeConfiguration,
  loadProducts,
  saveProductRecipe,
  updateIngredient,
  type IngredientCategoryRecord,
  type IngredientConfigurationRecord,
  type ProductMenuItem,
  type RecipeIngredientRecord,
} from '../services/takosync';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';

type Props = {
  onManageProducts: () => void;
};

type IngredientEditor = {
  id: string | null;
  name: string;
  categoryId: string;
  unit: string;
};

type RecipeDraftLine = {
  key: string;
  ingredientId: string;
  quantity: string;
};

const colors = {
  pink: '#F20D55',
  navy: '#101027',
  orange: '#FF9418',
  ink: '#171724',
  muted: '#858591',
  pale: '#F5F5F7',
  line: '#EEEEF1',
  white: '#FFFFFF',
  green: '#2F8C57',
  paleGreen: '#E8F6EC',
  red: '#C92F3C',
  paleRed: '#FCE9EB',
  paleOrange: '#FFF1D8',
} as const;

const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

const standardUnits = ['g', 'kg', 'pcs', 'L'];

function makeDraftLine(): RecipeDraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ingredientId: '',
    quantity: '',
  };
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function formatUnit(value: string) {
  return value === 'pcs' ? 'pieces (pcs)' : value;
}

export default function OwnerIngredientsRecipes({ onManageProducts }: Props) {
  const styles = useStyles();
  const [activeSection, setActiveSection] = useState<'Ingredients' | 'Recipes'>('Ingredients');
  const [ingredients, setIngredients] = useState<IngredientConfigurationRecord[]>([]);
  const [categories, setCategories] = useState<IngredientCategoryRecord[]>([]);
  const [products, setProducts] = useState<ProductMenuItem[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [ingredientEditor, setIngredientEditor] = useState<IngredientEditor | null>(null);
  const [ingredientDetails, setIngredientDetails] = useState<IngredientConfigurationRecord | null>(null);
  const [ingredientErrors, setIngredientErrors] = useState<Record<string, string>>({});
  const [savingIngredient, setSavingIngredient] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [recipeProductId, setRecipeProductId] = useState<string | null>(null);
  const [recipeEditorOpen, setRecipeEditorOpen] = useState(false);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraftLine[]>([]);
  const [recipeError, setRecipeError] = useState('');
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [expandedIngredientLine, setExpandedIngredientLine] = useState<string | null>(null);
  const [selectedRecipeProductId, setSelectedRecipeProductId] = useState<string | null>(null);
  const [confirmRemoveLineId, setConfirmRemoveLineId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const ingredientSaveLock = useRef(false);
  const recipeSaveLock = useRef(false);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [configuration, nextProducts] = await Promise.all([
        loadIngredientRecipeConfiguration(),
        loadProducts(),
      ]);
      setIngredients(configuration.ingredients);
      setCategories(configuration.categories);
      setRecipeIngredients(configuration.recipeIngredients);
      setProducts(nextProducts);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load ingredients and recipes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const ingredientById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const recipeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of recipeIngredients) counts.set(line.product_id, (counts.get(line.product_id) ?? 0) + 1);
    return counts;
  }, [recipeIngredients]);
  const ingredientUsage = useMemo(() => {
    const usages = new Map<string, RecipeIngredientRecord[]>();
    for (const line of recipeIngredients) {
      usages.set(line.ingredient_id, [...(usages.get(line.ingredient_id) ?? []), line]);
    }
    return usages;
  }, [recipeIngredients]);
  const usedIngredientCount = useMemo(
    () => new Set(recipeIngredients.map((line) => line.ingredient_id)).size,
    [recipeIngredients],
  );
  const visibleIngredients = ingredients.filter((ingredient) =>
    `${ingredient.name} ${categoryById.get(ingredient.category_id) ?? ''} ${ingredient.unit}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const visibleRecipeProducts = products.filter((product) =>
    (recipeCounts.get(product.id) ?? 0) > 0
    && `${product.product_name} ${product.description}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const availableUnits = useMemo(
    () => Array.from(new Set([...standardUnits, ...ingredients.map((ingredient) => ingredient.unit)])),
    [ingredients],
  );
  const activeIngredients = ingredients.filter((ingredient) => ingredient.active);
  const selectedRecipeProduct = recipeProductId ? productById.get(recipeProductId) ?? null : null;
  const selectedRecipeLines = selectedRecipeProductId
    ? recipeIngredients.filter((line) => line.product_id === selectedRecipeProductId)
    : [];
  const detailUsage = ingredientDetails ? ingredientUsage.get(ingredientDetails.id) ?? [] : [];

  const openIngredientEditor = (ingredient?: IngredientConfigurationRecord) => {
    setIngredientErrors({});
    setCategoryName('');
    setIngredientDetails(null);
    setIngredientEditor({
      id: ingredient?.id ?? null,
      name: ingredient?.name ?? '',
      categoryId: ingredient?.category_id ?? categories[0]?.id ?? '',
      unit: ingredient?.unit ?? availableUnits[0] ?? 'g',
    });
  };

  const saveIngredient = async () => {
    if (!ingredientEditor || ingredientSaveLock.current) return;
    const errors: Record<string, string> = {};
    const name = ingredientEditor.name.trim();
    if (!name) errors.name = 'Ingredient name is required.';
    if (!ingredientEditor.categoryId || !categories.some((category) => category.id === ingredientEditor.categoryId)) {
      errors.categoryId = 'Choose an existing category.';
    }
    if (!ingredientEditor.unit) errors.unit = 'Choose a unit of measurement.';
    const currentIngredient = ingredientEditor.id ? ingredientById.get(ingredientEditor.id) : null;
    if (
      currentIngredient
      && currentIngredient.unit !== ingredientEditor.unit
      && (ingredientUsage.get(currentIngredient.id)?.length ?? 0) > 0
    ) {
      errors.unit = 'This ingredient is used in recipes. Remove it from those recipes before changing its unit; quantities are not converted automatically.';
    }
    if (ingredients.some((ingredient) =>
      ingredient.id !== ingredientEditor.id && ingredient.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    )) errors.name = 'An ingredient with this name already exists.';
    if (Object.keys(errors).length) {
      setIngredientErrors(errors);
      return;
    }

    ingredientSaveLock.current = true;
    setSavingIngredient(true);
    setIngredientErrors({});
    try {
      const saved = ingredientEditor.id
        ? await updateIngredient(ingredientEditor.id, {
            name,
            category_id: ingredientEditor.categoryId,
            unit: ingredientEditor.unit,
          })
        : await createIngredient({
            name,
            category_id: ingredientEditor.categoryId,
            unit: ingredientEditor.unit,
          });
      setIngredients((current) => {
        const next = ingredientEditor.id
          ? current.map((item) => item.id === saved.id ? saved : item)
          : [...current, saved].sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setFeedback({
        type: 'success',
        message: ingredientEditor.id ? 'Ingredient updated successfully.' : 'Ingredient added successfully.',
      });
      setIngredientEditor(null);
      void refresh();
    } catch (error) {
      setIngredientErrors({
        submit: error instanceof Error ? error.message : 'Unable to save this ingredient.',
      });
    } finally {
      ingredientSaveLock.current = false;
      setSavingIngredient(false);
    }
  };

  const addCategory = async () => {
    if (!categoryName.trim() || savingCategory) return;
    setSavingCategory(true);
    setIngredientErrors((current) => ({ ...current, category: '' }));
    try {
      const category = await createIngredientCategory(categoryName);
      setCategories((current) => current.some((item) => item.id === category.id)
        ? current
        : [...current, category].sort((a, b) => a.name.localeCompare(b.name)));
      setIngredientEditor((current) => current ? { ...current, categoryId: category.id } : current);
      setCategoryName('');
      setFeedback({ type: 'success', message: 'Category is ready to use.' });
    } catch (error) {
      setIngredientErrors((current) => ({
        ...current,
        category: error instanceof Error ? error.message : 'Unable to add this category.',
      }));
    } finally {
      setSavingCategory(false);
    }
  };

  const openRecipeBuilder = (productId?: string) => {
    const existing = productId ? recipeIngredients.filter((line) => line.product_id === productId) : [];
    setRecipeProductId(productId ?? null);
    setRecipeEditorOpen(true);
    setRecipeDraft(existing.length
      ? existing.map((line) => ({
          key: line.id,
          ingredientId: line.ingredient_id,
        quantity: line.unit_of_measure === ingredientById.get(line.ingredient_id)?.unit
          ? String(line.quantity_required)
          : '',
      }))
      : [makeDraftLine()]);
    setRecipeError('');
    setExpandedIngredientLine(null);
    setFeedback(null);
  };

  const updateRecipeDraft = (key: string, updates: Partial<RecipeDraftLine>) => {
    setRecipeDraft((current) => current.map((line) => line.key === key ? { ...line, ...updates } : line));
  };

  const saveRecipe = async () => {
    if (recipeSaveLock.current) return;
    if (!recipeProductId) {
      setRecipeError('Choose an existing menu product.');
      return;
    }
    if (!recipeDraft.length) {
      setRecipeError('Add at least one ingredient to this recipe.');
      return;
    }
    const seenIngredients = new Set<string>();
    for (const line of recipeDraft) {
      const ingredient = ingredientById.get(line.ingredientId);
      if (!ingredient) {
        setRecipeError('Choose an ingredient for every recipe entry.');
        return;
      }
      if (seenIngredients.has(line.ingredientId)) {
        setRecipeError('An ingredient can only appear once in a recipe.');
        return;
      }
      seenIngredients.add(line.ingredientId);
      const quantityPattern = ingredient.unit === 'pcs' ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/;
      if (!quantityPattern.test(line.quantity) || Number(line.quantity) <= 0) {
        setRecipeError(ingredient.unit === 'pcs'
          ? `Enter a whole number greater than zero for ${ingredient.name}.`
          : `Enter a quantity greater than zero with up to 2 decimal places for ${ingredient.name}.`);
        return;
      }
    }

    recipeSaveLock.current = true;
    setSavingRecipe(true);
    setRecipeError('');
    try {
      const saved = await saveProductRecipe(recipeProductId, recipeDraft.map((line) => {
        const ingredient = ingredientById.get(line.ingredientId);
        if (!ingredient) throw new Error('Choose an ingredient for every recipe entry.');
        return {
          ingredient_id: ingredient.id,
          quantity_required: Number(line.quantity),
          unit_of_measure: ingredient.unit,
        };
      }));
      setRecipeIngredients((current) => [
        ...current.filter((line) => line.product_id !== recipeProductId),
        ...saved,
      ]);
      setSelectedRecipeProductId(recipeProductId);
      setRecipeProductId(null);
      setRecipeEditorOpen(false);
      setRecipeDraft([]);
      setFeedback({ type: 'success', message: 'Recipe saved successfully.' });
      void refresh();
    } catch (error) {
      setRecipeError(error instanceof Error ? error.message : 'Unable to save this recipe.');
    } finally {
      recipeSaveLock.current = false;
      setSavingRecipe(false);
    }
  };

  const removeRecipeIngredient = async (lineId: string) => {
    if (!selectedRecipeProductId || recipeSaveLock.current) return;
    recipeSaveLock.current = true;
    setSavingRecipe(true);
    setFeedback(null);
    try {
      const saved = await saveProductRecipe(
        selectedRecipeProductId,
        selectedRecipeLines
          .filter((line) => line.id !== lineId)
          .map((line) => ({
            ingredient_id: line.ingredient_id,
            quantity_required: line.quantity_required,
            unit_of_measure: line.unit_of_measure,
          })),
      );
      setRecipeIngredients((current) => [
        ...current.filter((line) => line.product_id !== selectedRecipeProductId),
        ...saved,
      ]);
      if (!saved.length) setSelectedRecipeProductId(null);
      setConfirmRemoveLineId(null);
      setFeedback({ type: 'success', message: 'Ingredient removed from the recipe.' });
      void refresh();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to remove this recipe ingredient.',
      });
    } finally {
      recipeSaveLock.current = false;
      setSavingRecipe(false);
    }
  };

  const renderSummary = () => (
    <View style={styles.summaryGrid}>
      <View style={[styles.summaryCard, styles.summaryCardFeatured]}>
        <Text style={[styles.summaryLabel, styles.summaryLabelFeatured]}>Total ingredients</Text>
        <Text style={[styles.summaryValue, styles.summaryValueFeatured]}>{ingredients.length}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Categories</Text>
        <Text style={styles.summaryValue}>{categories.length}</Text>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Used in recipes</Text>
        <Text style={styles.summaryValue}>{usedIngredientCount}</Text>
      </View>
    </View>
  );

  const renderSearch = (placeholder: string) => (
    <View style={styles.searchBox}>
      <Text style={styles.searchGlyph}>⌕</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        accessibilityLabel={placeholder}
        returnKeyType="search"
      />
      {search ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')}>
          <Text style={styles.clearSearch}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const renderIngredientList = () => (
    <>
      {renderSearch('Search ingredients by name')}
      <Pressable accessibilityRole="button" onPress={() => openIngredientEditor()} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>+ Add Ingredient</Text>
      </Pressable>
      {ingredients.length === 0 && !loading ? (
        <EmptyState text="No ingredients are registered yet. Add an ingredient to start building recipes." />
      ) : visibleIngredients.length ? visibleIngredients.map((ingredient) => {
        const usageCount = ingredientUsage.get(ingredient.id)?.length ?? 0;
        return (
          <View key={ingredient.id} style={styles.ingredientCard}>
            <View style={styles.ingredientCardTop}>
              <View style={styles.ingredientMark}>
                <Text style={styles.ingredientMarkText}>{ingredient.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{ingredient.name}</Text>
                <Text style={styles.cardMeta}>
                  {categoryById.get(ingredient.category_id) ?? 'Category unavailable'} · {formatUnit(ingredient.unit)}
                </Text>
              </View>
              <Text style={[styles.statusPill, ingredient.active ? styles.statusActive : styles.statusInactive]}>
                {ingredient.active ? 'Active' : 'Inactive'}
              </Text>
            </View>
            <View style={styles.ingredientCardFooter}>
              <Text style={styles.usageHint}>{usageCount} {usageCount === 1 ? 'recipe' : 'recipes'}</Text>
              <View style={styles.inlineActions}>
                <Pressable accessibilityRole="button" onPress={() => setIngredientDetails(ingredient)} style={styles.smallAction}>
                  <Text style={styles.smallActionText}>Details</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => openIngredientEditor(ingredient)} style={styles.smallAction}>
                  <Text style={styles.smallActionText}>Edit</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      }) : (
        <EmptyState text={ingredients.length ? 'No ingredients match your search.' : 'No ingredients are registered yet.'} />
      )}
    </>
  );

  const renderRecipeList = () => (
    <>
      {renderSearch('Search recipes by product')}
      <Pressable accessibilityRole="button" onPress={() => openRecipeBuilder()} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>+ Create Recipe</Text>
      </Pressable>
      {products.length === 0 && !loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Add a menu product before creating its recipe.</Text>
          <Pressable accessibilityRole="button" onPress={onManageProducts} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Open Products & Menu</Text>
          </Pressable>
        </View>
      ) : visibleRecipeProducts.length ? visibleRecipeProducts.map((product) => {
        const count = recipeCounts.get(product.id) ?? 0;
        const hasUnitMismatch = recipeIngredients.some((line) =>
          line.product_id === product.id && line.unit_of_measure !== ingredientById.get(line.ingredient_id)?.unit,
        );
        return (
          <View key={product.id} style={styles.recipeCard}>
            <View style={styles.recipeHeader}>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{product.product_name}</Text>
                <Text style={styles.cardMeta}>{count} {count === 1 ? 'ingredient' : 'ingredients'} configured</Text>
              </View>
              <Text style={[styles.statusPill, product.is_available ? styles.statusActive : styles.statusInactive]}>
                {product.is_available ? 'Available' : 'Unavailable'}
              </Text>
            </View>
            <View style={styles.recipeCardFooter}>
              <Text style={[styles.recipeStatus, hasUnitMismatch && styles.recipeWarning]}>
                {hasUnitMismatch ? 'Review ingredient units' : 'Recipe configured'}
              </Text>
              <View style={styles.inlineActions}>
                <Pressable accessibilityRole="button" onPress={() => setSelectedRecipeProductId(product.id)} style={styles.smallAction}>
                  <Text style={styles.smallActionText}>View Recipe</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => openRecipeBuilder(product.id)} style={styles.smallAction}>
                  <Text style={styles.smallActionText}>Edit</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      }) : (
        <EmptyState text={recipeIngredients.length
          ? 'No recipes match your search.'
          : 'No recipes have been configured yet. Create a recipe for one of your menu products.'} />
      )}
    </>
  );

  return (
    <View style={styles.module}>
      <Text style={styles.description}>Manage your ingredients and configure the recipes used by your menu products.</Text>
      {renderSummary()}
      <View style={styles.sectionSwitch}>
        {(['Ingredients', 'Recipes'] as const).map((section) => {
          const selected = activeSection === section;
          return (
            <Pressable
              key={section}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setActiveSection(section);
                setSearch('');
                setFeedback(null);
                setSelectedRecipeProductId(null);
              }}
              style={[styles.sectionButton, selected && styles.sectionButtonSelected]}
            >
              <Text style={[styles.sectionButtonText, selected && styles.sectionButtonTextSelected]}>{section}</Text>
            </Pressable>
          );
        })}
      </View>
      {feedback ? (
        <Text style={[styles.feedback, feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess]} accessibilityRole="alert">
          {feedback.message}
        </Text>
      ) : null}
      {loadError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {loading && ingredients.length === 0 && products.length === 0 ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.pink} />
          <Text style={styles.loadingText}>Loading ingredients and recipes…</Text>
        </View>
      ) : activeSection === 'Ingredients' ? renderIngredientList() : renderRecipeList()}

      {selectedRecipeProductId && !recipeProductId ? (
        <View style={styles.recipeDetail}>
          <View style={styles.recipeDetailHeading}>
            <View style={styles.cardCopy}>
              <Text style={styles.recipeDetailTitle}>{productById.get(selectedRecipeProductId)?.product_name ?? 'Menu product'}</Text>
              <Text style={styles.cardMeta}>{selectedRecipeLines.length} ingredients in this recipe</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close recipe details" onPress={() => setSelectedRecipeProductId(null)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          {selectedRecipeLines.map((line) => (
            <View key={line.id} style={styles.detailIngredientRow}>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{ingredientById.get(line.ingredient_id)?.name ?? 'Ingredient unavailable'}</Text>
                <Text style={styles.cardMeta}>{formatQuantity(line.quantity_required)} {formatUnit(line.unit_of_measure)}</Text>
                {ingredientById.get(line.ingredient_id)?.unit !== line.unit_of_measure ? (
                  <Text style={styles.unitWarning}>
                    Unit changed to {formatUnit(ingredientById.get(line.ingredient_id)?.unit ?? '')}; edit this recipe and enter the correct quantity.
                  </Text>
                ) : null}
              </View>
              {confirmRemoveLineId === line.id ? (
                <View style={styles.inlineActions}>
                  <Pressable accessibilityRole="button" disabled={savingRecipe} onPress={() => setConfirmRemoveLineId(null)} style={styles.smallAction}>
                    <Text style={styles.smallActionText}>Cancel</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={savingRecipe} onPress={() => void removeRecipeIngredient(line.id)} style={styles.removeAction}>
                    <Text style={styles.removeActionText}>{savingRecipe ? 'Removing…' : 'Confirm'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable accessibilityRole="button" disabled={savingRecipe} onPress={() => setConfirmRemoveLineId(line.id)} style={styles.removeAction}>
                  <Text style={styles.removeActionText}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}
          <View style={styles.inlineActions}>
            <Pressable accessibilityRole="button" onPress={() => openRecipeBuilder(selectedRecipeProductId)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Edit Recipe</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => openRecipeBuilder(selectedRecipeProductId)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Add Ingredient</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal
        transparent
        animationType="fade"
        visible={Boolean(ingredientEditor || ingredientDetails)}
        onRequestClose={() => {
          setIngredientEditor(null);
          setIngredientDetails(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              {ingredientEditor ? (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{ingredientEditor.id ? 'Edit Ingredient' : 'Add Ingredient'}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close ingredient form" onPress={() => setIngredientEditor(null)} style={styles.closeButton}>
                      <Text style={styles.closeButtonText}>×</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.fieldLabel}>Ingredient name</Text>
                  <TextInput
                    value={ingredientEditor.name}
                    onChangeText={(name) => {
                      setIngredientEditor((current) => current ? { ...current, name } : current);
                      setIngredientErrors((current) => ({ ...current, name: '' }));
                    }}
                    placeholder="Ingredient name"
                    placeholderTextColor={colors.muted}
                    style={[styles.textInput, ingredientErrors.name && styles.inputError]}
                    accessibilityLabel="Ingredient name"
                  />
                  {ingredientErrors.name ? <Text style={styles.fieldError}>{ingredientErrors.name}</Text> : null}

                  <Text style={styles.fieldLabel}>Ingredient category</Text>
                  {categories.length ? (
                    <View style={styles.optionWrap}>
                      {categories.map((category) => {
                        const selected = category.id === ingredientEditor.categoryId;
                        return (
                          <Pressable
                            key={category.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => {
                              setIngredientEditor((current) => current ? { ...current, categoryId: category.id } : current);
                              setIngredientErrors((current) => ({ ...current, categoryId: '' }));
                            }}
                            style={[styles.optionChip, selected && styles.optionChipSelected]}
                          >
                            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{category.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : <Text style={styles.helperText}>Add a category to continue.</Text>}
                  {ingredientErrors.categoryId ? <Text style={styles.fieldError}>{ingredientErrors.categoryId}</Text> : null}
                  <View style={styles.addCategoryRow}>
                    <TextInput
                      value={categoryName}
                      onChangeText={setCategoryName}
                      placeholder="New category name"
                      placeholderTextColor={colors.muted}
                      style={[styles.textInput, styles.categoryInput]}
                      accessibilityLabel="New ingredient category name"
                    />
                    <Pressable accessibilityRole="button" disabled={savingCategory || !categoryName.trim()} onPress={() => void addCategory()} style={styles.addCategoryButton}>
                      <Text style={styles.addCategoryText}>{savingCategory ? 'Adding…' : 'Add'}</Text>
                    </Pressable>
                  </View>
                  {ingredientErrors.category ? <Text style={styles.fieldError}>{ingredientErrors.category}</Text> : null}

                  <Text style={styles.fieldLabel}>Unit of measurement</Text>
                  <View style={styles.optionWrap}>
                    {availableUnits.map((unit) => {
                      const selected = unit === ingredientEditor.unit;
                      return (
                        <Pressable
                          key={unit}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => {
                            setIngredientEditor((current) => current ? { ...current, unit } : current);
                            setIngredientErrors((current) => ({ ...current, unit: '' }));
                          }}
                          style={[styles.optionChip, selected && styles.optionChipSelected]}
                        >
                          <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{formatUnit(unit)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {ingredientErrors.unit ? <Text style={styles.fieldError}>{ingredientErrors.unit}</Text> : null}
                  {ingredientErrors.submit ? <Text style={styles.fieldError}>{ingredientErrors.submit}</Text> : null}
                  <Pressable accessibilityRole="button" disabled={savingIngredient} onPress={() => void saveIngredient()} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>{savingIngredient ? 'Saving…' : ingredientEditor.id ? 'Save Changes' : 'Add Ingredient'}</Text>
                  </Pressable>
                </>
              ) : ingredientDetails ? (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Ingredient Details</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close ingredient details" onPress={() => setIngredientDetails(null)} style={styles.closeButton}>
                      <Text style={styles.closeButtonText}>×</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.detailName}>{ingredientDetails.name}</Text>
                  <Text style={styles.cardMeta}>
                    {categoryById.get(ingredientDetails.category_id) ?? 'Category unavailable'} · {formatUnit(ingredientDetails.unit)}
                  </Text>
                  <View style={styles.detailStats}>
                    <View style={styles.detailStat}>
                      <Text style={styles.summaryLabel}>Status</Text>
                      <Text style={styles.detailValue}>{ingredientDetails.active ? 'Active' : 'Inactive'}</Text>
                    </View>
                    <View style={styles.detailStat}>
                      <Text style={styles.summaryLabel}>Recipes</Text>
                      <Text style={styles.detailValue}>{detailUsage.length}</Text>
                    </View>
                  </View>
                  <Text style={styles.fieldLabel}>Used in recipes</Text>
                  {detailUsage.length ? detailUsage.map((line) => (
                    <View key={line.id} style={styles.detailIngredientRow}>
                      <View style={styles.cardCopy}>
                        <Text style={styles.cardTitle}>{productById.get(line.product_id)?.product_name ?? 'Product unavailable'}</Text>
                        <Text style={styles.cardMeta}>{formatQuantity(line.quantity_required)} {formatUnit(line.unit_of_measure)}</Text>
                      </View>
                    </View>
                  )) : <Text style={styles.helperText}>This ingredient is not currently used in a configured recipe.</Text>}
                  <Pressable accessibilityRole="button" onPress={() => openIngredientEditor(ingredientDetails)} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Edit Ingredient</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={recipeEditorOpen}
        onRequestClose={() => {
          setRecipeProductId(null);
          setRecipeEditorOpen(false);
          setRecipeError('');
        }}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{recipeProductId && (recipeCounts.get(recipeProductId) ?? 0) ? 'Edit Recipe' : 'Create Recipe'}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close recipe form" onPress={() => { setRecipeProductId(null); setRecipeEditorOpen(false); setRecipeError(''); }} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>×</Text>
                </Pressable>
              </View>
              <Text style={styles.fieldLabel}>Menu product</Text>
              {recipeProductId ? (
                <View style={styles.productSelection}>
                  <Text style={styles.cardTitle}>{selectedRecipeProduct?.product_name ?? 'Product unavailable'}</Text>
                  <Text style={styles.cardMeta}>{selectedRecipeProduct?.is_available ? 'Available' : 'Unavailable'}</Text>
                </View>
              ) : (
                <View style={styles.productChoiceList}>
                  {products.filter((product) => !recipeCounts.has(product.id)).map((product) => (
                    <Pressable
                      key={product.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: recipeProductId === product.id }}
                      onPress={() => setRecipeProductId(product.id)}
                      style={styles.productChoice}
                    >
                      <View style={styles.cardCopy}>
                        <Text style={styles.cardTitle}>{product.product_name}</Text>
                        <Text style={styles.cardMeta}>{product.is_available ? 'Available' : 'Unavailable'}</Text>
                      </View>
                      <Text style={styles.moreChevron}>{recipeProductId === product.id ? '✓' : '›'}</Text>
                    </Pressable>
                  ))}
                  {products.every((product) => recipeCounts.has(product.id)) ? (
                    <Text style={styles.helperText}>Every existing menu product already has a recipe. Edit a recipe from the list to change it.</Text>
                  ) : null}
                </View>
              )}
              <Text style={styles.fieldLabel}>Recipe ingredients</Text>
              {recipeProductId && recipeIngredients.some((line) =>
                line.product_id === recipeProductId && line.unit_of_measure !== ingredientById.get(line.ingredient_id)?.unit,
              ) ? (
                <Text style={styles.unitWarning}>
                  An ingredient's unit has changed. Its quantity has been cleared so you can enter the correct amount; no automatic conversion is applied.
                </Text>
              ) : null}
              {!activeIngredients.length ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Add an active ingredient before creating a recipe.</Text>
                  <Pressable accessibilityRole="button" onPress={() => { setRecipeProductId(null); setRecipeEditorOpen(false); setActiveSection('Ingredients'); openIngredientEditor(); }} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Add Ingredient</Text>
                  </Pressable>
                </View>
              ) : null}
              {recipeDraft.map((line, index) => {
                const ingredient = ingredientById.get(line.ingredientId);
                const choices = activeIngredients.some((item) => item.id === line.ingredientId) || !ingredient
                  ? activeIngredients
                  : [ingredient, ...activeIngredients];
                const expanded = expandedIngredientLine === line.key;
                return (
                  <View key={line.key} style={styles.recipeDraftCard}>
                    <View style={styles.draftHeading}>
                      <Text style={styles.draftNumber}>Ingredient {index + 1}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ingredient entry ${index + 1}`} onPress={() => setRecipeDraft((current) => current.filter((entry) => entry.key !== line.key))} style={styles.removeAction}>
                        <Text style={styles.removeActionText}>Remove</Text>
                      </Pressable>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Select ingredient for entry ${index + 1}`} onPress={() => setExpandedIngredientLine(expanded ? null : line.key)} style={styles.ingredientSelect}>
                      <Text style={ingredient ? styles.cardTitle : styles.placeholderText}>{ingredient?.name ?? 'Choose an ingredient'}</Text>
                      <Text style={styles.moreChevron}>{expanded ? '⌃' : '⌄'}</Text>
                    </Pressable>
                    {expanded ? (
                      <View style={styles.ingredientChoices}>
                        {choices.map((choice) => (
                          <Pressable
                            key={choice.id}
                            accessibilityRole="button"
                            onPress={() => {
                              updateRecipeDraft(line.key, { ingredientId: choice.id });
                              setExpandedIngredientLine(null);
                            }}
                            style={styles.ingredientChoice}
                          >
                            <View style={styles.cardCopy}>
                              <Text style={styles.cardTitle}>{choice.name}</Text>
                              <Text style={styles.cardMeta}>{categoryById.get(choice.category_id) ?? 'Other'} · {formatUnit(choice.unit)}{choice.active ? '' : ' · Inactive'}</Text>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.quantityRow}>
                      <TextInput
                        value={line.quantity}
                        onChangeText={(quantity) => updateRecipeDraft(line.key, { quantity })}
                        placeholder="Required quantity"
                        keyboardType={ingredient?.unit === 'pcs' ? 'number-pad' : 'decimal-pad'}
                        placeholderTextColor={colors.muted}
                        style={styles.quantityInput}
                        accessibilityLabel={`Required quantity for ingredient entry ${index + 1}`}
                      />
                      <Text style={styles.unitValue}>{ingredient ? formatUnit(ingredient.unit) : 'Unit'}</Text>
                    </View>
                    <Text style={styles.helperText}>Unit follows the ingredient's configured unit.</Text>
                  </View>
                );
              })}
              {activeIngredients.length ? (
                <Pressable accessibilityRole="button" onPress={() => setRecipeDraft((current) => [...current, makeDraftLine()])} style={styles.addEntryButton}>
                  <Text style={styles.addEntryText}>+ Add Ingredient</Text>
                </Pressable>
              ) : null}
              <Text style={styles.workflowNote}>Recipe setup does not change stock. Ingredient consumption remains part of the backend's completed-sale workflow.</Text>
              {recipeError ? <Text style={styles.fieldError} accessibilityRole="alert">{recipeError}</Text> : null}
              <Pressable accessibilityRole="button" disabled={savingRecipe || !recipeProductId} onPress={() => void saveRecipe()} style={[styles.primaryButton, (!recipeProductId || savingRecipe) && styles.buttonDisabled]}>
                <Text style={styles.primaryButtonText}>{savingRecipe ? 'Saving…' : 'Save Recipe'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function useStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
    module: { width: '100%' },
    description: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, marginBottom: 12 },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
    summaryCard: { flex: 1, minWidth: '29%', minHeight: 66, justifyContent: 'space-between', padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
    summaryCardFeatured: { backgroundColor: colors.navy, borderColor: colors.navy },
    summaryLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 7 },
    summaryLabelFeatured: { color: '#D5D5E0' },
    summaryValue: { color: colors.navy, fontFamily: font.bold, fontSize: 17, marginTop: 5 },
    summaryValueFeatured: { color: colors.white },
    sectionSwitch: { flexDirection: 'row', padding: 3, marginBottom: 11, borderRadius: 12, backgroundColor: colors.pale },
    sectionButton: { flex: 1, minHeight: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
    sectionButtonSelected: { backgroundColor: colors.white, elevation: 2, shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
    sectionButtonText: { color: colors.muted, fontFamily: font.medium, fontSize: 9 },
    sectionButtonTextSelected: { color: colors.pink, fontFamily: font.semibold },
    searchBox: { minHeight: 39, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.white },
    searchGlyph: { color: colors.muted, fontFamily: font.semibold, fontSize: 17, marginRight: 7 },
    searchInput: { flex: 1, minWidth: 0, minHeight: 38, paddingVertical: 0, color: colors.ink, fontFamily: font.regular, fontSize: 9 },
    clearSearch: { color: colors.muted, fontFamily: font.semibold, fontSize: 17, paddingLeft: 8 },
    primaryButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, marginBottom: 9, borderRadius: 11, backgroundColor: colors.pink },
    primaryButtonText: { color: colors.white, fontFamily: font.semibold, fontSize: 9 },
    secondaryButton: { minHeight: 33, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: colors.pink, borderRadius: 10, backgroundColor: colors.white },
    secondaryButtonText: { color: colors.pink, fontFamily: font.semibold, fontSize: 8 },
    ingredientCard: { padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.white, elevation: 1, shadowColor: '#000000', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
    ingredientCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ingredientMark: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.paleOrange },
    ingredientMarkText: { color: colors.navy, fontFamily: font.semibold, fontSize: 10 },
    cardCopy: { flex: 1, minWidth: 0 },
    cardTitle: { color: colors.ink, fontFamily: font.semibold, fontSize: 9 },
    cardMeta: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 2 },
    statusPill: { overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10, fontFamily: font.medium, fontSize: 6 },
    statusActive: { color: colors.green, backgroundColor: colors.paleGreen },
    statusInactive: { color: colors.muted, backgroundColor: colors.pale },
    ingredientCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 8, paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.line },
    usageHint: { color: colors.muted, fontFamily: font.regular, fontSize: 7 },
    inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    smallAction: { minHeight: 26, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.pale },
    smallActionText: { color: colors.pink, fontFamily: font.semibold, fontSize: 7 },
    recipeCard: { padding: 11, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.white },
    recipeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    recipeCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
    recipeStatus: { color: colors.green, fontFamily: font.medium, fontSize: 7 },
    recipeWarning: { color: colors.red },
    unitWarning: { color: colors.red, fontFamily: font.medium, fontSize: 7, lineHeight: 11, marginTop: 4 },
    emptyCard: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 17, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
    emptyText: { color: colors.muted, fontFamily: font.regular, fontSize: 8, lineHeight: 13, textAlign: 'center' },
    retryButton: { alignSelf: 'flex-start', minHeight: 27, justifyContent: 'center', paddingHorizontal: 9, marginTop: 6, borderRadius: 8, backgroundColor: colors.pink },
    retryText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
    loadingCard: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white },
    loadingText: { color: colors.muted, fontFamily: font.medium, fontSize: 8 },
    errorCard: { padding: 11, marginBottom: 8, borderRadius: 11, backgroundColor: colors.paleRed },
    errorText: { color: colors.red, fontFamily: font.medium, fontSize: 8, lineHeight: 12 },
    feedback: { padding: 8, marginBottom: 8, borderRadius: 9, fontFamily: font.medium, fontSize: 8 },
    feedbackError: { color: colors.red, backgroundColor: colors.paleRed },
    feedbackSuccess: { color: colors.green, backgroundColor: colors.paleGreen },
    recipeDetail: { padding: 11, marginTop: 4, marginBottom: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.white },
    recipeDetailHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
    recipeDetailTitle: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
    detailIngredientRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
    closeButton: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.pale },
    closeButtonText: { color: colors.navy, fontFamily: font.medium, fontSize: 17, lineHeight: 20 },
    modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 20, backgroundColor: 'rgba(16, 16, 39, 0.55)' },
    modalScroll: { width: '100%', maxWidth: 430, flexGrow: 0 },
    modalScrollContent: { flexGrow: 1, justifyContent: 'center' },
    modalCard: { width: '100%', padding: 14, borderRadius: 18, backgroundColor: colors.white, elevation: 12, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
    modalTitle: { flex: 1, color: colors.navy, fontFamily: font.semibold, fontSize: 13 },
    fieldLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: 8, marginTop: 8, marginBottom: 5 },
    textInput: { minHeight: 39, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.pale, color: colors.ink, fontFamily: font.regular, fontSize: 9 },
    inputError: { borderColor: colors.red },
    fieldError: { color: colors.red, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 4 },
    optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    optionChip: { minHeight: 29, justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.white },
    optionChipSelected: { borderColor: colors.pink, backgroundColor: '#FCE3EB' },
    optionText: { color: colors.ink, fontFamily: font.medium, fontSize: 7 },
    optionTextSelected: { color: colors.pink, fontFamily: font.semibold },
    addCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
    categoryInput: { flex: 1, minWidth: 0, minHeight: 34 },
    addCategoryButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 9, backgroundColor: colors.navy },
    addCategoryText: { color: colors.white, fontFamily: font.semibold, fontSize: 8 },
    helperText: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, marginTop: 4 },
    detailName: { color: colors.navy, fontFamily: font.bold, fontSize: 15, marginTop: 3 },
    detailStats: { flexDirection: 'row', gap: 7, marginVertical: 10 },
    detailStat: { flex: 1, padding: 9, borderRadius: 10, backgroundColor: colors.pale },
    detailValue: { color: colors.navy, fontFamily: font.semibold, fontSize: 10, marginTop: 4 },
    productSelection: { padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.pale },
    productChoiceList: { maxHeight: 170 },
    productChoice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
    moreChevron: { color: colors.pink, fontFamily: font.semibold, fontSize: 13, marginLeft: 8 },
    recipeDraftCard: { padding: 9, marginBottom: 7, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.pale },
    draftHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    draftNumber: { color: colors.navy, fontFamily: font.semibold, fontSize: 8 },
    removeAction: { paddingHorizontal: 7, paddingVertical: 3 },
    removeActionText: { color: colors.red, fontFamily: font.medium, fontSize: 7 },
    ingredientSelect: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.white },
    placeholderText: { color: colors.muted, fontFamily: font.regular, fontSize: 8 },
    ingredientChoices: { maxHeight: 140, marginTop: 4, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.white },
    ingredientChoice: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
    quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
    quantityInput: { flex: 1, minHeight: 36, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 9, backgroundColor: colors.white, color: colors.ink, fontFamily: font.regular, fontSize: 9 },
    unitValue: { minWidth: 49, color: colors.navy, fontFamily: font.semibold, fontSize: 8, textAlign: 'right' },
    addEntryButton: { minHeight: 33, alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.pink, borderRadius: 9 },
    addEntryText: { color: colors.pink, fontFamily: font.semibold, fontSize: 8 },
    workflowNote: { color: colors.muted, fontFamily: font.regular, fontSize: 7, lineHeight: 11, padding: 8, marginBottom: 8, borderRadius: 9, backgroundColor: colors.pale },
    buttonDisabled: { opacity: 0.6 },
  }, theme)), [theme]);
}
