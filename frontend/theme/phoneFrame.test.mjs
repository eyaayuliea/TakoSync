import assert from 'node:assert/strict';
import test from 'node:test';
import { phoneFrameInsets, phoneFrameSize } from './phoneFrame.ts';

test('on a phone the frame is the whole window and pop-ups get no padding', () => {
  assert.deepEqual(phoneFrameSize(390, 844), { isWideScreen: false, width: 390, height: 844 });
  assert.deepEqual(phoneFrameInsets(390, 844), { paddingHorizontal: 0, paddingVertical: 0 });
});

test('in a browser window the frame is phone-sized and centred', () => {
  assert.deepEqual(phoneFrameSize(1440, 900), { isWideScreen: true, width: 430, height: 860 });
  assert.deepEqual(phoneFrameInsets(1440, 900), { paddingHorizontal: 505, paddingVertical: 20 });
});

test('a short window keeps the frame inside it', () => {
  assert.deepEqual(phoneFrameSize(1280, 700), { isWideScreen: true, width: 350, height: 700 });
  assert.deepEqual(phoneFrameInsets(1280, 700), { paddingHorizontal: 465, paddingVertical: 0 });
});
