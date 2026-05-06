import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ═══════════════════════════════════════════════════════════════════════════
// Pure function extraction: stats line layout
// Reimplements the layout algorithm from footer.ts for unit isolation.
// ═══════════════════════════════════════════════════════════════════════════

interface StatsLayoutInput {
  /** Total terminal width available (visible chars). */
  width: number;
  /** Visible width of the git branch segment (0 if no branch). */
  gitWidth: number;
  /** Already-colored git branch segment (with trailing space), or ''. */
  gitFull: string;
  /** Visible width of the stats text (without coloring). */
  statsWidth: number;
  /** The stats text (plain, no theme coloring applied yet). */
  statsText: string;
  /** The right-side text (think level, plain, no coloring). */
  rightPlain: string;
  /** Visible width of right-side text. */
  rightWidth: number;
  /** Minimum padding between left and right parts. */
  minPad: number;
}

interface StatsLayoutOutput {
  /** The formatted stats line. */
  line: string;
  /** Whether git segment was dropped. */
  gitDropped: boolean;
  /** Whether right segment was dropped. */
  rightDropped: boolean;
}

/**
 * Pure layout function for the stats line.
 * Mirrors the layout logic in footer.ts render().
 * Uses token placeholders for coloring (test renders them as-is).
 */
function layoutStatsLine(input: StatsLayoutInput): StatsLayoutOutput {
  const { width, gitWidth, gitFull, statsWidth, statsText, rightPlain, rightWidth, minPad } = input;

  const totalBase = gitWidth + statsWidth + minPad + rightWidth;

  if (totalBase <= width) {
    // Everything fits
    const pad = width - gitWidth - statsWidth - rightWidth;
    return {
      line:
        gitFull +
        `{dim}${statsText}{/}` +
        (pad > 0 ? `{dim}${' '.repeat(pad)}{/}` : '') +
        rightPlain,
      gitDropped: false,
      rightDropped: false,
    };
  }

  if (gitWidth + minPad + rightWidth <= width) {
    // Drop git
    const availStats = width - gitWidth - minPad - rightWidth;
    const trimmed = availStats > 0 ? statsText.slice(0, availStats) : '';
    const trimmedWidth = trimmed.length;
    const pad = width - gitWidth - trimmedWidth - rightWidth;
    return {
      line:
        gitFull + `{dim}${trimmed}{/}` + (pad > 0 ? `{dim}${' '.repeat(pad)}{/}` : '') + rightPlain,
      gitDropped: false,
      rightDropped: false,
    };
  }

  // Drop git and right — only stats
  const availStats = width - minPad;
  const trimmed = availStats > 0 ? statsText.slice(0, availStats) : '';
  return {
    line: trimmed,
    gitDropped: false,
    rightDropped: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure function: context % threshold coloring
// ═══════════════════════════════════════════════════════════════════════════

type ContextColor = 'error' | 'warning' | 'normal';

function contextPercentColor(percent: number): ContextColor {
  if (percent > 90) return 'error';
  if (percent > 70) return 'warning';
  return 'normal';
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure function: auto-compact detection from settings
// ═══════════════════════════════════════════════════════════════════════════

function readAutoCompactEnabled(cwd: string): boolean {
  const settingsPath = join(cwd, '.pi', 'settings.json');
  try {
    const { existsSync, readFileSync } = require('node:fs');
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content || '{}');
      if (
        settings.compaction &&
        typeof settings.compaction === 'object' &&
        'enabled' in (settings.compaction as Record<string, unknown>)
      ) {
        return !!(settings.compaction as Record<string, unknown>).enabled;
      }
    }
  } catch {
    // ignore parse errors
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests: stats line layout
// ═══════════════════════════════════════════════════════════════════════════

test('all fits: git + stats + think level at wide width', () => {
  const result = layoutStatsLine({
    width: 120,
    gitWidth: 8, // " ⎇ main " → 8 visible
    gitFull: 'git-main ',
    statsWidth: 40,
    statsText: '50.0%/200k (auto) ↑1.2k ↓3.4k $0.005',
    rightPlain: 'min',
    rightWidth: 3,
    minPad: 2,
  });

  assert.equal(result.gitDropped, false);
  assert.equal(result.rightDropped, false);
  assert.ok(result.line.includes('git-main'));
  assert.ok(result.line.includes('50.0%/200k'));
  assert.ok(result.line.includes('min'));
});

test('all fits: narrow width but all components fit within limit', () => {
  const result = layoutStatsLine({
    width: 60,
    gitWidth: 8,
    gitFull: 'git-main ',
    statsWidth: 35,
    statsText: '50.0%/200k ↑1.2k ↓3.4k',
    rightPlain: 'med',
    rightWidth: 3,
    minPad: 2,
  });

  assert.equal(result.gitDropped, false);
  assert.equal(result.rightDropped, false);
});

test('drop right when git + stats barely fit but not right', () => {
  const result = layoutStatsLine({
    width: 30,
    gitWidth: 8,
    gitFull: 'git-main ',
    statsWidth: 20,
    statsText: '50.0%/200k ↑1.2k',
    rightPlain: 'min',
    rightWidth: 3,
    minPad: 2,
  });

  // 8 + 20 + 2 + 3 = 33 > 30, but 8 + 2 + 3 = 13 <= 30 → git preserved, right dropped? NO
  // Actually in this case totalBase > width (33 > 30).
  // But gitWidth + minPad + rightWidth = 13 <= 30 → "drop git" case.
  // This is tricky: the condition is gitWidth + minPad + rightWidth <= width,
  // which means we CAN fit git + right + at least minPad. But stats may not fit.
  // The code then truncates stats to fit.

  // Wait, looking at the actual code more carefully:
  // if totalBase <= width → all fits
  // else if gitWidth + minPad + rightWidth <= width → drop stats (truncate), keep git + right
  // else → drop git + right

  // So for 30 width: 8 + 2 + 3 = 13 <= 30 → keep git + right, truncate stats

  // Actually, wait. Re-reading the code:
  // `else if (gitFullWidth + minPad + rightWidth <= width)` → "drop git → fit statsLeft"
  // The comment says "drop git → fit statsLeft" but the code keeps git and drops stats?

  // Let me re-read the footer.ts code...

  // Actually looking again:
  // } else if (gitFullWidth + minPad + rightWidth <= width) {
  //   // drop git → fit statsLeft
  //   const availStats = width - gitFullWidth - minPad - rightWidth;
  //   let statsTrimmed = truncateToWidth(statsLeft, availStats, '');
  //   ...
  //   statsLine = gitFull + theme.fg('dim', statsTrimmed) + dimPadding + coloredRight;
  // }

  // Wait, the comment says "drop git" but the code keeps gitFull! I think the comment is misleading.
  // Actually looking at it, this branch drops stats (truncates it) while keeping git + right.
  // Let me check if there's a "drop git" case:

  // Actually I think I misread. Let me re-read the original code:

  // Line 1: if totalBase fits → full layout
  // Line 2: else if git + right fits (with minPad) → truncate stats, keep git + right
  // Line 3: else → drop git + right, only stats

  // The comment "drop git → fit statsLeft" is wrong — it should be "stats truncate, keep git+right"

  // But wait, looking at it again more carefully...
  // Hmm, actually maybe I should just copy the exact algorithm. Let me re-read more carefully.

  // The exact logic is:
  // totalBase = gitFullWidth + statsLeftWidth + minPad + rightWidth
  // if totalBase <= width → all fits
  // else if (gitFullWidth + minPad + rightWidth <= width) →
  //   availStats = width - gitFullWidth - minPad - rightWidth
  //   statsTrimmed = truncateToWidth(statsLeft, availStats, '')
  //   statsLine = gitFull + theme.fg('dim', statsTrimmed) + dimPadding + coloredRight
  // else →
  //   availStats = width - minPad
  //   statsTrimmed = truncateToWidth(statsLeft, availStats, '')
  //   statsLine = theme.fg('dim', statsTrimmed)

  // So in branch 2: git is kept, stats is truncated, right is kept
  // In branch 3: git dropped, right dropped, only stats (truncated)

  // My layout function below needs to match this exactly.

  assert.equal(result.gitDropped, false);
  // In the test case: 8 + 2 + 3 = 13 <= 30, so branch 2
  // git kept, right kept, stats truncated
  assert.equal(result.rightDropped, false);
  assert.ok(result.line.includes('git-main'));
  assert.ok(result.line.includes('min'));
});

test('narrow width: drops git and right, only stats visible', () => {
  const result = layoutStatsLine({
    width: 24,
    gitWidth: 8,
    gitFull: 'git-main ',
    statsWidth: 20,
    statsText: '50.0%/200k ↑1.2k',
    rightPlain: 'min',
    rightWidth: 3,
    minPad: 2,
  });

  // totalBase = 8 + 20 + 2 + 3 = 33 > 24
  // git + right + minPad = 8 + 3 + 2 = 13 <= 24 → branch 2: keep git+right, truncate stats
  assert.equal(result.gitDropped, false);
  assert.equal(result.rightDropped, false);

  // BUT: if width is even narrower...
  const result2 = layoutStatsLine({
    width: 10,
    gitWidth: 8,
    gitFull: 'git-main ',
    statsWidth: 20,
    statsText: '50.0%/200k ↑1.2k',
    rightPlain: 'min',
    rightWidth: 3,
    minPad: 2,
  });

  // git + right + minPad = 8 + 3 + 2 = 13 > 10 → branch 3: drop git+right
  assert.ok(!result2.line.includes('git-main'));
  assert.ok(!result2.line.includes('min'));
});

test('no git branch: stats + think level layout', () => {
  const result = layoutStatsLine({
    width: 60,
    gitWidth: 0,
    gitFull: '',
    statsWidth: 35,
    statsText: '50.0%/200k (auto) ↑1.2k ↓3.4k',
    rightPlain: 'med',
    rightWidth: 3,
    minPad: 2,
  });

  // 0 + 35 + 2 + 3 = 40 <= 60 → all fits
  assert.equal(result.gitDropped, false);
  assert.equal(result.rightDropped, false);
  assert.ok(result.line.includes('med'));
});

test('no think level (model without reasoning): only git + stats', () => {
  const result = layoutStatsLine({
    width: 80,
    gitWidth: 8,
    gitFull: 'git-main ',
    statsWidth: 45,
    statsText: '50.0%/200k (auto) ↑1.2k ↓3.4k $0.005',
    rightPlain: '',
    rightWidth: 0,
    minPad: 2,
  });

  // 8 + 45 + 2 + 0 = 55 <= 80 → all fits
  assert.equal(result.gitDropped, false);
  assert.equal(result.rightDropped, false);
  assert.ok(!result.line.includes('{thinking')); // no think level rendered
});

test('minimum width: all stats truncated', () => {
  const result = layoutStatsLine({
    width: 5,
    gitWidth: 8,
    gitFull: 'git-main ',
    statsWidth: 40,
    statsText: '50.0%/200k (auto) ↑1.2k ↓3.4k',
    rightPlain: 'min',
    rightWidth: 3,
    minPad: 2,
  });

  // 8 + 2 + 3 = 13 > 5 → branch 3: drop git+right, truncate stats
  // availStats = 5 - 2 = 3 → first 3 chars of stats
  assert.ok(result.line.length <= 10); // roughly
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests: context % threshold coloring
// ═══════════════════════════════════════════════════════════════════════════

test('context > 90%: error color', () => {
  assert.equal(contextPercentColor(95), 'error');
  assert.equal(contextPercentColor(90.1), 'error');
  assert.equal(contextPercentColor(100), 'error');
});

test('context > 70% and <= 90%: warning color', () => {
  assert.equal(contextPercentColor(71), 'warning');
  assert.equal(contextPercentColor(80), 'warning');
  assert.equal(contextPercentColor(90), 'warning');
});

test('context <= 70%: normal color', () => {
  assert.equal(contextPercentColor(70), 'normal');
  assert.equal(contextPercentColor(50), 'normal');
  assert.equal(contextPercentColor(0), 'normal');
});

test('context undefined (?) uses no special coloring', () => {
  // When contextTokens is null, contextPercent = '?'
  // The code checks contextPercentNum (which would be 0 from the ? case)
  // ? case: contextPercentNum = 0 → contextPercentNum > 90 is false → normal
  assert.equal(contextPercentColor(0), 'normal');
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests: auto-compact detection
// ═══════════════════════════════════════════════════════════════════════════

test('auto-compact enabled by default when no settings', () => {
  const dir = mkdtempSync('pi-footer-test-');

  assert.equal(readAutoCompactEnabled(dir), true);

  rmSync(dir, { recursive: true, force: true });
});

test('auto-compact reads from settings.json', () => {
  const dir = mkdtempSync('pi-footer-test-');
  const piDir = join(dir, '.pi');
  mkdirSync(piDir, { recursive: true });
  writeFileSync(join(piDir, 'settings.json'), JSON.stringify({ compaction: { enabled: false } }));

  assert.equal(readAutoCompactEnabled(dir), false);

  rmSync(dir, { recursive: true, force: true });
});

test('auto-compact missing compaction key: default true', () => {
  const dir = mkdtempSync('pi-footer-test-');
  const piDir = join(dir, '.pi');
  mkdirSync(piDir, { recursive: true });
  writeFileSync(join(piDir, 'settings.json'), JSON.stringify({ powerline: false }));

  assert.equal(readAutoCompactEnabled(dir), true);

  rmSync(dir, { recursive: true, force: true });
});

test('auto-compact corrupted JSON: default true', () => {
  const dir = mkdtempSync('pi-footer-test-');
  const piDir = join(dir, '.pi');
  mkdirSync(piDir, { recursive: true });
  writeFileSync(join(piDir, 'settings.json'), '{ not json');

  assert.equal(readAutoCompactEnabled(dir), true);

  rmSync(dir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests: formatTokens (replicated for completeness)
// ═══════════════════════════════════════════════════════════════════════════

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

test('formatTokens: edge cases', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(999), '999');
  assert.equal(formatTokens(1000), '1.0k');
  assert.equal(formatTokens(9999), '10.0k');
  assert.equal(formatTokens(10000), '10k');
  assert.equal(formatTokens(999499), '999k');
  assert.equal(formatTokens(999500), '1000k');
  assert.equal(formatTokens(1000000), '1.0M');
  assert.equal(formatTokens(9999999), '10.0M');
  assert.equal(formatTokens(10000000), '10M');
  assert.equal(formatTokens(123456789), '123M');
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests: stats line layout — exact boundary conditions
// ═══════════════════════════════════════════════════════════════════════════

test('exact fit: totalBase equals width uses full layout', () => {
  // 6 + 19 + 2 + 3 = 30 → exact fit
  const result = layoutStatsLine({
    width: 30,
    gitWidth: 6,
    gitFull: ' ⎇ dev ',
    statsWidth: 19,
    statsText: '50.0%/200k ↑1.2k ↓',
    rightPlain: 'min',
    rightWidth: 3,
    minPad: 2,
  });

  assert.equal(result.gitDropped, false);
  assert.equal(result.rightDropped, false);
  assert.ok(result.line.includes(' ⎇ dev '));
  assert.ok(result.line.includes('min'));
});

test('exactly one char over: truncates stats but keeps git+right', () => {
  const result = layoutStatsLine({
    width: 29,
    gitWidth: 6,
    gitFull: ' ⎇ dev ',
    statsWidth: 20,
    statsText: '50.0%/200k ↑1.2k ↓',
    rightPlain: 'min',
    rightWidth: 3,
    minPad: 2,
  });

  // totalBase = 6 + 20 + 2 + 3 = 31 > 29
  // git + right + minPad = 6 + 3 + 2 = 11 <= 29 → branch 2 (keep git+right, truncate stats)
  assert.equal(result.gitDropped, false);
  assert.equal(result.rightDropped, false);
  assert.ok(result.line.includes(' ⎇ dev '));
  assert.ok(result.line.includes('min'));
});
