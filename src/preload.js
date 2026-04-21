const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeMonitor', {
  getState: () => ipcRenderer.invoke('monitor:get-state'),
  refresh: () => ipcRenderer.invoke('monitor:refresh'),
  login: () => ipcRenderer.invoke('monitor:login'),
  togglePin: () => ipcRenderer.invoke('monitor:toggle-pin'),
  windowAction: (action) => ipcRenderer.invoke('monitor:window-action', action),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('monitor:state', listener);
    return () => ipcRenderer.removeListener('monitor:state', listener);
  }
});
