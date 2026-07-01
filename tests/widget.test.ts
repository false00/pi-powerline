import test from 'node:test';
import assert from 'node:assert/strict';
import { hexFg, withIcon } from '../extensions/utils.ts';
import {
  getBreadcrumbData,
  ICON_FOLDER,
  ICON_MODEL,
  renderBreadcrumbInfo,
  SEP,
} from '../extensions/breadcrumb.ts';

// ═══════════════════════════════════════════════════
// withIcon
// ═══════════════════════════════════════════════════

test('withIcon returns icon + space + text when icon is given', () => {
  assert.equal(withIcon('\uEC19', 'my-model'), '\uEC19 my-model');
  assert.equal(withIcon('\uF115', 'src'), '\uF115 src');
});

test('withIcon returns text only when icon is empty', () => {
  assert.equal(withIcon('', 'my-model'), 'my-model');
  assert.equal(withIcon('', 'dir'), 'dir');
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
// widget render logic (model + folder, no think level)
// ═══════════════════════════════════════════════════

/** Minimal theme stub — only need fg */
function makeTheme(): any {
  return {
    fg(color: string, text: string): string {
      return `{${color}}${text}{/}`;
    },
  };
}

/** Render one line simulating the live render path (model → folder). */
function renderWidgetLine(modelName: string, folder: string): string {
  const theme = makeTheme();
  const data = {
    modelName,
    folder,
    modelText: withIcon(ICON_MODEL, modelName),
    folderText: withIcon(ICON_FOLDER, folder),
  };
  return renderBreadcrumbInfo(data, theme, true);
}

test('widget render includes model name in magenta', () => {
  const line = renderWidgetLine('claude-sonnet', 'myproj');
  const expectText = ICON_MODEL ? `${ICON_MODEL} claude-sonnet` : 'claude-sonnet';
  assert.ok(line.includes(`\x1b[38;2;215;135;175m${expectText}`));
});

test('widget render includes folder in cyan', () => {
  const line = renderWidgetLine('m1', 'src');
  assert.ok(line.includes('\x1b[38;2;0;175;175m'));
  const expectText = ICON_FOLDER ? `${ICON_FOLDER} src` : 'src';
  assert.ok(line.includes(expectText));
});

test('widget render includes dim separator', () => {
  const line = renderWidgetLine('m', 'f');
  assert.ok(line.includes(`{dim} ${SEP} {/}`));
});

test('widget render output ends with ANSI reset', () => {
  const line = renderWidgetLine('m', 'f');
  assert.ok(line.endsWith('\x1b[0m'));
});

test('widget render structure: model → sep → folder', () => {
  const line = renderWidgetLine('MODEL', 'DIR');

  const modelIdx = line.indexOf('MODEL');
  const sepIdx = line.indexOf(`{dim} ${SEP} {/}`);
  const dirText = ICON_FOLDER ? `${ICON_FOLDER} DIR` : 'DIR';
  const dirIdx = line.indexOf(dirText);

  assert.ok(modelIdx < sepIdx, 'model before sep');
  assert.ok(sepIdx < dirIdx, 'sep before folder');
});

// ═══════════════════════════════════════════════════
// stale context safety
// ═══════════════════════════════════════════════════

test('getBreadcrumbData falls back when ctx getters are stale', () => {
  const staleCtx = {
    get cwd(): string {
      throw new Error(
        'This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload().',
      );
    },
    get model(): { name?: string; id?: string } | null {
      throw new Error(
        'This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload().',
      );
    },
  };

  const data = getBreadcrumbData(staleCtx);

  assert.equal(data.modelName, 'no-model');
  assert.equal(data.folder, process.cwd().split(/[\\/]/).at(-1) || process.cwd());
});

test('getBreadcrumbData prefers snapshot fields when present', () => {
  const data = getBreadcrumbData({
    cwd: '/home/user/projects/foo',
    model: { name: 'Claude 4 Sonnet', id: 'claude-sonnet-4-5' },
  });

  assert.equal(data.modelName, 'Claude 4 Sonnet');
  assert.equal(data.folder, 'foo');
});
