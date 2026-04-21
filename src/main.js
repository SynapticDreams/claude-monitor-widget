const { app, BrowserWindow, ipcMain, nativeTheme, Tray, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

const CLAUDE_PARTITION = 'persist:claude-monitor';
const CLAUDE_USAGE_URL = 'https://claude.ai/settings/usage';
const LOCAL_APP_DATA_PATH = path.join(process.cwd(), '.claude-monitor-data');

app.commandLine.appendSwitch('no-proxy-server');
app.commandLine.appendSwitch('proxy-server', 'direct://');
app.commandLine.appendSwitch('proxy-bypass-list', '*');
app.setPath('userData', LOCAL_APP_DATA_PATH);
app.setPath('sessionData', path.join(LOCAL_APP_DATA_PATH, 'session'));

const STATE_PATH = path.join(app.getPath('userData'), 'widget-state.json');
const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.ico');
const APP_ICON = fs.existsSync(ICON_PATH) ? ICON_PATH : undefined;
const DEFAULT_WINDOW_WIDTH = 480;
const DEFAULT_WINDOW_HEIGHT = 210;
const EXPANDED_WINDOW_HEIGHT = 320;
const MIN_WINDOW_HEIGHT = 120;
const REFRESH_INTERVAL_OPTIONS = {
  15000: '15s',
  30000: '30s',
  60000: '1m',
  120000: '2m',
  300000: '5m',
  600000: '10m',
  1800000: '30m'
};

let mainWindow;
let authWindow;
let tray;
let refreshTimer;
let claudeSessionReady;
let refreshInFlight = null;
let authWindowShouldStayVisible = false;

const state = {
  connected: false,
  loading: false,
  alwaysOnTop: false,
  refreshIntervalMs: 300000,
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
    const persistedRefreshInterval = Number(data.refreshIntervalMs);
    Object.assign(state, {
      alwaysOnTop: Boolean(data.alwaysOnTop),
      refreshIntervalMs: REFRESH_INTERVAL_OPTIONS[persistedRefreshInterval] ? persistedRefreshInterval : state.refreshIntervalMs,
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
          refreshIntervalMs: state.refreshIntervalMs,
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
    defaultWindowHeight: DEFAULT_WINDOW_HEIGHT,
    expandedWindowHeight: EXPANDED_WINDOW_HEIGHT,
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
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: DEFAULT_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    maxHeight: EXPANDED_WINDOW_HEIGHT,
    frame: false,
    transparent: false,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    show: false,
    icon: APP_ICON,
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
  const refreshLabel = REFRESH_INTERVAL_OPTIONS[state.refreshIntervalMs] || '5m';

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
      label: `Auto-refresh: ${refreshLabel}`,
      enabled: false
    },
    {
      label: authWindow && !authWindow.isDestroyed() ? 'Show Claude login' : 'Sign in to Claude',
      click: () => ensureClaudeUsageWindow({ show: true })
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

async function ensureClaudeSession() {
  const claudeSession = getClaudeSession();

  if (!claudeSessionReady) {
    claudeSessionReady = claudeSession
      .setProxy({ mode: 'direct' })
      .catch((error) => {
        console.warn('Failed to configure direct proxy mode:', error.message);
      });
  }

  await claudeSessionReady;
  return claudeSession;
}

async function openAuthWindow() {
  await ensureClaudeSession();

  if (authWindow && !authWindow.isDestroyed()) {
    return authWindow;
  }

  authWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 960,
    minHeight: 700,
    show: false,
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
    authWindowShouldStayVisible = false;
    broadcastState();
  });

  return authWindow;
}

function hasOpenAuthWindow() {
  return Boolean(authWindow && !authWindow.isDestroyed());
}

async function ensureClaudeUsageWindow({ show = false } = {}) {
  const win = await openAuthWindow();
  authWindowShouldStayVisible = Boolean(show);
  if (show) {
    win.show();
    win.focus();
  } else if (win.isVisible()) {
    win.hide();
  }
  return win;
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
        if (!authWindowShouldStayVisible && !targetWindow.isDestroyed() && targetWindow.isVisible()) {
          targetWindow.hide();
        }
        if (closeWhenDone && !targetWindow.isDestroyed()) {
          targetWindow.close();
        }
        return result.metrics;
      }

      if (result?.needsAuth) {
        if (!authWindowShouldStayVisible && !targetWindow.isDestroyed()) {
          targetWindow.show();
          targetWindow.focus();
          authWindowShouldStayVisible = true;
        }
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
  if (refreshInFlight) {
    await refreshInFlight;
    return getRendererState();
  }

  refreshInFlight = (async () => {
    setLoading(true, null);

    if (interactive) {
      const win = await ensureClaudeUsageWindow({ show: true });
      state.lastError = 'Sign in to Claude if prompted. The widget will sync automatically once the usage page is visible.';
      broadcastState();
      return getRendererState();
    }

    try {
      const win = await ensureClaudeUsageWindow({ show: false });

      if (!win || win.isDestroyed()) {
        setDisconnected('Could not open Claude usage window.');
        return getRendererState();
      }

      const currentUrl = win.webContents.getURL() || '';
      if (!/claude\.ai\/settings\/usage/i.test(currentUrl)) {
        await win.loadURL(CLAUDE_USAGE_URL);
      } else {
        await win.webContents.reloadIgnoringCache();
      }

      const result = await attemptScrape(win, { closeWhenDone: false });
      if (!result && !state.lastError) {
        setDisconnected('Could not refresh Claude usage.');
      }
    } catch (error) {
      setDisconnected(`Refresh failed: ${error.message}`);
    }

    return getRendererState();
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function toggleAlwaysOnTop() {
  setAlwaysOnTop(!state.alwaysOnTop);
}

function setAlwaysOnTop(alwaysOnTop) {
  state.alwaysOnTop = Boolean(alwaysOnTop);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(state.alwaysOnTop, 'screen-saver');
  }
  broadcastState();
}

function setRefreshInterval(refreshIntervalMs) {
  const parsed = Number(refreshIntervalMs);
  if (!REFRESH_INTERVAL_OPTIONS[parsed]) {
    return getRendererState();
  }

  state.refreshIntervalMs = parsed;
  startRefreshLoop();
  broadcastState();
  return getRendererState();
}

function startRefreshLoop() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshUsage({ interactive: false });
  }, state.refreshIntervalMs);
}

function resizeWindow(height) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setResizable(true);
  mainWindow.setSize(DEFAULT_WINDOW_WIDTH, height, false);
  mainWindow.setResizable(false);
}

function setExpandedState(expanded) {
  resizeWindow(expanded ? EXPANDED_WINDOW_HEIGHT : DEFAULT_WINDOW_HEIGHT);
}

function resizeWindowToContent(contentHeight) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  const targetHeight = Math.max(
    MIN_WINDOW_HEIGHT,
    Math.min(EXPANDED_WINDOW_HEIGHT, Math.ceil(Number(contentHeight) || DEFAULT_WINDOW_HEIGHT))
  );

  resizeWindow(targetHeight);
  return true;
}

function closeAuxiliaryWindows() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
  }
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
  ipcMain.handle('monitor:update-settings', async (_event, settings = {}) => {
    if (Object.prototype.hasOwnProperty.call(settings, 'alwaysOnTop')) {
      setAlwaysOnTop(settings.alwaysOnTop);
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'refreshIntervalMs')) {
      return setRefreshInterval(settings.refreshIntervalMs);
    }

    return getRendererState();
  });
  ipcMain.handle('monitor:set-settings-expanded', async (_event, expanded) => {
    setExpandedState(expanded);
    return true;
  });
  ipcMain.handle('monitor:resize-window-to-content', async (_event, contentHeight) => {
    return resizeWindowToContent(contentHeight);
  });
  ipcMain.handle('monitor:window-action', async (_event, action) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;

    if (action === 'minimize') mainWindow.minimize();
    if (action === 'toggle-maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
    if (action === 'close') {
      closeAuxiliaryWindows();
      mainWindow.close();
    }
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
  closeAuxiliaryWindows();
  savePersistedState();
});
