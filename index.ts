import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { registerEditor } from './editor.ts';
import { registerFooter } from './footer.ts';
import { registerHeader } from './header.ts';

export default function (pi: ExtensionAPI) {
  registerEditor(pi);
  registerFooter(pi);
  registerHeader(pi);
}
