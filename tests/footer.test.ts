import test from 'node:test';
import assert from 'node:assert/strict';

// Reimplement formatTokens inline for unit isolation (matches footer.ts)
function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

interface UsageLike {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function getCacheHitRate(usage: UsageLike): number | undefined {
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  return promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : undefined;
}

function buildStatsParts(usage: UsageLike, cost = 0): string[] {
  const parts: string[] = [];
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  const cacheHitRate = getCacheHitRate(usage);
  if ((usage.cacheRead > 0 || usage.cacheWrite > 0) && cacheHitRate !== undefined) {
    parts.push(`CH${cacheHitRate.toFixed(1)}%`);
  }
  if (cost) parts.push(`$${cost.toFixed(3)}`);
  return parts;
}

function buildCostStatsParts(mainCost: number, subagentCost: number, estimated = false): string[] {
  const suffix = estimated ? ' est' : '';
  const parts: string[] = [];
  if (mainCost || estimated) parts.push(`$${mainCost.toFixed(3)}${suffix}`);
  if (subagentCost > 0) {
    parts.push(`Σ$${subagentCost.toFixed(3)}${suffix}`);
    parts.push(`T$${(mainCost + subagentCost).toFixed(3)}${suffix}`);
  }
  return parts;
}

function buildSubagentStatsParts(totals: {
  input: number;
  output: number;
  total?: number;
}): string[] {
  const parts: string[] = [];
  if (totals.input) parts.push(`Σ↑${formatTokens(totals.input)}`);
  if (totals.output) parts.push(`Σ↓${formatTokens(totals.output)}`);
  if (parts.length === 0 && totals.total) parts.push(`Σ${formatTokens(totals.total)}`);
  return parts;
}

// ── formatTokens ──

test('formatTokens: < 1000 returns exact number', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(1), '1');
  assert.equal(formatTokens(42), '42');
  assert.equal(formatTokens(500), '500');
  assert.equal(formatTokens(999), '999');
});

test('formatTokens: 1k – 9.9k range (one decimal)', () => {
  assert.equal(formatTokens(1000), '1.0k');
  assert.equal(formatTokens(1001), '1.0k');
  assert.equal(formatTokens(1499), '1.5k');
  assert.equal(formatTokens(1500), '1.5k');
  assert.equal(formatTokens(1550), '1.6k');
  assert.equal(formatTokens(1999), '2.0k');
  assert.equal(formatTokens(9999), '10.0k');
});

test('formatTokens: 10k – 999k range (rounded integer k)', () => {
  assert.equal(formatTokens(10000), '10k');
  assert.equal(formatTokens(12345), '12k'); // 12.345 → Math.round = 12
  assert.equal(formatTokens(12500), '13k'); // 12.5 → Math.round = 13
  assert.equal(formatTokens(100000), '100k');
  assert.equal(formatTokens(500500), '501k');
  assert.equal(formatTokens(999499), '999k');
  assert.equal(formatTokens(999500), '1000k');
});

test('formatTokens: 1M – 9.9M range (one decimal)', () => {
  assert.equal(formatTokens(1000000), '1.0M');
  assert.equal(formatTokens(1499999), '1.5M');
  assert.equal(formatTokens(1500000), '1.5M');
  assert.equal(formatTokens(9999999), '10.0M');
});

test('formatTokens: >= 10M (rounded integer M)', () => {
  assert.equal(formatTokens(10000000), '10M');
  assert.equal(formatTokens(12345678), '12M');
  assert.equal(formatTokens(50000000), '50M');
  assert.equal(formatTokens(100000000), '100M');
});

test('formatTokens: output format for each tier', () => {
  // < 1k: digits only
  assert.match(formatTokens(123), /^\d+$/);
  // 1k-10k: digit.dk
  assert.match(formatTokens(1500), /^\d+\.\dk$/);
  // 10k-1M: digit(s)k
  assert.match(formatTokens(50000), /^\d+k$/);
  // 1M-10M: digit.dM
  assert.match(formatTokens(5000000), /^\d+\.\dM$/);
  // >= 10M: digit(s)M
  assert.match(formatTokens(50000000), /^\d+M$/);
});

// ── cache hit rate ──

test('getCacheHitRate uses cacheRead over prompt tokens only', () => {
  assert.equal(
    getCacheHitRate({ input: 10000, output: 800, cacheRead: 30000, cacheWrite: 5000 }),
    (30000 / 45000) * 100,
  );
});

test('getCacheHitRate returns undefined when prompt token total is zero', () => {
  assert.equal(getCacheHitRate({ input: 0, output: 100, cacheRead: 0, cacheWrite: 0 }), undefined);
});

test('stats parts place CH after R/W and before cost', () => {
  assert.deepEqual(
    buildStatsParts({ input: 10000, output: 800, cacheRead: 30000, cacheWrite: 5000 }, 0.012),
    ['↑10k', '↓800', 'R30k', 'W5.0k', 'CH66.7%', '$0.012'],
  );
});

test('subagent stats show summed input and output separately', () => {
  assert.deepEqual(buildSubagentStatsParts({ input: 1200, output: 3400 }), ['Σ↑1.2k', 'Σ↓3.4k']);
});

test('subagent stats omit empty input or output sides', () => {
  assert.deepEqual(buildSubagentStatsParts({ input: 0, output: 3400 }), ['Σ↓3.4k']);
  assert.deepEqual(buildSubagentStatsParts({ input: 1200, output: 0 }), ['Σ↑1.2k']);
});

test('subagent stats fall back to legacy combined total when split data is unavailable', () => {
  assert.deepEqual(buildSubagentStatsParts({ input: 0, output: 0, total: 1750 }), ['Σ1.8k']);
});

test('cost stats show main, subagent, and combined totals', () => {
  assert.deepEqual(buildCostStatsParts(0.123, 0.045), ['$0.123', 'Σ$0.045', 'T$0.168']);
});

test('subscription cost stats are clearly labeled as estimates', () => {
  assert.deepEqual(buildCostStatsParts(0.123, 0.045, true), [
    '$0.123 est',
    'Σ$0.045 est',
    'T$0.168 est',
  ]);
});

test('subscription main cost still shows estimate label with zero usage cost', () => {
  assert.deepEqual(buildCostStatsParts(0, 0, true), ['$0.000 est']);
});
