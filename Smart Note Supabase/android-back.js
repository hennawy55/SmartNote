import { App } from '@capacitor/app';

App.addListener('backButton', () => {
  window.dispatchEvent(new CustomEvent('smartnote-back-button'));
});
