/**
 * Custom Footer Extension
 *
 * Mirrors the built-in footer layout: pwd line, stats line, extension statuses line.
 *
 * Token stats and context usage come from ctx.sessionManager/ctx.model/ctx.getContextUsage().
 * Git branch, provider count, extension statuses come from footerData.
 * Thinking level comes from pi.getThinkingLevel() + pi.on(thinking_level_select).
 *
 * Controlled by .pi/settings.json → customFooter (boolean, default true).
 * Toggle at runtime with /footer command.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AssistantMessage } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';

// ═══════════════════════════════════════════════════════════════════════════
// settings helpers
// ═══════════════════════════════════════════════════════════════════════════

function updateSettingsFlag(cwd: string, flagName: string, value: boolean): void {
  const settingsDir = join(cwd, '.pi');
  const settingsPath = join(settingsDir, 'settings.json');

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content || '{}');
    } catch {
      settings = {};
    }
  } else if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  settings[flagName] = value;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

function getSettingsFlag(cwd: string, flagName: string, fallback: boolean): boolean {
  const settingsPath = join(cwd, '.pi', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content || '{}');
      if (flagName in settings) return !!settings[flagName];
    } catch {
      // ignore parse errors
    }
  }
  return fallback;
}

/** Read auto-compact setting from .pi/settings.json (nested under compaction.enabled). */
function readAutoCompactEnabled(cwd: string): boolean {
  const settingsPath = join(cwd, '.pi', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content || '{}');
      if (
        settings.compaction &&
        typeof settings.compaction === 'object' &&
        'enabled' in (settings.compaction as Record<string, unknown>)
      ) {
        return !!(settings.compaction as Record<string, unknown>).enabled;
      }
    } catch {
      // ignore parse errors
    }
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// token formatting (mirrors built-in footer)
// ═══════════════════════════════════════════════════════════════════════════

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

// ═══════════════════════════════════════════════════════════════════════════
// think level display (mirrors widget.ts style)
// ═══════════════════════════════════════════════════════════════════════════

function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === '1') return true;
  if (process.env.POWERLINE_NERD_FONTS === '0') return false;
  if (process.env.GHOSTTY_RESOURCES_DIR) return true;
  const term = (process.env.TERM_PROGRAM || '').toLowerCase();
  return ['iterm', 'wezterm', 'kitty', 'ghostty', 'alacritty'].some((t) => term.includes(t));
}

const ICON_THINK = hasNerdFonts() ? '' : '';

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

const THINK_LABELS: Record<string, string> = {
  minimal: 'min',
  low: 'low',
  medium: 'med',
  high: 'high',
  xhigh: 'xhi',
};

const THINK_COLORS: Record<string, string> = {
  high: 'thinkingHigh',
  xhigh: 'thinkingXhigh',
  minimal: 'thinkingMinimal',
  low: 'thinkingLow',
  medium: 'thinkingMedium',
};

// ═══════════════════════════════════════════════════════════════════════════
// usage helpers (for fusing live streaming data with persisted entries)
// ═══════════════════════════════════════════════════════════════════════════

type SessionAssistantUsage = AssistantMessage['usage'];

function getUsageTokenTotal(usage: SessionAssistantUsage): number {
  return (
    ('totalTokens' in usage && typeof usage.totalTokens === 'number' ? usage.totalTokens : 0) ||
    usage.input + usage.output + usage.cacheRead + usage.cacheWrite
  );
}

function isSessionAssistantMessage(value: unknown): value is AssistantMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    (value as any).role === 'assistant' &&
    'usage' in value &&
    typeof (value as any).usage?.input === 'number' &&
    typeof (value as any).usage?.output === 'number'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// live state (updated by events)
// ═══════════════════════════════════════════════════════════════════════════

let liveThinkLevel = 'off';
let liveTui: any = null;
let isStreaming = false;
let liveAssistantUsage: SessionAssistantUsage | null = null;
let autoCompactEnabled = true;

// ═══════════════════════════════════════════════════════════════════════════
// footer renderer
// ═══════════════════════════════════════════════════════════════════════════

/** Sanitize text for single-line status display. */
function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

function createFooterRenderer(ctx: ExtensionContext) {
  return (tui: any, theme: any, footerData: any) => {
    liveTui = tui;
    const unsubBranch = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose() {
        liveTui = null;
        unsubBranch();
      },
      invalidate() {},
      render(width: number): string[] {
        // ── cumulative token stats from persisted entries + live streaming ──
        let totalInput = 0,
          totalOutput = 0,
          totalCacheRead = 0,
          totalCacheWrite = 0,
          totalCost = 0;
        let lastPersistedAssistant: AssistantMessage | undefined;
        for (const e of ctx.sessionManager.getEntries()) {
          if (e.type === 'message' && e.message.role === 'assistant') {
            const m = e.message as AssistantMessage;
            if (m.stopReason === 'error' || m.stopReason === 'aborted') continue;
            totalInput += m.usage.input;
            totalOutput += m.usage.output;
            totalCacheRead += m.usage.cacheRead;
            totalCacheWrite += m.usage.cacheWrite;
            totalCost += m.usage.cost.total;
            if (getUsageTokenTotal(m.usage) > 0) {
              lastPersistedAssistant = m;
            }
          }
        }

        // fuse live streaming usage (not yet persisted) on top of persisted totals
        const latestUsage = isStreaming
          ? (liveAssistantUsage ?? lastPersistedAssistant?.usage)
          : lastPersistedAssistant?.usage;
        if (isStreaming && liveAssistantUsage) {
          totalInput += liveAssistantUsage.input;
          totalOutput += liveAssistantUsage.output;
          totalCacheRead += liveAssistantUsage.cacheRead;
          totalCacheWrite += liveAssistantUsage.cacheWrite;
          totalCost += liveAssistantUsage.cost.total;
        }

        // ── context usage ──
        // During streaming, ctx.getContextUsage() may be stale; estimate from usage.
        const coreContextUsage = isStreaming && liveAssistantUsage ? null : ctx.getContextUsage();
        const contextTokens =
          coreContextUsage?.tokens ?? (latestUsage ? getUsageTokenTotal(latestUsage) : null);
        const contextWindow = coreContextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
        const contextPercent =
          contextTokens !== null ? ((contextTokens / contextWindow) * 100).toFixed(1) : '?';

        // ── stats + model ──
        // context % with threshold coloring (always first)
        const contextPercentNum =
          contextTokens !== null && contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0;
        const contextPercentDisplay =
          contextPercent === '?'
            ? `?/${formatTokens(contextWindow)}`
            : `${contextPercent}%/${formatTokens(contextWindow)}${autoCompactEnabled ? ' (auto)' : ''}`;
        let contextStr: string;
        if (contextPercentNum > 90) {
          contextStr = theme.fg('error', contextPercentDisplay);
        } else if (contextPercentNum > 70) {
          contextStr = theme.fg('warning', contextPercentDisplay);
        } else {
          contextStr = contextPercentDisplay;
        }

        // token stats (dim)
        const tokenParts: string[] = [];
        if (totalInput) tokenParts.push(`↑${formatTokens(totalInput)}`);
        if (totalOutput) tokenParts.push(`↓${formatTokens(totalOutput)}`);
        if (totalCacheRead) tokenParts.push(`R${formatTokens(totalCacheRead)}`);
        if (totalCacheWrite) tokenParts.push(`W${formatTokens(totalCacheWrite)}`);

        const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
        if (totalCost || usingSubscription) {
          const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? ' (sub)' : ''}`;
          tokenParts.push(costStr);
        }

        const dimTokenStats =
          tokenParts.length > 0 ? ` ${theme.fg('dim', tokenParts.join(' '))}` : '';
        let statsLeft = contextStr + dimTokenStats;
        let statsLeftWidth = visibleWidth(statsLeft);
        if (statsLeftWidth > width) {
          statsLeft = truncateToWidth(statsLeft, width, '...');
          statsLeftWidth = visibleWidth(statsLeft);
        }

        // ── stats line layout: left (context colored + token dim) + padding (dim) + right (colored think level) ──

        // right side: think level only, colored (omitted when model lacks reasoning)
        let rightSidePlain = '';
        if (ctx.model?.reasoning) {
          const tl = liveThinkLevel || 'off';
          const label = THINK_LABELS[tl] ?? tl;
          rightSidePlain = withIcon(ICON_THINK, `think:${label}`);
        }

        const minPad = 2;
        let paddingLen: number;
        let rightFinal: string;

        if (statsLeftWidth + minPad + visibleWidth(rightSidePlain) <= width) {
          paddingLen = width - statsLeftWidth - visibleWidth(rightSidePlain);
          rightFinal = rightSidePlain;
        } else {
          const avail = width - statsLeftWidth - minPad;
          if (avail > 0) {
            rightFinal = truncateToWidth(rightSidePlain, avail, '');
            paddingLen = width - statsLeftWidth - visibleWidth(rightFinal);
          } else {
            rightFinal = '';
            paddingLen = width - statsLeftWidth;
          }
        }

        const dimPadding = paddingLen > 0 ? theme.fg('dim', ' '.repeat(paddingLen)) : '';
        let coloredRight = '';
        if (rightFinal) {
          const tl = liveThinkLevel || 'off';
          coloredRight = theme.fg(THINK_COLORS[tl] ?? 'thinkingOff', rightFinal);
        }

        const statsLine = statsLeft + dimPadding + coloredRight;

        const lines = [statsLine];

        // ── line 3: extension statuses ──
        const extensionStatuses = footerData.getExtensionStatuses() as Map<string, string>;
        if (extensionStatuses.size > 0) {
          const sorted = Array.from(extensionStatuses.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, text]) => sanitizeStatusText(text));
          const statusLine = sorted.join(' ');
          lines.push(truncateToWidth(statusLine, width, theme.fg('dim', '...')));
        }

        return lines;
      },
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// module registration
// ═══════════════════════════════════════════════════════════════════════════

export function registerFooter(pi: ExtensionAPI) {
  pi.registerFlag('customFooter', {
    description: 'Enable custom footer with token stats',
    type: 'boolean',
    default: true,
  });

  let enabled = false;

  function enable(ctx: ExtensionContext) {
    enabled = true;
    liveThinkLevel = pi.getThinkingLevel();
    ctx.ui.setFooter(createFooterRenderer(ctx));
  }

  function disable(ctx: ExtensionContext) {
    enabled = false;
    liveTui = null;
    ctx.ui.setFooter(undefined);
  }

  // auto-enable on session start if flag is set
  pi.on('session_start', (_event, ctx) => {
    // read auto-compact setting from .pi/settings.json (nested under compaction.enabled)
    autoCompactEnabled = readAutoCompactEnabled(ctx.cwd);
    if (getSettingsFlag(ctx.cwd, 'customFooter', true)) {
      enable(ctx);
    }
  });

  // track thinking level changes for footer display
  pi.on('thinking_level_select', (event) => {
    if (!enabled) return;
    liveThinkLevel = event.level;
    liveTui?.requestRender();
  });

  // model switch may affect reasoning support / provider count
  pi.on('model_select', () => {
    if (!enabled) return;
    liveThinkLevel = pi.getThinkingLevel();
    liveTui?.requestRender();
  });

  // ── real-time token updates during streaming ──

  pi.on('agent_start', () => {
    isStreaming = true;
    liveAssistantUsage = null;
  });

  pi.on('message_update', (event) => {
    if (!enabled) return;
    if (isSessionAssistantMessage(event.message)) {
      liveAssistantUsage = event.message.usage;
      liveTui?.requestRender();
    }
  });

  pi.on('message_end', (event) => {
    isStreaming = false;
    if (!enabled) return;
    if (isSessionAssistantMessage(event.message)) {
      liveAssistantUsage =
        event.message.stopReason === 'error' || event.message.stopReason === 'aborted'
          ? null
          : event.message.usage;
    }
    liveTui?.requestRender();
  });

  return {
    toggle(ctx: ExtensionContext): string {
      if (enabled) {
        disable(ctx);
        updateSettingsFlag(ctx.cwd, 'customFooter', false);
        return 'powerline footer disabled';
      } else {
        enable(ctx);
        updateSettingsFlag(ctx.cwd, 'customFooter', true);
        return 'powerline footer enabled';
      }
    },
    get enabled(): boolean {
      return enabled;
    },
  };
}
