import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule } from '../lib/money.js';
import { computeDeduction } from '../modules/assistanceService.js';
import { allocate } from '../modules/loanCore.js';

test('schedule: last installment absorbs remainder', () => {
  assert.deepEqual(buildSchedule(10000_00, 3000_00, 4), [3000_00, 3000_00, 3000_00, 1000_00]);
  assert.deepEqual(buildSchedule(9000_00, 3000_00, 3), [3000_00, 3000_00, 3000_00]);
});
test('schedule: rejects underfunded or oversized plans', () => {
  assert.throws(() => buildSchedule(10000_00, 3000_00, 3));
  assert.throws(() => buildSchedule(6000_00, 3000_00, 3));
});
test('deduction: 3000 - 800 = 2200 and capped at original', () => {
  assert.equal(3000_00 - computeDeduction(3000_00, 800_00), 2200_00);
  assert.equal(computeDeduction(500_00, 800_00), 500_00);
  assert.equal(computeDeduction(500_00, 0), 0);
});
test('allocate: oldest first, rejects overpay', () => {
  const r = allocate([{ _id: 'a', remaining: 300 }, { _id: 'b', remaining: 300 }], 450);
  assert.deepEqual(r, [{ installment: 'a', amount: 300 }, { installment: 'b', amount: 150 }]);
  assert.throws(() => allocate([{ _id: 'a', remaining: 100 }], 200));
});
