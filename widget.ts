/**
 * Custom Widget Extension
 *
 * Powerline-style status widget displayed above the input editor.
 * Shows:  model → current folder.
 * Only active when breadcrumb mode is "top" in .pi/settings.json.
 */
import { basename } from 'node:path';
import type { ExtensionAPI, ExtensionContext, Theme } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
import { readPowerlineSettings } from './settings.ts';

// ═══════════════════════════════════════════════════════════════════════════
// icons & colors
// ═══════════════════════════════════════════════════════════════════════════

function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === '1') return true;
  if (process.env.POWERLINE_NERD_FONTS === '0') return false;
  if (process.env.GHOSTTY_RESOURCES_DIR) return true;
  const term = (process.env.TERM_PROGRAM || '').toLowerCase();
  return ['iterm', 'wezterm', 'kitty', 'ghostty', 'alacritty'].some((t) => term.includes(t));
}

const NERD = hasNerdFonts();
const ICON_MODEL = NERD ? '\uF4BC' : '';
const ICON_FOLDER = NERD ? '\uF115' : 'dir';
const SEP = NERD ? '\uE0B1' : '|';

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

// ═══════════════════════════════════════════════════════════════════════════
// live state
// ═══════════════════════════════════════════════════════════════════════════

let liveCtx: ExtensionContext | null = null;
let liveTui: any = null;
let widgetEnabled = false;

// ═══════════════════════════════════════════════════════════════════════════
// widget renderer
// ═══════════════════════════════════════════════════════════════════════════

// hex → ANSI true color (model/folder use hex, not pi theme tokens)
function hexFg(hex: string, text: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
}

function createWidgetRenderer() {
  return (_tui: any, theme: Theme) => {
    liveTui = _tui;
    return {
      dispose() {
        liveTui = null;
      },
      invalidate() {},
      render(width: number): string[] {
        const ctx = liveCtx;
        const cwd = ctx?.cwd ?? process.cwd();
        const modelName = ctx?.model?.name || ctx?.model?.id || 'no-model';
        const folder = basename(cwd) || cwd;

        const modelText = withIcon(ICON_MODEL, modelName);
        const folderText = withIcon(ICON_FOLDER, folder);

        const line =
          hexFg('#d787af', modelText) +
          theme.fg('dim', ` ${SEP} `) +
          hexFg('#00afaf', folderText) +
          '\x1b[0m';

        const visLen = visibleWidth(line);
        if (visLen > width) {
          return [truncateToWidth(line, width, '...')];
        }
        return [line + ' '.repeat(width - visLen)];
      },
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// module registration
// ═══════════════════════════════════════════════════════════════════════════

export function registerWidget(pi: ExtensionAPI) {
  function enable(ctx: ExtensionContext) {
    widgetEnabled = true;
    liveCtx = ctx;
    ctx.ui.setWidget('powerline-status', createWidgetRenderer(), {
      placement: 'aboveEditor',
    });
  }

  function disable(ctx: ExtensionContext) {
    widgetEnabled = false;
    liveCtx = null;
    ctx.ui.setWidget('powerline-status', undefined);
  }

  // enable only when breadcrumb mode is "top"
  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return;
    const { breadcrumb } = readPowerlineSettings(ctx.cwd);
    if (breadcrumb === 'top') {
      enable(ctx);
    }
  });

  // re-evaluate on model switch (breadcrumb setting may have changed)
  pi.on('model_select', (_event, ctx) => {
    const { breadcrumb } = readPowerlineSettings(ctx.cwd);
    if (breadcrumb === 'top' && !widgetEnabled) {
      enable(ctx);
    } else if (breadcrumb !== 'top' && widgetEnabled) {
      disable(ctx);
    } else if (widgetEnabled) {
      liveCtx = ctx;
      liveTui?.requestRender();
    }
  });
}
