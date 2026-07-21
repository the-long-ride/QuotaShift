import test from 'node:test';
import assert from 'node:assert/strict';
import { PointerReorderController, reorderIdsAtPointer } from '../.test-build/pointer-reorder.js';

const rects = [
  { id: 'a', top: 0, bottom: 40 },
  { id: 'b', top: 40, bottom: 80 },
  { id: 'c', top: 80, bottom: 120 },
];

test('moves a card when pointer crosses target midpoint', () => {
  assert.deepEqual(reorderIdsAtPointer(['a', 'b', 'c'], 'a', rects, 101), ['b', 'c', 'a']);
  assert.deepEqual(reorderIdsAtPointer(['a', 'b', 'c'], 'c', rects, 10), ['c', 'a', 'b']);
});

test('does not enter drag mode below four pixel threshold', () => {
  const controller = new PointerReorderController(4);
  controller.begin('a', 1, 10, 10, ['a', 'b', 'c']);
  const update = controller.move(12, 12, rects);
  assert.equal(update.dragging, false);
  assert.deepEqual(update.ids, ['a', 'b', 'c']);
  assert.equal(controller.finish().committedIds, null);
});

test('commits preview order and suppresses exactly one click', () => {
  const controller = new PointerReorderController(4);
  controller.begin('a', 7, 10, 10, ['a', 'b', 'c']);
  const update = controller.move(10, 101, rects);
  assert.equal(update.dragging, true);
  assert.deepEqual(update.ids, ['b', 'c', 'a']);
  assert.deepEqual(controller.finish().committedIds, ['b', 'c', 'a']);
  assert.equal(controller.consumeClickSuppression(), true);
  assert.equal(controller.consumeClickSuppression(), false);
});

test('cancel discards a pending order', () => {
  const controller = new PointerReorderController(4);
  controller.begin('a', 2, 0, 0, ['a', 'b', 'c']);
  controller.move(20, 101, rects);
  controller.cancel();
  assert.equal(controller.finish().committedIds, null);
});
