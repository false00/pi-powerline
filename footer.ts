/**
 * Custom Footer Extension - demonstrates ctx.ui.setFooter()
 *
 * footerData exposes data not otherwise accessible:
 * - getGitBranch(): current git branch
 * - getExtensionStatuses(): texts from ctx.ui.setStatus()
 *
 * Token stats come from ctx.sessionManager/ctx.model (already accessible).
 *
 * Controlled by settings.json → customFooter (boolean, default true).
 * Toggle at runtime with /footer command.
 */

import type { AssistantMessage } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
/** Format a token count for display: <1000 shown as-is, >=1000 shown as e.g. "1.5k". */
function formatTokenCount(n: number): string {
  return n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;
}

function createFooterRenderer(ctx: ExtensionContext) {
  return (tui: any, theme: any, footerData: any) => {
    const unsub = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose: unsub,
      invalidate() {},
      render(width: number): string[] {
        // Compute tokens from ctx (already accessible to extensions)
        let input = 0,
          output = 0,
          cost = 0;
        for (const e of ctx.sessionManager.getBranch()) {
          if (e.type === 'message' && e.message.role === 'assistant') {
            const m = e.message as AssistantMessage;
            input += m.usage.input;
            output += m.usage.output;
            cost += m.usage.cost.total;
          }
        }

        // Get git branch (not otherwise accessible)
        const branch = footerData.getGitBranch();

        const left = theme.fg(
          'dim',
          `↑${formatTokenCount(input)} ↓${formatTokenCount(output)} $${cost.toFixed(3)}`,
        );
        const branchStr = branch ? ` (${branch})` : '';
        const right = theme.fg('dim', `${ctx.model?.id || 'no-model'}${branchStr}`);

        const pad = ' '.repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
        return [truncateToWidth(left + pad + right, width)];
      },
    };
  };
}

export function registerFooter(pi: ExtensionAPI) {
  pi.registerFlag('customFooter', {
    description: 'Enable custom footer with token stats',
    type: 'boolean',
    default: true,
  });

  let enabled = false;

  function enable(ctx: ExtensionContext) {
    enabled = true;
    ctx.ui.setFooter(createFooterRenderer(ctx));
    ctx.ui.notify('Custom footer enabled', 'info');
  }

  function disable(ctx: ExtensionContext) {
    enabled = false;
    ctx.ui.setFooter(undefined);
    ctx.ui.notify('Default footer restored', 'info');
  }

  // Auto-enable on session start if flag is set
  pi.on('session_start', (_event, ctx) => {
    if (pi.getFlag('customFooter')) {
      enable(ctx);
    }
  });

  // Manual toggle command
  pi.registerCommand('footer', {
    description: 'Toggle custom footer',
    handler: async (_args, ctx) => {
      if (enabled) {
        disable(ctx);
      } else {
        enable(ctx);
      }
    },
  });
}
