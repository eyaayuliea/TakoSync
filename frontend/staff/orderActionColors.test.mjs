import assert from 'node:assert/strict';
import test from 'node:test';
import { contrastRatio, destructiveTextColor, orderActionColors, secondaryOutline } from './orderActionColors.ts';

test('contrast ratio follows WCAG', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
});

for (const [mode, isDark] of [['light', false], ['dark', true]]) {
  const c = orderActionColors(isDark);
  const secondaryBackground = c.secondary.background === 'transparent' ? c.pageBackground : c.secondary.background;

  test(`${mode}: only the primary action is filled with the brand colour`, () => {
    assert.equal(c.primary.background, '#EC1358');
    assert.notEqual(secondaryBackground, c.primary.background);
    assert.notEqual(c.destructive.text, c.primary.background);
  });

  test(`${mode}: labels are readable (4.5:1) on their backgrounds`, () => {
    assert.ok(contrastRatio(c.secondary.text, secondaryBackground) >= 4.5, 'Return to cart');
    assert.ok(contrastRatio(c.destructive.text, c.pageBackground) >= 4.5, 'Cancel order');
    assert.ok(contrastRatio(c.destructiveFill.text, c.destructiveFill.background) >= 4.5, 'dialog discard button');
    // White on the brand pink is the app-wide primary button (4.4:1); it must not get worse.
    assert.ok(contrastRatio(c.primary.text, c.primary.background) >= 4.3, 'Confirm Transaction');
  });

  test(`${mode}: the buttons stand out from the page (3:1 for the filled and outlined ones)`, () => {
    assert.ok(contrastRatio(c.primary.background, c.pageBackground) >= 3);
    assert.ok(contrastRatio(c.secondary.border, c.pageBackground) >= 3);
  });

  test(`${mode}: a disabled primary looks disabled, not like the secondary`, () => {
    assert.notEqual(c.primaryDisabled.background, c.primary.background);
    assert.notEqual(c.primaryDisabled.background, secondaryBackground);
    assert.ok(contrastRatio(c.primaryDisabled.text, c.primaryDisabled.background) >= 3);
  });
}

test('other staff screens get the same outlined secondary and red destructive text', () => {
  for (const isDark of [false, true]) {
    const c = orderActionColors(isDark);
    assert.deepEqual(secondaryOutline(isDark), { backgroundColor: c.secondary.background, borderWidth: 1.5, borderColor: c.secondary.border });
    assert.equal(destructiveTextColor(isDark), c.destructive.text);
  }
  // In dark mode the staff style sheet recolours borders that start with #E or #F; the outline must not be one of them.
  assert.doesNotMatch(secondaryOutline(true).borderColor, /^#[EF]/i);
});
