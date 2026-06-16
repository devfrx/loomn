import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');

// Diagnostica di boot (Piano 9a): prova il giro IPC e logga in DevTools. Verra rimossa con la
// UI reale (Piano 10). Le invarianti di sicurezza sono garantite dalle webPreferences del main.
const globals = globalThis as { require?: unknown; process?: unknown };
const noNode = globals.require === undefined && globals.process === undefined;
console.log(`[renderer] isolated=${typeof window.loomn !== 'undefined'} noNode=${noNode}`);

window.loomn.onReadModelPush((push) => {
  console.log(`[renderer] read-model push v${push.version}: ${push.summary}`);
});

void window.loomn.ping({ text: 'boot' }).then((res) => {
  console.log(`[renderer] ping -> ok=${res.ok} upper=${res.upper}`);
});
