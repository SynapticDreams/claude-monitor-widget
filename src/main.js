const { app, BrowserWindow, ipcMain, nativeTheme, Tray, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

const CLAUDE_PARTITION = 'persist:claude-monitor';
const CLAUDE_USAGE_URL = 'https://claude.ai/settings/usage';
const STATE_PATH = path.join(app.getPath('userData'), 'widget-state.json');

let mainWindow;
let authWindow;
let tray;
let refreshTimer;

const state = {
  connected: false,
  loading: false,
  alwaysOnTop: false,
  lastUpdated: null,
  lastError: null,
  metrics: {
    currentSessionPercent: null,
    weeklyLimitPercent: null,
    elapsed: null,
    resetsIn: null,
    resetsAt: null,
    currentSessionLabel: 'CURRENT SESSION',
    weeklyLimitLabel: 'WEEKLY LIMIT'
  }
};

function loadPersistedState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return;
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    Object.assign(state, {
      alwaysOnTop: Boolean(data.alwaysOnTop),
      lastUpdated: data.lastUpdated || null,
      metrics: { ...state.metrics, ...(data.metrics || {}) }
    });
  } catch (error) {
    console.warn('Failed to load persisted state:', error.message);
  }
}

function savePersistedState() {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(
      STATE_PATH,
      JSON.stringify(
        {
          alwaysOnTop: state.alwaysOnTop,
          lastUpdated: state.lastUpdated,
          metrics: state.metrics
        },
        null,
        2
      ),
      'utf8'
    );
  } catch (error) {
    console.warn('Failed to save state:', error.message);
  }
}

function getRendererState() {
  return {
    ...state,
    themeSource: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  };
}

function broadcastState() {
  savePersistedState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('monitor:state', getRendererState());
  }
  updateTrayMenu();
}

function setLoading(loading, lastError = null) {
  state.loading = loading;
  if (lastError !== null) {
    state.lastError = lastError;
  }
  broadcastState();
}

function setMetrics(metrics) {
  state.connected = true;
  state.loading = false;
  state.lastError = null;
  state.lastUpdated = new Date().toISOString();
  state.metrics = { ...state.metrics, ...metrics };
  broadcastState();
}

function setDisconnected(reason = 'Not connected to Claude yet.') {
  state.connected = false;
  state.loading = false;
  state.lastError = reason;
  broadcastState();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 570,
    height: 190,
    minWidth: 520,
    minHeight: 180,
    maxHeight: 260,
    frame: false,
    transparent: false,
    resizable: true,
    fullscreenable: false,
    maximizable: false,
    show: false,
    backgroundColor: '#131425',
    title: 'Claude Monitor Widget',
    alwaysOnTop: state.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    broadcastState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'ui', 'trayTemplate.png'));
  } catch {
    tray = null;
    return;
  }

  tray.setToolTip('Claude Monitor Widget');
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const menu = Menu.buildFromTemplate([
    {
      label: state.connected
        ? `Connected • ${state.metrics.currentSessionPercent ?? '--'}% / ${state.metrics.weeklyLimitPercent ?? '--'}%`
        : 'Not connected',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Refresh now',
      click: () => refreshUsage({ interactive: false })
    },
    {
      label: authWindow && !authWindow.isDestroyed() ? 'Show Claude login' : 'Sign in to Claude',
      click: () => openAuthWindow()
    },
    {
      label: state.alwaysOnTop ? 'Unpin widget' : 'Pin widget',
      click: () => toggleAlwaysOnTop()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(menu);
}

function getClaudeSession() {
  return session.fromPartition(CLAUDE_PARTITION);
}

function openAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.show();
    authWindow.focus();
    return authWindow;
  }

  authWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 960,
    minHeight: 700,
    autoHideMenuBar: true,
    title: 'Sign in to Claude',
    backgroundColor: '#0f1224',
    webPreferences: {
      partition: CLAUDE_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  authWindow.loadURL(CLAUDE_USAGE_URL);

  const maybeScrapeAfterLoad = async () => {
    try {
      const url = authWindow?.webContents?.getURL() || '';
      if (!/claude\.ai/i.test(url)) return;
      await attemptScrape(authWindow, { closeWhenDone: false });
    } catch (error) {
      console.warn('Interactive scrape attempt failed:', error.message);
    }
  };

  authWindow.webContents.on('did-finish-load', maybeScrapeAfterLoad);
  authWindow.webContents.on('did-navigate-in-page', maybeScrapeAfterLoad);
  authWindow.webContents.on('did-navigate', maybeScrapeAfterLoad);

  authWindow.on('closed', () => {
    authWindow = null;
    broadcastState();
  });

  return authWindow;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getScraperSource() {
  const scraperPath = path.join(__dirname, 'scraper.js');
  return fs.readFileSync(scraperPath, 'utf8');
}

async function attemptScrape(targetWindow, { closeWhenDone }) {
  const scraper = getScraperSource();
  const delays = [1200, 2800, 4500];

  for (const delay of delays) {
    await wait(delay);
    if (!targetWindow || targetWindow.isDestroyed()) return null;

    try {
      const result = await targetWindow.webContents.executeJavaScript(scraper, true);

      if (result?.ok) {
        setMetrics(result.metrics);
        if (closeWhenDone && !targetWindow.isDestroyed()) {
          targetWindow.close();
        }
        return result.metrics;
      }

      if (result?.needsAuth) {
        if (closeWhenDone && !targetWindow.isDestroyed()) {
          targetWindow.close();
        }
        setDisconnected('Sign in to Claude, then open the widget again or click Refresh.');
        return null;
      }
    } catch (error) {
      console.warn(`Scrape attempt after ${delay}ms failed:`, error.message);
    }
  }

  if (closeWhenDone && targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.close();
  }

  setDisconnected('Unable to read Claude usage details. The page layout may have changed.');
  return null;
}

async function refreshUsage({ interactive = false } = {}) {
  setLoading(true, null);

  if (interactive) {
    const win = openAuthWindow();
    win.show();
    win.focus();
    state.lastError = 'Sign in to Claude if prompted. The widget will sync automatically once the usage page is visible.';
    broadcastState();
    return;
  }

  let scrapeWindow;
  try {
    scrapeWindow = new BrowserWindow({
      show: false,
      width: 1200,
      height: 850,
      webPreferences: {
        partition: CLAUDE_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    await scrapeWindow.loadURL(CLAUDE_USAGE_URL);
    const result = await attemptScrape(scrapeWindow, { closeWhenDone: true });

    if (!result && !state.lastError) {
      setDisconnected('Could not refresh Claude usage.');
    }
  } catch (error) {
    if (scrapeWindow && !scrapeWindow.isDestroyed()) {
      scrapeWindow.close();
    }
    setDisconnected(`Refresh failed: ${error.message}`);
  }
}

function toggleAlwaysOnTop() {
  state.alwaysOnTop = !state.alwaysOnTop;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(state.alwaysOnTop, 'screen-saver');
  }
  broadcastState();
}

function startRefreshLoop() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshUsage({ interactive: false });
  }, 5 * 60 * 1000);
}

app.whenReady().then(() => {
  loadPersistedState();
  createMainWindow();
  createTray();
  startRefreshLoop();

  nativeTheme.themeSource = 'dark';

  ipcMain.handle('monitor:get-state', async () => getRendererState());
  ipcMain.handle('monitor:refresh', async () => {
    await refreshUsage({ interactive: false });
    return getRendererState();
  });
  ipcMain.handle('monitor:login', async () => {
    await refreshUsage({ interactive: true });
    return getRendererState();
  });
  ipcMain.handle('monitor:toggle-pin', async () => {
    toggleAlwaysOnTop();
    return getRendererState();
  });
  ipcMain.handle('monitor:window-action', async (_event, action) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;

    if (action === 'minimize') mainWindow.minimize();
    if (action === 'toggle-maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
    if (action === 'close') mainWindow.close();
    return getRendererState();
  });

  refreshUsage({ interactive: false });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  clearInterval(refreshTimer);
  savePersistedState();
});
