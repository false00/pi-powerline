/**
 * Custom Header Extension
 *
 * Shows a gradient-colored PI logo.
 * Controlled by .pi/settings.json → header (boolean, default true).
 */
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionStartEvent,
  Theme,
} from '@mariozechner/pi-coding-agent';
import { VERSION } from '@mariozechner/pi-coding-agent';
import { readPowerlineSettings } from './settings.ts';

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

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function visibleLength(line: string): number {
  return line.replace(ANSI_PATTERN, '').length;
}

function centerTruncate(line: string, width: number): string {
  if (width <= 0) return '';

  const length = visibleLength(line);
  if (length <= width) return line;

  const reset = '\x1b[0m';
  const start = Math.floor((length - width) / 2);
  const end = start + width;
  let activeAnsi = '';
  let result = '';
  let visibleIdx = 0;

  for (let i = 0; i < line.length; ) {
    const ansi = /^\x1b\[[0-9;]*m/.exec(line.slice(i));
    if (ansi) {
      const code = ansi[0];
      activeAnsi = code === reset ? '' : code;
      if (visibleIdx >= start && visibleIdx < end) {
        result += code;
      }
      i += code.length;
      continue;
    }

    const char = Array.from(line.slice(i))[0] ?? '';
    if (visibleIdx >= start && visibleIdx < end) {
      if (!result && activeAnsi) result += activeAnsi;
      result += char;
    }
    visibleIdx++;
    i += char.length;
  }

  return result.includes('\x1b[') ? result + reset : result;
}

function centerLine(line: string, width: number): string {
  const centeredLine = centerTruncate(line, width);
  const padding = Math.max(0, Math.floor((width - visibleLength(centeredLine)) / 2));
  return ' '.repeat(padding) + centeredLine;
}

const PI_LOGO = [
  '██████████    ',
  '████  ████    ',
  '████  ████    ',
  '████████  ████',
  '████      ████',
  '████      ████',
];

function formatReasonStatus(theme: Theme, reason: SessionStartEvent['reason']): string {
  switch (reason) {
    case 'startup':
      return theme.fg('warning', 'Welcome');
    case 'reload':
      return theme.fg('success', 'Reloaded');
    case 'new':
      return theme.fg('success', 'New Session Started');
    default:
      return theme.fg('dim', reason);
  }
}

function renderLogo(theme: Theme, reason: SessionStartEvent['reason'], width: number): string[] {
  const logoWidth = Math.max(...PI_LOGO.map((line) => line.length));
  const lines = PI_LOGO.map((line) =>
    centerLine(gradientLine(line.padEnd(logoWidth)) + '\x1b[0m', width),
  );
  const subtitle = `${theme.fg('muted', 'pi agent')}${theme.fg('dim', ` v${VERSION}`)}`;
  return [
    '',
    ...lines,
    centerLine(subtitle, width),
    centerLine(formatReasonStatus(theme, reason), width),
  ];
}

/** Register the custom header extension. */
export function registerHeader(pi: ExtensionAPI) {
  let headerEnabled = false;
  let currentReason: SessionStartEvent['reason'] = 'startup';

  function createHeaderComponent(reason: SessionStartEvent['reason']) {
    return (_tui: any, theme: Theme) => ({
      render(width: number): string[] {
        return renderLogo(theme, reason, width);
      },
      invalidate() {},
    });
  }

  function enable(ctx: ExtensionContext, reason = currentReason) {
    headerEnabled = true;
    currentReason = reason;
    ctx.ui.setHeader(createHeaderComponent(reason));
  }

  function disable(ctx: ExtensionContext) {
    headerEnabled = false;
    ctx.ui.setHeader(undefined);
  }

  // auto-enable on session start if powerline master switch + header setting are both on
  pi.on('session_start', (event, ctx) => {
    if (!ctx.hasUI) return;
    const s = readPowerlineSettings(ctx.cwd);
    if (s.powerline && s.header) {
      enable(ctx, event.reason);
    }
  });

  // re-evaluate on model switch
  pi.on('model_select', (_event, ctx) => {
    const s = readPowerlineSettings(ctx.cwd);
    const show = s.powerline && s.header;
    if (show && !headerEnabled) {
      enable(ctx);
    } else if (!show && headerEnabled) {
      disable(ctx);
    }
  });

  // re-evaluate on /powerline command (settings changed)
  pi.events.on('powerline_settings_changed', (ctx) => {
    const c = ctx as ExtensionContext;
    const s = readPowerlineSettings(c.cwd);
    const show = s.powerline && s.header;
    if (show && !headerEnabled) {
      enable(c);
    } else if (!show && headerEnabled) {
      disable(c);
    }
  });
}
