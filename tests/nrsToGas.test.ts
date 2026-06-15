import { describe, it, expect } from 'vitest';
import { nrsToGas, type NrsConfig } from '@/lib/types';

// Four cut points partition 0–10 into five GAS bands. Each cut point is the
// inclusive upper bound of its band (nrs <= cut). lowerIsBetter flips the sign.
const base: Omit<NrsConfig, 'direction'> = {
  question: '',
  cutLowLow: 2,
  cutLow: 4,
  cutZero: 6,
  cutHigh: 8
};
const higher: NrsConfig = { ...base, direction: 'higherIsBetter' };
const lower: NrsConfig = { ...base, direction: 'lowerIsBetter' };

describe('nrsToGas', () => {
  it('maps the five bands for higherIsBetter', () => {
    expect(nrsToGas(0, higher)).toBe(-2);
    expect(nrsToGas(3, higher)).toBe(-1);
    expect(nrsToGas(5, higher)).toBe(0);
    expect(nrsToGas(7, higher)).toBe(1);
    expect(nrsToGas(10, higher)).toBe(2);
  });

  it('treats cut points as inclusive upper bounds', () => {
    expect(nrsToGas(2, higher)).toBe(-2); // == cutLowLow
    expect(nrsToGas(4, higher)).toBe(-1); // == cutLow
    expect(nrsToGas(6, higher)).toBe(0); // == cutZero
    expect(nrsToGas(8, higher)).toBe(1); // == cutHigh
    expect(nrsToGas(9, higher)).toBe(2); // > cutHigh
  });

  it('flips the sign for lowerIsBetter (mirror of the higher cases)', () => {
    expect(nrsToGas(0, lower)).toBe(2);
    expect(nrsToGas(3, lower)).toBe(1);
    expect(Math.abs(nrsToGas(5, lower))).toBe(0); // neutral band is numerically 0 (JS yields -0 after the flip)
    expect(nrsToGas(7, lower)).toBe(-1);
    expect(nrsToGas(10, lower)).toBe(-2);
  });
});
