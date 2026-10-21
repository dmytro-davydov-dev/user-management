import { describe, expect, it } from 'vitest';
import { parsePage } from './use-page-param';

describe('parsePage', () => {
  it.each([
    [null, 1],
    ['', 1],
    ['1', 1],
    ['3', 3],
    ['0', 1],
    ['-2', 1],
    ['1.5', 1],
    ['abc', 1],
  ])('%j → %i', (raw, expected) => {
    expect(parsePage(raw)).toBe(expected);
  });
});
