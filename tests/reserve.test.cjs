'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createPolicy} = require('../research/reserve-policy.cjs');
const config = {...require('../paper-config.json'), positionWeight: 0.07};

test('cash floor, sector limit and previously spent tranche money constrain buy budgets', () => {
  const policy = createPolicy();
  const p = {cash: 15500, positions: {}, researchReserve: {anchor: 50000, spent: 2400, fills: 1}};
  const input = {p, prices: {ROSN: 100, LKOH: 5000}, equity: 50000, config, order: {ticker: 'ROSN'}};
  assert.equal(policy.budget(input), 500);
  input.order = {ticker: 'ROSN', reserve: true, stage: 1};
  assert.equal(policy.budget(input), 100);
  p.cash = 7550;
  assert.equal(policy.budget(input), 50);
  p.positions.LKOH = 3;
  assert.equal(policy.budget(input), 0);
});

test('reserve waits for a rebound in a bullish stock and resets on a recovered peak', () => {
  const policy = createPolicy();
  const closes = [...Array(40).fill(70), ...Array(18).fill(100), 91, 92];
  const input = {
    p: {peak: 50000, positions: {SBERP: 10}}, equity: 47000,
    date: '2026-01-20', series: {SBERP: closes.map(close => ({close}))}
  };
  const orders = policy.orders(input);
  assert.deepEqual(orders.map(o => [o.ticker, o.stage, o.signalDate]), [['SBERP', 1, input.date]]);
  input.series.SBERP.at(-1).close = 90;
  assert.deepEqual(policy.orders(input), []);
  input.p.researchReserve.spent = 2500;
  input.series.SBERP.at(-1).close = 92;
  assert.deepEqual(policy.orders(input), []);
  input.equity = input.p.peak;
  assert.deepEqual(policy.orders(input), []);
  assert.equal(input.p.researchReserve.spent, 0);
});
