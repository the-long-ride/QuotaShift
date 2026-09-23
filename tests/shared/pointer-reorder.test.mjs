import test from "node:test";
import assert from "node:assert/strict";
import { PointerReorderController, reorderIdsAtPointer } from "../../.test-build/pointer-reorder.js";

const rects = [
  { id: "a", top: 0, bottom: 40 },
  { id: "b", top: 40, bottom: 80 },
  { id: "c", top: 80, bottom: 120 },
];

test("moves a card when pointer crosses target midpoint", () => {
  assert.deepEqual(reorderIdsAtPointer(["a", "b", "c"], "a", rects, 101), ["b", "c", "a"]);
  assert.deepEqual(reorderIdsAtPointer(["a", "b", "c"], "c", rects, 10), ["c", "a", "b"]);
});

test("moves a higher card to lower position symmetrically", () => {
  // Move card 'a' down to slot 1 (between b and c)
  assert.deepEqual(reorderIdsAtPointer(["a", "b", "c"], "a", rects, 50), ["b", "a", "c"]);
  // Move card 'a' down to slot 2 (after c)
  assert.deepEqual(reorderIdsAtPointer(["a", "b", "c"], "a", rects, 90), ["b", "c", "a"]);
});

test("moves a lower card to higher position symmetrically", () => {
  // Move card 'c' up to slot 1 (between a and b)
  assert.deepEqual(reorderIdsAtPointer(["a", "b", "c"], "c", rects, 70), ["a", "c", "b"]);
  // Move card 'c' up to slot 0 (before a)
  assert.deepEqual(reorderIdsAtPointer(["a", "b", "c"], "c", rects, 30), ["c", "a", "b"]);
});

test("reorders symmetrically with realistic card dimensions and handle grab offset", () => {
  const realisticRects = [
    { id: "acc1", top: 100, bottom: 260 }, // height 160, center 180
    { id: "acc2", top: 270, bottom: 430 }, // height 160, center 350
  ];
  // Midpoint between slot centers is (180 + 350) / 2 = 265

  // Dragging acc1 down from top handle (y = 115, offset = 15)
  // Moving down by 90px (y = 205): visual center = 205 - 15 + 80 = 270 >= 265 -> swap to slot 1!
  assert.deepEqual(reorderIdsAtPointer(["acc1", "acc2"], "acc1", realisticRects, 205, 15), [
    "acc2",
    "acc1",
  ]);
  // Staying above boundary (y = 190): visual center = 190 - 15 + 80 = 255 < 265 -> remains in slot 0
  assert.deepEqual(reorderIdsAtPointer(["acc1", "acc2"], "acc1", realisticRects, 190, 15), [
    "acc1",
    "acc2",
  ]);

  // Dragging acc2 up from top handle (y = 285, offset = 15)
  // Moving up by 90px (y = 195): visual center = 195 - 15 + 80 = 260 < 265 -> swap to slot 0!
  assert.deepEqual(reorderIdsAtPointer(["acc1", "acc2"], "acc2", realisticRects, 195, 15), [
    "acc2",
    "acc1",
  ]);
  // Staying below boundary (y = 210): visual center = 210 - 15 + 80 = 275 >= 265 -> remains in slot 1
  assert.deepEqual(reorderIdsAtPointer(["acc1", "acc2"], "acc2", realisticRects, 210, 15), [
    "acc1",
    "acc2",
  ]);
});

test("does not enter drag mode below four pixel threshold", () => {
  const controller = new PointerReorderController(4);
  controller.begin("a", 1, 10, 10, ["a", "b", "c"]);
  const update = controller.move(12, 12, rects);
  assert.equal(update.dragging, false);
  assert.deepEqual(update.ids, ["a", "b", "c"]);
  assert.equal(controller.finish().committedIds, null);
});

test("commits preview order and suppresses exactly one click", () => {
  const controller = new PointerReorderController(4);
  controller.begin("a", 7, 10, 10, ["a", "b", "c"]);
  const update = controller.move(10, 101, rects);
  assert.equal(update.dragging, true);
  assert.deepEqual(update.ids, ["b", "c", "a"]);
  assert.deepEqual(controller.finish().committedIds, ["b", "c", "a"]);
  assert.equal(controller.consumeClickSuppression(), true);
  assert.equal(controller.consumeClickSuppression(), false);
});

test("controller moves higher card to lowest position with initial rects", () => {
  const controller = new PointerReorderController(4);
  controller.begin("a", 5, 10, 10, ["a", "b", "c"], rects, 10);
  const update = controller.move(10, 95);
  assert.equal(update.dragging, true);
  assert.deepEqual(update.ids, ["b", "c", "a"]);
  assert.deepEqual(controller.finish().committedIds, ["b", "c", "a"]);
});

test("cancel discards a pending order", () => {
  const controller = new PointerReorderController(4);
  controller.begin("a", 2, 0, 0, ["a", "b", "c"]);
  controller.move(20, 101, rects);
  controller.cancel();
  assert.equal(controller.finish().committedIds, null);
});

test("reorders across columns in a two-dimensional flow layout", () => {
  const grid = [
    { id: "a", top: 0, bottom: 80, left: 0, right: 100 },
    { id: "b", top: 0, bottom: 80, left: 110, right: 210 },
    { id: "c", top: 90, bottom: 170, left: 0, right: 100 },
    { id: "d", top: 90, bottom: 170, left: 110, right: 210 },
  ];

  assert.deepEqual(reorderIdsAtPointer(["a", "b", "c", "d"], "a", grid, 40, undefined, 160), [
    "b",
    "a",
    "c",
    "d",
  ]);
  assert.deepEqual(reorderIdsAtPointer(["a", "b", "c", "d"], "a", grid, 130, undefined, 50), [
    "b",
    "c",
    "a",
    "d",
  ]);
  assert.deepEqual(reorderIdsAtPointer(["a", "b", "c", "d"], "d", grid, 40, undefined, 50), [
    "d",
    "a",
    "b",
    "c",
  ]);
});

test("controller uses pointer X and grab offset for flow-grid slot selection", () => {
  const grid = [
    { id: "a", top: 0, bottom: 80, left: 0, right: 100 },
    { id: "b", top: 0, bottom: 80, left: 110, right: 210 },
    { id: "c", top: 90, bottom: 170, left: 0, right: 100 },
    { id: "d", top: 90, bottom: 170, left: 110, right: 210 },
  ];
  const controller = new PointerReorderController(4);
  controller.begin("a", 9, 10, 10, ["a", "b", "c", "d"], grid, 10, 10);
  const update = controller.move(120, 10);
  assert.equal(update.dragging, true);
  assert.deepEqual(update.ids, ["b", "a", "c", "d"]);
});
