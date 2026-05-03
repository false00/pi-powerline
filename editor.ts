import {
  CustomEditor,
  type ExtensionAPI,
  Theme,
  type ThemeColor,
} from '@mariozechner/pi-coding-agent';
/** Pure transform: add > prompt prefix and borders to rendered editor lines. */
function renderPromptPrefix(
  lines: string[],
  width: number,
  borderChar: string,
  prefixChar: string,
  indentChar: string,
): string[] {
  if (lines.length < 3) return lines;

  let bottomIdx = lines.length - 1;
  for (let i = lines.length - 1; i >= 1; i--) {
    const stripped = (lines[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '');
    if (stripped.length > 0 && /^─{3,}/.test(stripped)) {
      bottomIdx = i;
      break;
    }
  }

  const result: string[] = [];

  result.push(borderChar.repeat(width));

  for (let i = 1; i < bottomIdx; i++) {
    if (i === 1) {
      result.push(prefixChar + ' ' + (lines[i] ?? ''));
    } else {
      result.push(indentChar + ' ' + (lines[i] ?? ''));
    }
  }

  if (bottomIdx === 1) {
    result.push(prefixChar + ' ' + ' '.repeat(width - 2));
  }

  result.push(borderChar.repeat(width));

  for (let i = bottomIdx + 1; i < lines.length; i++) {
    result.push(lines[i] ?? '');
  }

  return result;
}

let currentTheme: Theme | null = null;

/** Maps each editor element to a pi theme color token. @example PromptPrefixEditor.colorTokens.prefix = "success"; */
export interface PromptPrefixColorTokens {
  border?: ThemeColor;
  prefix?: ThemeColor;
  indent?: ThemeColor;
}

/** Custom editor with a > prompt prefix. Colors use `PromptPrefixColorTokens`. */
export class PromptPrefixEditor extends CustomEditor {
  static colorTokens: PromptPrefixColorTokens = {
    border: 'borderAccent',
    prefix: 'dim',
    indent: 'border',
  };

  render(width: number): string[] {
    const contentWidth = Math.max(1, width - 2);
    const lines = super.render(contentWidth);
    if (lines.length < 3) return lines;

    const theme = currentTheme;
    const color = (token: ThemeColor | undefined, text: string) =>
      !theme || !token ? text : theme.fg(token, text);

    // Bash mode: when text starts with !, switch to bashMode coloring
    const isBash = this.getText().trimStart().startsWith('!');
    const tokens = isBash
      ? {
          border: 'bashMode' as ThemeColor,
          prefix: 'bashMode' as ThemeColor,
          indent: 'bashMode' as ThemeColor,
        }
      : PromptPrefixEditor.colorTokens;

    return renderPromptPrefix(
      lines,
      width,
      color(tokens.border, '─'),
      color(tokens.prefix, '❯'),
      tokens.indent ? color(tokens.indent, ' ') : ' ',
    );
  }
}

export function updateTheme(theme: Theme): void {
  currentTheme = theme;
}

export function registerEditor(pi: ExtensionAPI) {
  pi.registerFlag('customEditor', {
    description: 'Enable custom prompt-prefix editor',
    type: 'boolean',
    default: true,
  });

  pi.on('session_start', (_event, ctx) => {
    currentTheme = ctx.ui.theme;

    if (!pi.getFlag('customEditor')) return;

    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) => new PromptPrefixEditor(tui, theme, keybindings),
    );
  });
}
