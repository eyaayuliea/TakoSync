import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../../services/testTsLoader.mjs', import.meta.url);
const { staffStatusTones, staffTypography, staffSpacing, staffRadius } = await import('./staffTokens.ts');

function hexRgb(value) {
  const hex = value.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function luminance(value) {
  return hexRgb(value).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

test('Staff typography tokens keep body/detail/label text at readable sizes', () => {
  assert.ok(staffTypography.body.fontSize >= 12);
  assert.ok(staffTypography.detail.fontSize >= 12);
  assert.ok(staffTypography.label.fontSize >= 12);
});

test('Staff spacing and radius scales expose the required control values', () => {
  assert.deepEqual([staffSpacing.xs, staffSpacing.sm, staffSpacing.md, staffSpacing.lg, staffSpacing.xl, staffSpacing.xxl], [4, 8, 12, 16, 20, 24]);
  assert.equal(staffRadius.control, 8);
  assert.equal(staffRadius.card, 8);
  assert.equal(staffRadius.dialog, 8);
});

test('Staff status foreground/background pairs meet WCAG AA for normal text', () => {
  for (const tone of Object.values(staffStatusTones)) {
    const lighter = Math.max(luminance(tone.background), luminance(tone.foreground));
    const darker = Math.min(luminance(tone.background), luminance(tone.foreground));
    assert.ok((lighter + 0.05) / (darker + 0.05) >= 4.5);
  }
});

