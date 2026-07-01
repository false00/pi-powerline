/**
 * Custom Footer Extension
 *
 * Mirrors the built-in footer layout: pwd line, stats line, extension statuses line.
 *
 * Token stats and context usage come from ctx.sessionManager/ctx.model/ctx.getContextUsage().
 * Git branch, provider count, extension statuses come from footerData.
 * Thinking level comes from pi.getThinkingLevel() + pi.on(thinking_level_select).
 *
 * Controlled by .pi/settings.json → footer (boolean, default true).
 * Toggle at runtime via /powerline footer:on / footer:off.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { hasNerdFonts, hexFg, readStaleSafe, withIcon } from './utils.ts';
import { readPowerlineSettings } from './settings.ts';

// ═══════════════════════════════════════════════════════════════════════════
// auto-compact detection (nested under compaction.enabled, not powerline)
// ═══════════════════════════════════════════════════════════════════════════
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
// think level display
// ═══════════════════════════════════════════════════════════════════════════

const ICON_THINK = hasNerdFonts() ? '' : '';
const ICON_GIT = hasNerdFonts() ? '' : '⎇';

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

function getCacheHitRate(usage: SessionAssistantUsage): number | undefined {
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  return promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : undefined;
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

interface FooterSnapshot {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  lastPersistedUsage: SessionAssistantUsage | null;
  contextTokens: number | null;
  contextWindow: number;
  modelReasoning: boolean;
  usingSubscription: boolean;
}

const EMPTY_FOOTER_SNAPSHOT: FooterSnapshot = {
  totalInput: 0,
  totalOutput: 0,
  totalCacheRead: 0,
  totalCacheWrite: 0,
  totalCost: 0,
  lastPersistedUsage: null,
  contextTokens: null,
  contextWindow: 0,
  modelReasoning: false,
  usingSubscription: false,
};

let liveThinkLevel = 'off';
let liveTui: any = null;
let isStreaming = false;
let liveAssistantUsage: SessionAssistantUsage | null = null;
let autoCompactEnabled = true;
let footerSnapshot: FooterSnapshot = { ...EMPTY_FOOTER_SNAPSHOT };

function resetFooterSnapshot(): void {
  footerSnapshot = { ...EMPTY_FOOTER_SNAPSHOT };
}

function refreshFooterSnapshot(ctx: ExtensionContext): void {
  const nextSnapshot: FooterSnapshot = { ...EMPTY_FOOTER_SNAPSHOT };
  const entries = readStaleSafe(() => ctx.sessionManager.getEntries(), [] as Array<any>);

  for (const entry of entries) {
    if (entry?.type !== 'message' || entry.message?.role !== 'assistant') continue;

    const message = entry.message as AssistantMessage;
    if (message.stopReason === 'error' || message.stopReason === 'aborted') continue;

    nextSnapshot.totalInput += message.usage.input;
    nextSnapshot.totalOutput += message.usage.output;
    nextSnapshot.totalCacheRead += message.usage.cacheRead;
    nextSnapshot.totalCacheWrite += message.usage.cacheWrite;
    nextSnapshot.totalCost += message.usage.cost.total;
    if (getUsageTokenTotal(message.usage) > 0) {
      nextSnapshot.lastPersistedUsage = message.usage;
    }
  }

  const model = readStaleSafe(() => ctx.model ?? null, null);
  nextSnapshot.contextWindow = model?.contextWindow ?? 0;
  nextSnapshot.modelReasoning = !!model?.reasoning;
  nextSnapshot.usingSubscription = model
    ? readStaleSafe(() => ctx.modelRegistry.isUsingOAuth(model), false)
    : false;

  const contextUsage = readStaleSafe(() => ctx.getContextUsage(), null as any);
  nextSnapshot.contextTokens =
    contextUsage?.tokens ??
    (nextSnapshot.lastPersistedUsage ? getUsageTokenTotal(nextSnapshot.lastPersistedUsage) : null);
  nextSnapshot.contextWindow = contextUsage?.contextWindow ?? nextSnapshot.contextWindow;

  footerSnapshot = nextSnapshot;
}

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

function createFooterRenderer() {
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
        let totalInput = footerSnapshot.totalInput;
        let totalOutput = footerSnapshot.totalOutput;
        let totalCacheRead = footerSnapshot.totalCacheRead;
        let totalCacheWrite = footerSnapshot.totalCacheWrite;
        let totalCost = footerSnapshot.totalCost;

        // fuse live streaming usage (not yet persisted) on top of persisted totals
        const latestUsage = isStreaming
          ? (liveAssistantUsage ?? footerSnapshot.lastPersistedUsage ?? undefined)
          : (footerSnapshot.lastPersistedUsage ?? undefined);
        if (isStreaming && liveAssistantUsage) {
          totalInput += liveAssistantUsage.input;
          totalOutput += liveAssistantUsage.output;
          totalCacheRead += liveAssistantUsage.cacheRead;
          totalCacheWrite += liveAssistantUsage.cacheWrite;
          totalCost += liveAssistantUsage.cost.total;
        }

        // ── context usage ──
        const contextTokens =
          isStreaming && liveAssistantUsage
            ? getUsageTokenTotal(liveAssistantUsage)
            : (footerSnapshot.contextTokens ??
              (latestUsage ? getUsageTokenTotal(latestUsage) : null));
        const contextWindow = footerSnapshot.contextWindow;
        const contextPercent =
          contextTokens !== null && contextWindow > 0
            ? ((contextTokens / contextWindow) * 100).toFixed(1)
            : '?';

        // ── git branch (leftmost, before stats) ──
        const branch = footerData.getGitBranch();
        const gitSegment = branch ? hexFg('#5faf5f', withIcon(ICON_GIT, branch)) : '';
        const gitFull = gitSegment ? gitSegment + ' ' : '';
        const gitFullWidth = gitSegment ? visibleWidth(gitSegment) + 1 : 0;

        // ── stats + model ──
        const statsParts: string[] = [];

        // context % with threshold coloring (always first)
        const contextPercentNum =
          contextTokens !== null && contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0;
        const contextPercentDisplay =
          contextPercent === '?'
            ? `?/${formatTokens(contextWindow)}`
            : `${contextPercent}%/${formatTokens(contextWindow)}${autoCompactEnabled ? ' (auto)' : ''}`;
        let contextPercentStr: string;
        if (contextPercentNum > 90) {
          contextPercentStr = theme.fg('error', contextPercentDisplay);
        } else if (contextPercentNum > 70) {
          contextPercentStr = theme.fg('warning', contextPercentDisplay);
        } else {
          contextPercentStr = contextPercentDisplay;
        }
        statsParts.push(contextPercentStr);

        if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
        if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
        if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
        if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);
        const latestCacheHitRate = latestUsage ? getCacheHitRate(latestUsage) : undefined;
        if ((totalCacheRead > 0 || totalCacheWrite > 0) && latestCacheHitRate !== undefined) {
          statsParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
        }

        if (totalCost || footerSnapshot.usingSubscription) {
          const costStr = `$${totalCost.toFixed(3)}${footerSnapshot.usingSubscription ? ' (sub)' : ''}`;
          statsParts.push(costStr);
        }

        let statsLeft = statsParts.join(' ');
        let statsLeftWidth = visibleWidth(statsLeft);
        if (statsLeftWidth > width) {
          statsLeft = truncateToWidth(statsLeft, width, '...');
          statsLeftWidth = visibleWidth(statsLeft);
        }

        // ── stats line layout: git (green) + left (dim) + padding (dim) + right (colored think level) ──
        const dimLeft = theme.fg('dim', statsLeft);

        // right side: think level only, colored (omitted when model lacks reasoning)
        let rightSidePlain = '';
        if (footerSnapshot.modelReasoning) {
          const tl = liveThinkLevel || 'off';
          const label = THINK_LABELS[tl] ?? tl;
          rightSidePlain = withIcon(ICON_THINK, label);
        }
        const rightWidth = visibleWidth(rightSidePlain);

        const minPad = 2;
        const thinkToken = THINK_COLORS[liveThinkLevel || 'off'] ?? 'thinkingOff';
        const coloredRight = rightSidePlain ? theme.fg(thinkToken, rightSidePlain) : '';
        let statsLine: string;

        const totalBase = gitFullWidth + statsLeftWidth + minPad + rightWidth;
        if (totalBase <= width) {
          const pad = width - gitFullWidth - statsLeftWidth - rightWidth;
          const dimPadding = pad > 0 ? theme.fg('dim', ' '.repeat(pad)) : '';
          statsLine = gitFull + dimLeft + dimPadding + coloredRight;
        } else if (gitFullWidth + minPad + rightWidth <= width) {
          const availStats = width - gitFullWidth - minPad - rightWidth;
          const statsTrimmed = availStats > 0 ? truncateToWidth(statsLeft, availStats, '') : '';
          const statsTrimmedWidth = visibleWidth(statsTrimmed);
          const pad = width - gitFullWidth - statsTrimmedWidth - rightWidth;
          const dimPadding = pad > 0 ? theme.fg('dim', ' '.repeat(pad)) : '';
          statsLine = gitFull + theme.fg('dim', statsTrimmed) + dimPadding + coloredRight;
        } else {
          const availStats = width - minPad;
          const statsTrimmed = availStats > 0 ? truncateToWidth(statsLeft, availStats, '') : '';
          statsLine = theme.fg('dim', statsTrimmed);
        }

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
  let enabled = false;

  function enable(ctx: ExtensionContext) {
    enabled = true;
    liveThinkLevel = pi.getThinkingLevel();
    refreshFooterSnapshot(ctx);
    ctx.ui.setFooter(createFooterRenderer());
  }

  function disable(ctx: ExtensionContext) {
    enabled = false;
    liveTui = null;
    resetFooterSnapshot();
    ctx.ui.setFooter(undefined);
  }

  // enable on session start if powerline master switch + footer setting are both on
  pi.on('session_start', (_event, ctx) => {
    autoCompactEnabled = readAutoCompactEnabled(ctx.cwd);
    refreshFooterSnapshot(ctx);
    const s = readPowerlineSettings(ctx.cwd);
    if (s.powerline && s.footer) {
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
  pi.on('model_select', (_event, ctx) => {
    refreshFooterSnapshot(ctx);
    const s = readPowerlineSettings(ctx.cwd);
    const show = s.powerline && s.footer;
    if (show && !enabled) {
      enable(ctx);
    } else if (!show && enabled) {
      disable(ctx);
    } else if (enabled) {
      liveThinkLevel = pi.getThinkingLevel();
      liveTui?.requestRender();
    }
  });

  // re-evaluate on /powerline command (settings changed)
  pi.events.on('powerline_settings_changed', (ctx) => {
    const c = ctx as ExtensionContext;
    refreshFooterSnapshot(c);
    const s = readPowerlineSettings(c.cwd);
    const show = s.powerline && s.footer;
    if (show && !enabled) {
      enable(c);
    } else if (!show && enabled) {
      disable(c);
    } else if (enabled) {
      liveTui?.requestRender();
    }
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

  pi.on('turn_end', (_event, ctx) => {
    if (!enabled) return;
    refreshFooterSnapshot(ctx);
    liveTui?.requestRender();
  });

  pi.on('session_shutdown', (_event, ctx) => {
    if (enabled) disable(ctx);
    isStreaming = false;
    liveAssistantUsage = null;
    liveThinkLevel = 'off';
  });
}
