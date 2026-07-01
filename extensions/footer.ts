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

const SUBAGENT_MANAGER_KEY = Symbol.for('pi-subagents:manager');
const SUBAGENT_USAGE_ENTRY_TYPE = 'powerline:subagent-usage';
const SUBAGENT_POLL_MS = 500;

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

interface SubagentUsageEntry {
  agentId: string;
  total: number;
  input?: number;
  output?: number;
  cacheWrite?: number;
  status?: string;
}

interface SubagentLifecycleEvent {
  id: string;
  status?: string;
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
}

interface SubagentManagerLike {
  getRecord(id: string):
    | {
        status?: string;
        lifetimeUsage?: {
          input?: number;
          output?: number;
          cacheWrite?: number;
        };
      }
    | undefined;
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
let subagentUsageById = new Map<string, SubagentUsageEntry>();
let runningSubagentIds = new Set<string>();
let subagentPollTimer: ReturnType<typeof setInterval> | null = null;

function getSubagentManager(): SubagentManagerLike | undefined {
  return (globalThis as Record<PropertyKey, unknown>)[SUBAGENT_MANAGER_KEY] as
    SubagentManagerLike | undefined;
}

function getSubagentLifetimeTotal(
  value:
    | {
        input?: number;
        output?: number;
        cacheWrite?: number;
      }
    | null
    | undefined,
): number {
  if (!value) return 0;
  return (value.input ?? 0) + (value.output ?? 0) + (value.cacheWrite ?? 0);
}

function getPersistedSubagentTotal(): number {
  let total = 0;
  for (const entry of subagentUsageById.values()) total += entry.total;
  return total;
}

function getRunningSubagentTotal(): number {
  const manager = getSubagentManager();
  if (!manager) return 0;

  let total = 0;
  const staleIds: string[] = [];
  for (const agentId of runningSubagentIds) {
    const record = manager.getRecord(agentId);
    if (!record) {
      staleIds.push(agentId);
      continue;
    }
    total += getSubagentLifetimeTotal(record.lifetimeUsage);
    if (
      record.status &&
      ['completed', 'steered', 'aborted', 'stopped', 'error'].includes(record.status)
    ) {
      staleIds.push(agentId);
    }
  }

  for (const agentId of staleIds) runningSubagentIds.delete(agentId);
  return total;
}

function getSessionMasterTotal(
  mainInput: number,
  mainOutput: number,
  mainCacheWrite: number,
): number {
  return (
    mainInput +
    mainOutput +
    mainCacheWrite +
    getPersistedSubagentTotal() +
    getRunningSubagentTotal()
  );
}

function refreshPersistedSubagentUsage(ctx: ExtensionContext): void {
  const nextUsage = new Map<string, SubagentUsageEntry>();
  const entries = readStaleSafe(() => ctx.sessionManager.getEntries(), [] as Array<any>);

  for (const entry of entries) {
    if (entry?.type !== 'custom' || entry.customType !== SUBAGENT_USAGE_ENTRY_TYPE) continue;
    const data = entry.data as SubagentUsageEntry | undefined;
    if (!data?.agentId || typeof data.total !== 'number' || data.total <= 0) continue;
    nextUsage.set(data.agentId, data);
  }

  subagentUsageById = nextUsage;
}

function stopSubagentPolling(): void {
  if (subagentPollTimer) {
    clearInterval(subagentPollTimer);
    subagentPollTimer = null;
  }
}

function ensureSubagentPolling(enabled: boolean): void {
  if (!enabled || runningSubagentIds.size === 0) {
    stopSubagentPolling();
    return;
  }

  if (subagentPollTimer) return;
  subagentPollTimer = setInterval(() => {
    if (runningSubagentIds.size === 0) {
      stopSubagentPolling();
      return;
    }
    liveTui?.requestRender();
  }, SUBAGENT_POLL_MS);
}

function persistSubagentUsage(pi: ExtensionAPI, event: SubagentLifecycleEvent): void {
  const total = event.tokens?.total ?? 0;
  if (!event.id || total <= 0) return;

  const input = event.tokens?.input ?? 0;
  const output = event.tokens?.output ?? 0;
  const cacheWrite = Math.max(0, total - input - output);
  const data: SubagentUsageEntry = {
    agentId: event.id,
    total,
    input,
    output,
    cacheWrite,
    status: event.status,
  };

  subagentUsageById.set(event.id, data);
  pi.appendEntry(SUBAGENT_USAGE_ENTRY_TYPE, data);
}

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

        const masterTotal = getSessionMasterTotal(totalInput, totalOutput, totalCacheWrite);
        if (masterTotal > totalInput + totalOutput + totalCacheWrite) {
          statsParts.push(`Σ${formatTokens(masterTotal)}`);
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
    refreshPersistedSubagentUsage(ctx);
    refreshFooterSnapshot(ctx);
    ensureSubagentPolling(enabled);
    ctx.ui.setFooter(createFooterRenderer());
  }

  function disable(ctx: ExtensionContext) {
    enabled = false;
    liveTui = null;
    stopSubagentPolling();
    resetFooterSnapshot();
    ctx.ui.setFooter(undefined);
  }

  // enable on session start if powerline master switch + footer setting are both on
  pi.on('session_start', (_event, ctx) => {
    autoCompactEnabled = readAutoCompactEnabled(ctx.cwd);
    runningSubagentIds = new Set<string>();
    refreshPersistedSubagentUsage(ctx);
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
    refreshPersistedSubagentUsage(ctx);
    refreshFooterSnapshot(ctx);
    const s = readPowerlineSettings(ctx.cwd);
    const show = s.powerline && s.footer;
    if (show && !enabled) {
      enable(ctx);
    } else if (!show && enabled) {
      disable(ctx);
    } else if (enabled) {
      liveThinkLevel = pi.getThinkingLevel();
      ensureSubagentPolling(enabled);
      liveTui?.requestRender();
    }
  });

  // re-evaluate on /powerline command (settings changed)
  pi.events.on('powerline_settings_changed', (ctx) => {
    const c = ctx as ExtensionContext;
    refreshPersistedSubagentUsage(c);
    refreshFooterSnapshot(c);
    const s = readPowerlineSettings(c.cwd);
    const show = s.powerline && s.footer;
    if (show && !enabled) {
      enable(c);
    } else if (!show && enabled) {
      disable(c);
    } else if (enabled) {
      ensureSubagentPolling(enabled);
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
    refreshPersistedSubagentUsage(ctx);
    refreshFooterSnapshot(ctx);
    ensureSubagentPolling(enabled);
    liveTui?.requestRender();
  });

  pi.events.on('subagents:started', (event) => {
    const data = event as { id?: string };
    if (!data.id) return;
    runningSubagentIds.add(data.id);
    ensureSubagentPolling(enabled);
    liveTui?.requestRender();
  });

  const handleSubagentFinished = (event: unknown) => {
    const data = event as SubagentLifecycleEvent;
    if (!data?.id) return;
    runningSubagentIds.delete(data.id);
    persistSubagentUsage(pi, data);
    ensureSubagentPolling(enabled);
    liveTui?.requestRender();
  };

  pi.events.on('subagents:completed', handleSubagentFinished);
  pi.events.on('subagents:failed', handleSubagentFinished);

  pi.on('session_shutdown', (_event, ctx) => {
    if (enabled) disable(ctx);
    isStreaming = false;
    liveAssistantUsage = null;
    liveThinkLevel = 'off';
    runningSubagentIds = new Set<string>();
    subagentUsageById = new Map<string, SubagentUsageEntry>();
  });
}
