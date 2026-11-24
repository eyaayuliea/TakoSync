import assert from 'node:assert/strict';
import test from 'node:test';
import { brandLogoLayout, openingLogoWidth } from './brandLogo.ts';

test('the opening logo is sized by its artwork: about 281 px wide on a 390 px phone', () => {
  assert.equal(openingLogoWidth(390), 281);
  assert.equal(openingLogoWidth(320), 230);
  assert.equal(openingLogoWidth(1024), 340);
});

test('the image is drawn larger than its box so the transparent margins are cropped away', () => {
  const layout = brandLogoLayout(281);
  assert.equal(layout.boxWidth, 281);
  assert.equal(layout.imageSize, 338);
  assert.equal(layout.boxHeight, 188);
  assert.ok(layout.imageSize > layout.boxWidth && layout.imageSize > layout.boxHeight);
});
