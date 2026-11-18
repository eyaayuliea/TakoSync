import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const colors = {
  background: '#0F1025', surface: '#1B1C33', surfaceSecondary: '#25263D', text: '#FFFFFF',
  secondaryText: '#D5D5DF', accent: '#EC1358', action: '#FCA639', success: '#589144',
  warning: '#FDE672', error: '#F52F2E', information: '#A9ABFF', border: '#35364A',
};

test('createThemedStyles uses immutable dark-mode style mapping', () => {
  const source = readFileSync(fileURLToPath(new URL('./ThemeProvider.tsx', import.meta.url)), 'utf8');
  assert.match(source, /Object\.fromEntries\(/);
  assert.doesNotMatch(source, /Reflect\.set\(/);
  assert.match(source, /if \(!theme\.isDark\) return definitions/);
});
