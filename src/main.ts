import { registerSW } from 'virtual:pwa-register';
import { App } from './app/app';
import { t } from './i18n';
import { h } from './ui/dom';
import './styles/base.css';
import './styles/ribbon.css';
import './styles/workspace.css';
import './styles/menus.css';
import './styles/dialogs.css';

// iOS zooms the page into a field whose text is under 16 px when it gets the focus (the text box) and does not
// zoom back out. maximum-scale stops that; iOS still lets the user pinch-zoom the page.
const ios =
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
if (ios && viewport) viewport.content += ', maximum-scale=1';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
root.classList.add('app');
const app = new App(root);

// Service worker: the app works offline. If there is a new version, offer to reload.
const updateSW = registerSW({
  onNeedRefresh() {
    const toast = h(
      'div.toast',
      { role: 'status' },
      h('span', {}, t.update.available),
      h(
        'button.dlg-button',
        {
          type: 'button',
          onclick: async () => {
            if (app.store.state.dirty && !(await app.ui.files.confirmDiscard())) return;
            void updateSW(true);
          },
        },
        t.update.reload,
      ),
      h('button.toast-close', { type: 'button', 'aria-label': t.dialog.close, onclick: () => toast.remove() }, '✕'),
    );
    document.body.append(toast);
  },
});

// In development, accessible from the console for debugging.
if (import.meta.env.DEV) Object.assign(window, { paintcat: app });
