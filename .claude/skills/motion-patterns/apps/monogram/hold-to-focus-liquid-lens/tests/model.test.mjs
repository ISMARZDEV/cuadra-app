import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lensUniforms, LENS_TIMING } from '../src/motion/model.ts';

test('rest is an identity, including when a pulse source is still active', () => {
  const u = lensUniforms(390, 844, 0, 1, false);
  assert.equal(u.strength, 0);
  assert.equal(u.blurRadius, 0);
  assert.equal(u.displacement, 0);
  assert.equal(u.veil, 0);
});

test('focus rises from below the viewport into its lower region', () => {
  const rest = lensUniforms(390, 844, 0, 0, false);
  const half = lensUniforms(390, 844, 0.5, 0, false);
  const full = lensUniforms(390, 844, 1, 0, false);
  assert.ok(rest.boundary > 844);
  assert.ok(rest.boundary > half.boundary && half.boundary > full.boundary);
  assert.ok(full.boundary > 844 * 0.5 && full.boundary < 844 * 0.7);
});

test('reduced motion removes spatial effects at every phase', () => {
  for (const p of [0, 0.2, 0.8, 1]) {
    const u = lensUniforms(390, 844, p, 1, true);
    assert.equal(u.strength, 0);
    assert.equal(u.blurRadius, 0);
    assert.equal(u.displacement, 0);
    assert.equal(u.veil, 0);
  }
});

test('clamps out-of-range progress and pulse', () => {
  assert.deepEqual(lensUniforms(390, 844, -2, -8, false), lensUniforms(390, 844, 0, 0, false));
  assert.deepEqual(lensUniforms(390, 844, 5, 7, false), lensUniforms(390, 844, 1, 1, false));
});

test('pulse is optional input, bounded and has no time dependency', () => {
  const base = lensUniforms(390, 844, 1, 0, false);
  const peak = lensUniforms(390, 844, 1, 1, false);
  assert.ok(peak.displacement > base.displacement);
  assert.ok(peak.displacement <= base.displacement * 1.25);
  assert.equal(peak.boundary, base.boundary);
});

test('geometry scales with viewport, not source-video pixels', () => {
  const a = lensUniforms(320, 700, 0.7, 0.3, false);
  const b = lensUniforms(640, 1400, 0.7, 0.3, false);
  for (const key of ['boundary', 'bow', 'feather', 'displacement', 'blurRadius']) {
    assert.equal(b[key], a[key] * 2);
  }
});

test('invalid viewport or nonfinite input cannot poison shader uniforms', () => {
  for (const size of [0, -1, NaN, Infinity]) {
    assert.throws(() => lensUniforms(size, 844, 1, 0, false), RangeError);
  }
  const u = lensUniforms(390, 844, NaN, Infinity, false);
  assert.equal(u.strength, 0);
  assert.ok(Object.values(u).flat().every(Number.isFinite));
});

test('lens withdrawal and dimming are separate semantic transitions', () => {
  assert.ok(LENS_TIMING.withdrawMs > LENS_TIMING.enterMs);
  assert.equal(LENS_TIMING.enterMs, 250);
  assert.equal(LENS_TIMING.withdrawMs, 350);
});
