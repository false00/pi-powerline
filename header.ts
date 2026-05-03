/**
 * Custom Header Extension
 *
 * Toggles between the built-in header and the PI_LOGO rendered with
 * gradient colors applied per-column (left-to-right gradient).
 */

import type { ExtensionAPI, Theme } from '@mariozechner/pi-coding-agent';
import { VERSION } from '@mariozechner/pi-coding-agent';
/** Left-to-right ANSI gradient coloring. Spaces are left uncolored. */
const GRADIENT_COLORS = [
  '\x1b[38;5;199m',
  '\x1b[38;5;171m',
  '\x1b[38;5;135m',
  '\x1b[38;5;99m',
  '\x1b[38;5;75m',
  '\x1b[38;5;51m',
];

function gradientLine(line: string): string {
  const reset = '\x1b[0m';
  let result = '';
  let colorIdx = 0;
  const step = Math.max(1, Math.floor(line.length / GRADIENT_COLORS.length));

  for (let i = 0; i < line.length; i++) {
    if (i > 0 && i % step === 0 && colorIdx < GRADIENT_COLORS.length - 1) {
      colorIdx++;
    }

    const char = line[i];
    if (char !== ' ') {
      result += GRADIENT_COLORS[colorIdx] + char + reset;
    } else {
      result += char;
    }
  }
  return result;
}

const PI_LOGO = [
  '██████████    ',
  '████  ████    ',
  '████  ████    ',
  '████████  ████',
  '████      ████',
  '████      ████',
];

function renderLogo(theme: Theme): string[] {
  const lines = PI_LOGO.map((line) => '  ' + gradientLine(line) + '\x1b[0m');
  const subtitle = `${theme.fg('muted', '  pi agent')}${theme.fg('dim', ` v${VERSION}`)}`;
  return ['', ...lines, subtitle];
}

export function registerHeader(pi: ExtensionAPI) {
  pi.registerFlag('customHeader', {
    description: 'Enable custom gradient-logo header',
    type: 'boolean',
    default: true,
  });

  // 每次 session 启动自动设置 custom header
  pi.on('session_start', async (_event, ctx) => {
    if (!ctx.hasUI || !pi.getFlag('customHeader')) return;

    ctx.ui.setHeader((_tui, theme) => {
      return {
        render(_width: number): string[] {
          return renderLogo(theme);
        },
        invalidate() {},
      };
    });
  });

  // 命令：回退到 built-in header
  pi.registerCommand('builtin-header', {
    description: 'Restore built-in header with keybinding hints',
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined);
      ctx.ui.notify('Built-in header restored', 'info');
    },
  });
}
