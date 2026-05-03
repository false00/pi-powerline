import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { registerEditor } from './editor.ts';
import { registerFooter } from './footer.ts';
import { registerHeader } from './header.ts';

export default function (pi: ExtensionAPI) {
  const editor = registerEditor(pi);
  const footer = registerFooter(pi);
  const header = registerHeader(pi);

  pi.registerCommand('powerline', {
    description: 'Toggle powerline modules: editor, footer, header',
    handler: async (args, ctx) => {
      const module = args?.trim().toLowerCase();
      let msg: string;
      switch (module) {
        case 'editor':
          msg = editor.toggle(ctx);
          break;
        case 'footer':
          msg = footer.toggle(ctx);
          break;
        case 'header':
          msg = header.toggle(ctx);
          break;
        default:
          ctx.ui.notify(`Usage: /powerline <editor|footer|header>`, 'warning');
          return;
      }
      ctx.ui.notify(msg, 'info');
    },
  });
}
