const els = {
  connectionStatus: document.getElementById('connectionStatus'),
  helperText: document.getElementById('helperText'),
  updatedAt: document.getElementById('updatedAt'),
  sessionLabel: document.getElementById('sessionLabel'),
  weeklyLabel: document.getElementById('weeklyLabel'),
  sessionBar: document.getElementById('sessionBar'),
  weeklyBar: document.getElementById('weeklyBar'),
  sessionValue: document.getElementById('sessionValue'),
  weeklyValue: document.getElementById('weeklyValue'),
  elapsedValue: document.getElementById('elapsedValue'),
  resetsInValue: document.getElementById('resetsInValue'),
  resetsAtValue: document.getElementById('resetsAtValue'),
  sessionRing: document.getElementById('sessionRing'),
  weeklyRing: document.getElementById('weeklyRing'),
  loginBtn: document.getElementById('loginBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  pinBtn: document.getElementById('pinBtn'),
  minBtn: document.getElementById('minBtn'),
  closeBtn: document.getElementById('closeBtn')
};

function clampPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

function formatPercent(value) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? '--%' : `${Math.round(Number(value))}%`;
}

function formatUpdatedAt(value) {
  if (!value) return 'Never synced';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never synced';
  return `Synced ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function applyConnectionState(state) {
  els.connectionStatus.classList.remove('connected', 'disconnected', 'loading');

  if (state.loading) {
    els.connectionStatus.textContent = 'Refreshing Claude usage…';
    els.connectionStatus.classList.add('loading');
    return;
  }

  if (state.connected) {
    els.connectionStatus.textContent = 'Connected to Claude';
    els.connectionStatus.classList.add('connected');
    return;
  }

  els.connectionStatus.textContent = 'Not connected';
  els.connectionStatus.classList.add('disconnected');
}

function render(state) {
  const metrics = state.metrics || {};
  const sessionPercent = clampPercent(metrics.currentSessionPercent);
  const weeklyPercent = clampPercent(metrics.weeklyLimitPercent);

  applyConnectionState(state);

  els.sessionLabel.textContent = metrics.currentSessionLabel || 'CURRENT SESSION';
  els.weeklyLabel.textContent = metrics.weeklyLimitLabel || 'WEEKLY LIMIT';

  els.sessionBar.style.width = `${sessionPercent}%`;
  els.weeklyBar.style.width = `${weeklyPercent}%`;
  els.sessionValue.textContent = formatPercent(metrics.currentSessionPercent);
  els.weeklyValue.textContent = formatPercent(metrics.weeklyLimitPercent);
  els.elapsedValue.textContent = metrics.elapsed || '--';
  els.resetsInValue.textContent = metrics.resetsIn || '--';
  els.resetsAtValue.textContent = metrics.resetsAt || '--';
  els.sessionRing.style.setProperty('--progress', sessionPercent);
  els.weeklyRing.style.setProperty('--progress', weeklyPercent);
  els.updatedAt.textContent = formatUpdatedAt(state.lastUpdated);

  if (state.loading) {
    els.helperText.textContent = 'Loading claude.ai/settings/usage…';
  } else if (state.lastError) {
    els.helperText.textContent = state.lastError;
  } else if (state.connected) {
    els.helperText.textContent = 'Values are being read from your signed-in Claude session.';
  } else {
    els.helperText.textContent = 'Open Claude login to connect.';
  }

  els.pinBtn.textContent = state.alwaysOnTop ? '📍' : '📌';
  els.pinBtn.title = state.alwaysOnTop ? 'Unpin widget' : 'Pin widget';
}

async function init() {
  render(await window.claudeMonitor.getState());

  window.claudeMonitor.onState((state) => {
    render(state);
  });

  els.refreshBtn.addEventListener('click', async () => {
    render(await window.claudeMonitor.refresh());
  });

  els.loginBtn.addEventListener('click', async () => {
    render(await window.claudeMonitor.login());
  });

  els.pinBtn.addEventListener('click', async () => {
    render(await window.claudeMonitor.togglePin());
  });

  els.minBtn.addEventListener('click', () => {
    window.claudeMonitor.windowAction('minimize');
  });

  els.closeBtn.addEventListener('click', () => {
    window.claudeMonitor.windowAction('close');
  });
}

init();
