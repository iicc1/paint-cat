import { registerSW } from 'virtual:pwa-register';
import { App } from './app/app';
import { t } from './i18n';
import { h } from './ui/dom';
import './styles/base.css';
import './styles/ribbon.css';
import './styles/workspace.css';
import './styles/menus.css';
import './styles/dialogs.css';

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
