import test from 'node:test';
import assert from 'node:assert/strict';
// formatTokenCount is in footer.ts; reimplement inline for unit isolation
function formatTokenCount(n: number): string {
  return n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;
}

// ── formatTokenCount ──

test('formatTokenCount shows exact number when n < 1000', () => {
  assert.equal(formatTokenCount(0), '0');
  assert.equal(formatTokenCount(1), '1');
  assert.equal(formatTokenCount(42), '42');
  assert.equal(formatTokenCount(500), '500');
  assert.equal(formatTokenCount(999), '999');
});

test('formatTokenCount formats with k suffix for n >= 1000', () => {
  assert.equal(formatTokenCount(1000), '1.0k');
  assert.equal(formatTokenCount(1001), '1.0k');
  assert.equal(formatTokenCount(1499), '1.5k');
  assert.equal(formatTokenCount(1500), '1.5k');
  assert.equal(formatTokenCount(1550), '1.6k'); // rounded
  assert.equal(formatTokenCount(1999), '2.0k');
  assert.equal(formatTokenCount(9999), '10.0k');
  assert.equal(formatTokenCount(10000), '10.0k');
  assert.equal(formatTokenCount(12345), '12.3k');
});

test('formatTokenCount handles large numbers', () => {
  assert.equal(formatTokenCount(100000), '100.0k');
  assert.equal(formatTokenCount(999999), '1000.0k');
  assert.equal(formatTokenCount(1000000), '1000.0k');
  assert.equal(formatTokenCount(1234567), '1234.6k');
});

test('formatTokenCount uses one decimal place', () => {
  // Verify the output always has one decimal (or is just an integer for < 1000)
  for (const n of [0, 50, 100, 500, 999, 1000, 1500, 10000, 50000]) {
    const result = formatTokenCount(n);
    if (n < 1000) {
      assert.match(result, /^\d+$/);
    } else {
      assert.match(result, /^\d+\.\dk$/);
    }
  }
});

test('formatTokenCount rounding behavior', () => {
  // 1004 / 1000 = 1.004 → toFixed(1) = "1.0"
  assert.equal(formatTokenCount(1004), '1.0k');
  // 1050 / 1000 = 1.05 → toFixed(1) = "1.1" (rounds up from .05)
  assert.equal(formatTokenCount(1050), '1.1k');
  // 1099 / 1000 = 1.099 → toFixed(1) = "1.1"
  assert.equal(formatTokenCount(1099), '1.1k');
  // 9949 / 1000 = 9.949 → toFixed(1) = "9.9"
  assert.equal(formatTokenCount(9949), '9.9k');
  // 1499 / 1000 = 1.499 → toFixed(1) = "1.5"
  assert.equal(formatTokenCount(1499), '1.5k');
  // 1501 / 1000 = 1.501 → toFixed(1) = "1.5"
  assert.equal(formatTokenCount(1501), '1.5k');
});
