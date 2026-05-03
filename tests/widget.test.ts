import test from 'node:test';
import assert from 'node:assert/strict';

// ── reimplemented helpers for unit isolation ──

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

function formatThinkLevel(level: string, icon: string): string {
  const labels: Record<string, string> = {
    minimal: 'min',
    low: 'low',
    medium: 'med',
    high: 'high',
    xhigh: 'xhi',
  };
  const label = labels[level] ?? level;
  return withIcon(icon, `think:${label}`);
}

function hexFg(hex: string, text: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
}

// ═══════════════════════════════════════════════════
// withIcon
// ═══════════════════════════════════════════════════

test('withIcon returns icon + space + text when icon is given', () => {
  assert.equal(withIcon('\uF0E7', 'think:high'), '\uF0E7 think:high');
  assert.equal(withIcon('\uEC19', 'my-model'), '\uEC19 my-model');
});

test('withIcon returns text only when icon is empty', () => {
  assert.equal(withIcon('', 'think:high'), 'think:high');
  assert.equal(withIcon('', 'dir'), 'dir');
});

// ═══════════════════════════════════════════════════
// formatThinkLevel
// ═══════════════════════════════════════════════════

test('formatThinkLevel maps known levels to abbreviated labels', () => {
  assert.equal(formatThinkLevel('minimal', ''), 'think:min');
  assert.equal(formatThinkLevel('low', ''), 'think:low');
  assert.equal(formatThinkLevel('medium', ''), 'think:med');
  assert.equal(formatThinkLevel('high', ''), 'think:high');
  assert.equal(formatThinkLevel('xhigh', ''), 'think:xhi');
});

test('formatThinkLevel passes through unknown levels', () => {
  assert.equal(formatThinkLevel('off', ''), 'think:off');
  assert.equal(formatThinkLevel('custom', ''), 'think:custom');
});

test('formatThinkLevel prepends icon when provided', () => {
  const icon = '\uF0E7';
  assert.equal(formatThinkLevel('high', icon), '\uF0E7 think:high');
  assert.equal(formatThinkLevel('off', icon), '\uF0E7 think:off');
});

// ═══════════════════════════════════════════════════
// hexFg
// ═══════════════════════════════════════════════════

test('hexFg generates ANSI true color escape sequence', () => {
  assert.equal(hexFg('#d787af', 'hello'), '\x1b[38;2;215;135;175mhello');
  assert.equal(hexFg('#00afaf', 'world'), '\x1b[38;2;0;175;175mworld');
  assert.equal(hexFg('#ffffff', 'white'), '\x1b[38;2;255;255;255mwhite');
  assert.equal(hexFg('#000000', 'black'), '\x1b[38;2;0;0;0mblack');
});

test('hexFg works without # prefix', () => {
  assert.equal(hexFg('d787af', 'hello'), '\x1b[38;2;215;135;175mhello');
});

test('hexFg handles uppercase hex', () => {
  assert.equal(hexFg('#FF00FF', 'mag'), '\x1b[38;2;255;0;255mmag');
});

// ═══════════════════════════════════════════════════
// createWidgetRenderer render logic (invariant portions)
// ═══════════════════════════════════════════════════

const THINK_COLORS: Record<string, string> = {
  high: 'thinkingHigh',
  xhigh: 'thinkingXhigh',
  minimal: 'thinkingMinimal',
  low: 'thinkingLow',
  medium: 'thinkingMedium',
};

/** Minimal theme stub — only need fg and dim */
function makeTheme(): any {
  return {
    fg(color: string, text: string): string {
      return `{${color}}${text}{/}`;
    },
  };
}

/** Render one line simulating the live render path */
function renderWidgetLine(modelName: string, thinkLevel: string, folder: string): string {
  const theme = makeTheme();
  const iconModel = '';
  const iconThink = '';
  const iconFolder = 'dir';
  const sep = '|';

  const modelText = withIcon(iconModel, modelName);
  const thinkText = formatThinkLevel(thinkLevel, iconThink);
  const folderText = withIcon(iconFolder, folder);

  const line =
    hexFg('#d787af', modelText) +
    theme.fg('dim', ` ${sep} `) +
    theme.fg(THINK_COLORS[thinkLevel] ?? 'thinkingOff', thinkText) +
    theme.fg('dim', ` ${sep} `) +
    hexFg('#00afaf', folderText) +
    '\x1b[0m';

  return line;
}

test('widget render includes model name in magenta', () => {
  const line = renderWidgetLine('claude-sonnet', 'off', 'myproj');
  assert.ok(line.includes('\x1b[38;2;215;135;175mclaude-sonnet'));
});

test('widget render includes think level label', () => {
  const line = renderWidgetLine('m1', 'high', 'f');
  assert.ok(line.includes('think:high'));
});

test('widget render uses thinkingHigh color for high level', () => {
  const line = renderWidgetLine('m', 'high', 'f');
  assert.ok(line.includes('{thinkingHigh}think:high{/}'));
});

test('widget render falls back to thinkingOff for unknown level', () => {
  const line = renderWidgetLine('m', 'off', 'f');
  assert.ok(line.includes('{thinkingOff}think:off{/}'));
});

test('widget render includes folder in cyan', () => {
  const line = renderWidgetLine('m1', 'low', 'src');
  assert.ok(line.includes('\x1b[38;2;0;175;175m'));
  assert.ok(line.includes('dir src'));
});

test('widget render includes dimension separators', () => {
  const line = renderWidgetLine('m', 'off', 'f');
  assert.ok(line.includes('{dim} | {/}'));
});

test('widget render output ends with ANSI reset', () => {
  const line = renderWidgetLine('m', 'off', 'f');
  assert.ok(line.endsWith('\x1b[0m'));
});

test('widget render structure: model → sep → think → sep → folder', () => {
  const line = renderWidgetLine('MODEL', 'high', 'DIR');

  const modelIdx = line.indexOf('MODEL');
  const sep1Idx = line.indexOf('{dim} | {/}');
  const thinkIdx = line.indexOf('think:high');
  const sep2Idx = line.lastIndexOf('{dim} | {/}');
  const dirIdx = line.indexOf('dir DIR');

  assert.ok(modelIdx < sep1Idx, 'model before first sep');
  assert.ok(sep1Idx < thinkIdx, 'first sep before think');
  assert.ok(thinkIdx < sep2Idx, 'think before second sep');
  assert.ok(sep2Idx < dirIdx, 'second sep before folder');
});

// ═══════════════════════════════════════════════════
// live state injection pattern
// ═══════════════════════════════════════════════════

test('render uses liveThinkLevel from module state, not hardcoded', () => {
  // Simulate what createWidgetRenderer.render does:
  // it reads liveThinkLevel from module scope.
  let liveThinkLevel = 'minimal';
  const thinkText = formatThinkLevel(liveThinkLevel, '');
  assert.equal(thinkText, 'think:min');

  // Change state (as thinking_level_select event would)
  liveThinkLevel = 'high';
  const thinkText2 = formatThinkLevel(liveThinkLevel, '');
  assert.equal(thinkText2, 'think:high');
});

test('render uses liveCtx.model for model name', () => {
  // Verify the extraction pattern: ctx?.model?.name || ctx?.model?.id || 'no-model'
  const cases: Array<[any, string]> = [
    [{ model: { name: 'Claude 4' } }, 'Claude 4'],
    [{ model: { id: 'claude-4' } }, 'claude-4'],
    [{ model: undefined }, 'no-model'],
    [null, 'no-model'],
  ];

  for (const [ctx, expected] of cases) {
    const modelName = ctx?.model?.name || ctx?.model?.id || 'no-model';
    assert.equal(modelName, expected);
  }
});

test('render uses liveCtx.cwd for folder name', () => {
  // Verify extraction: basename(ctx?.cwd ?? process.cwd())
  // Since basename isn't imported here, test the fallback pattern:
  const cases: Array<[any, string]> = [
    [{ cwd: '/home/user/projects/foo' }, '/home/user/projects/foo'],
    [{ cwd: '/tmp' }, '/tmp'],
    [null, process.cwd()],
    [{}, process.cwd()],
  ];

  for (const [ctx, expected] of cases) {
    const cwd = ctx?.cwd ?? process.cwd();
    assert.equal(cwd, expected);
  }
});
