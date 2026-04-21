const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeMonitor', {
  getState: () => ipcRenderer.invoke('monitor:get-state'),
  refresh: () => ipcRenderer.invoke('monitor:refresh'),
  login: () => ipcRenderer.invoke('monitor:login'),
  togglePin: () => ipcRenderer.invoke('monitor:toggle-pin'),
  updateSettings: (settings) => ipcRenderer.invoke('monitor:update-settings', settings),
  setSettingsExpanded: (expanded) => ipcRenderer.invoke('monitor:set-settings-expanded', expanded),
  resizeWindowToContent: (contentHeight) => ipcRenderer.invoke('monitor:resize-window-to-content', contentHeight),
  windowAction: (action) => ipcRenderer.invoke('monitor:window-action', action),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('monitor:state', listener);
    return () => ipcRenderer.removeListener('monitor:state', listener);
  }
});
