/**
 * Shared breadcrumb display helpers
 *
 * Exports icons and helper functions used by widget.ts and editor.ts
 * to render the model→folder breadcrumb.
 */
import { basename } from 'node:path';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { hasNerdFonts, hexFg, readStaleSafe, withIcon } from './utils.ts';

const NERD = hasNerdFonts();

export const ICON_MODEL = NERD ? '\uF4BC' : '';
export const ICON_FOLDER = NERD ? '\uF115' : '';
export const SEP = NERD ? '\uf054' : '/';

// ═══════════════════════════════════════════════════════════════════════════
// breadcrumb data
// ═══════════════════════════════════════════════════════════════════════════

export interface BreadcrumbData {
  modelName: string;
  folder: string;
  modelText: string; // icon + modelName
  folderText: string; // icon + folder
}

export interface BreadcrumbContextLike {
  cwd?: string;
  model?: {
    name?: string;
    id?: string;
  } | null;
}

export function getBreadcrumbData(ctx: BreadcrumbContextLike | null): BreadcrumbData {
  const cwd = readStaleSafe(() => ctx?.cwd ?? process.cwd(), process.cwd());
  const model = readStaleSafe(() => ctx?.model ?? null, null);
  const folder = basename(cwd) || cwd;
  const modelName = model?.name || model?.id || 'no-model';

  return {
    modelName,
    folder,
    modelText: withIcon(ICON_MODEL, modelName),
    folderText: withIcon(ICON_FOLDER, folder),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// breadcrumb info renderer (model → folder, colored)
// ═══════════════════════════════════════════════════════════════════════════

/** Render the "model→folder" breadcrumb info string. Optionally append ANSI reset. */
export function renderBreadcrumbInfo(data: BreadcrumbData, theme: Theme, reset = false): string {
  const line =
    hexFg('#d787af', data.modelText) +
    theme.fg('dim', ` ${SEP} `) +
    hexFg('#00afaf', data.folderText);
  return reset ? line + '\x1b[0m' : line;
}
