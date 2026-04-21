const els = {
  widgetShell: document.getElementById('widgetShell'),
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
  weeklyDateValue: document.getElementById('weeklyDateValue'),
  settingsPanel: document.getElementById('settingsPanel'),
  settingsBtn: document.getElementById('settingsBtn'),
  alwaysOnTopToggle: document.getElementById('alwaysOnTopToggle'),
  autoRefreshSelect: document.getElementById('autoRefreshSelect'),
  loginBtn: document.getElementById('loginBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  footerRefreshBtn: document.getElementById('footerRefreshBtn'),
  pinBtn: document.getElementById('pinBtn'),
  minBtn: document.getElementById('minBtn'),
  closeBtn: document.getElementById('closeBtn')
};

let settingsExpanded = false;
let resizeFrame = null;
let defaultWindowHeight = 210;
let settingsTransitioning = false;

function waitForTransitionEnd(el) {
  return new Promise(resolve => {
    el.addEventListener('transitionend', resolve, { once: true });
  });
}

function clampPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

function formatPercent(value) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? '--%' : `${Math.round(Number(value))}%`;
}

function formatUpdatedAt(value) {
  if (!value) return 'Synced --:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Synced --:--';
  return `Synced ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function formatWeeklyDate(value) {
  if (!value || value === '--') return '--';

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return value;
}

function parseDurationToMs(value) {
  if (!value) return null;

  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  const regex = /(\d+)\s*([dhm])/gi;
  let match;
  let totalMs = 0;

  while ((match = regex.exec(cleaned))) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'd') totalMs += amount * 24 * 60 * 60 * 1000;
    if (unit === 'h') totalMs += amount * 60 * 60 * 1000;
    if (unit === 'm') totalMs += amount * 60 * 1000;
  }

  return totalMs > 0 ? totalMs : null;
}

function formatDurationFromMs(totalMs) {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return '--';

  const totalMinutes = Math.max(1, Math.round(totalMs / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours} h ${minutes} m` : `${hours} h`;
  }

  return `${minutes} m`;
}

function parseResetMoment(value) {
  if (!value || value === '--') return null;

  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  const now = new Date();
  const timeMatch = cleaned.match(/\b(\d{1,2}:\d{2}\s*[AP]M)\b/i);
  const weekdayMatch = cleaned.match(/\b(Sun|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
  const monthDayMatch = cleaned.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i);

  const applyTime = (date) => {
    if (!timeMatch) return date;

    const parts = timeMatch[1].match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!parts) return date;

    let hour = Number(parts[1]) % 12;
    const minute = Number(parts[2]);
    const meridiem = parts[3].toUpperCase();
    if (meridiem === 'PM') hour += 12;
    date.setHours(hour, minute, 0, 0);
    return date;
  };

  if (weekdayMatch) {
    const weekdayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const short = weekdayMatch[1].slice(0, 3).toLowerCase();
    const targetDay = weekdayNames.indexOf(short);
    if (targetDay >= 0) {
      const date = new Date(now);
      let delta = (targetDay - date.getDay() + 7) % 7;
      if (delta === 0 && timeMatch) {
        const sameDay = applyTime(new Date(date));
        if (sameDay <= now) delta = 7;
      }
      date.setDate(date.getDate() + delta);
      return applyTime(date);
    }
  }

  if (monthDayMatch) {
    const date = new Date(now);
    const withYear = new Date(`${monthDayMatch[1]} ${monthDayMatch[2]}, ${date.getFullYear()}`);
    if (!Number.isNaN(withYear.getTime())) {
      const parsed = applyTime(withYear);
      if (parsed <= now) parsed.setFullYear(parsed.getFullYear() + 1);
      return parsed;
    }
  }

  if (timeMatch) {
    const date = applyTime(new Date(now));
    if (date <= now) date.setDate(date.getDate() + 1);
    return date;
  }

  return null;
}

function formatTimeOfDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatWeekdayOrDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--';

  const now = new Date();
  const withinWeek = Math.abs(date - now) < 7 * 24 * 60 * 60 * 1000;
  if (withinWeek) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function applyConnectionState(state) {
  els.connectionStatus.classList.remove('connected', 'disconnected', 'loading');

  if (state.loading) {
    els.connectionStatus.textContent = 'Refreshing Claude usage...';
    els.connectionStatus.classList.add('loading');
    return;
  }

  if (state.connected) {
    els.connectionStatus.innerHTML = '<span class="status-dot"></span>Connected to Claude';
    els.connectionStatus.classList.add('connected');
    return;
  }

  els.connectionStatus.innerHTML = '<span class="status-dot"></span>Not connected';
  els.connectionStatus.classList.add('disconnected');
}

async function performRefresh() {
  render(await window.claudeMonitor.refresh());
}

function scheduleWindowResize() {
  if (settingsTransitioning) return;
  if (resizeFrame !== null) {
    cancelAnimationFrame(resizeFrame);
  }

  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    if (settingsTransitioning) return;
    const shell = els.widgetShell;
    const contentHeight = shell
      ? Math.ceil(shell.getBoundingClientRect().height)
      : defaultWindowHeight;

    window.claudeMonitor.resizeWindowToContent(contentHeight);
  });
}

function render(state) {
  const metrics = state.metrics || {};
  defaultWindowHeight = Number(state.defaultWindowHeight) || defaultWindowHeight;
  const sessionPercent = clampPercent(metrics.currentSessionPercent);
  const weeklyPercent = clampPercent(metrics.weeklyLimitPercent);
  const sessionResetMs = parseDurationToMs(metrics.currentSessionResetsIn);
  const sessionResetDate = sessionResetMs ? new Date(Date.now() + sessionResetMs) : null;
  const weeklyResetDate = parseResetMoment(metrics.weeklyResetMoment);
  const weeklyResetMs = weeklyResetDate ? weeklyResetDate.getTime() - Date.now() : null;

  applyConnectionState(state);

  els.sessionLabel.textContent = metrics.currentSessionLabel || 'CURRENT SESSION';
  els.weeklyLabel.textContent = metrics.weeklyLimitLabel || 'WEEKLY LIMIT';

  els.sessionBar.style.width = `${sessionPercent}%`;
  els.weeklyBar.style.width = `${weeklyPercent}%`;
  els.sessionValue.textContent = formatPercent(metrics.currentSessionPercent);
  els.weeklyValue.textContent = formatPercent(metrics.weeklyLimitPercent);
  els.elapsedValue.textContent = metrics.currentSessionResetsIn || '--';
  els.resetsInValue.textContent = weeklyResetMs ? formatDurationFromMs(weeklyResetMs) : '--';
  els.resetsAtValue.textContent = sessionResetDate ? formatTimeOfDay(sessionResetDate) : '--';
  els.weeklyDateValue.textContent = weeklyResetDate ? formatWeekdayOrDate(weeklyResetDate) : '--';
  els.updatedAt.textContent = formatUpdatedAt(state.lastUpdated);
  els.alwaysOnTopToggle.checked = Boolean(state.alwaysOnTop);
  els.autoRefreshSelect.value = String(state.refreshIntervalMs || 300000);

  if (state.loading) {
    els.helperText.textContent = 'Loading values from claude.ai/settings/usage...';
  } else if (state.lastError) {
    els.helperText.textContent = state.lastError;
  } else if (state.connected) {
    els.helperText.textContent = 'Values are being read from your signed-in Claude session.';
  } else {
    els.helperText.textContent = 'Open Claude login to connect.';
  }

  els.pinBtn.innerHTML = state.alwaysOnTop ? '&#128205;' : '&#128204;';
  els.pinBtn.title = state.alwaysOnTop ? 'Unpin widget' : 'Pin widget';
  scheduleWindowResize();
}

async function setSettingsExpanded(expanded) {
  settingsExpanded = expanded;
  settingsTransitioning = true;
  els.settingsPanel.classList.toggle('is-collapsed', !expanded);
  els.settingsBtn.classList.toggle('is-active', expanded);

  if (expanded) {
    // Grow window first so the expanding panel has room
    await window.claudeMonitor.setSettingsExpanded(true);
    await waitForTransitionEnd(els.settingsPanel);
    settingsTransitioning = false;
  } else {
    // Let CSS collapse finish, then measure actual content and resize to match
    await waitForTransitionEnd(els.settingsPanel);
    settingsTransitioning = false;
    scheduleWindowResize();
  }
}

async function init() {
  render(await window.claudeMonitor.getState());

  window.claudeMonitor.onState((state) => {
    render(state);
  });

  els.refreshBtn.addEventListener('click', performRefresh);
  els.footerRefreshBtn.addEventListener('click', performRefresh);

  els.loginBtn.addEventListener('click', async () => {
    render(await window.claudeMonitor.login());
  });

  els.pinBtn.addEventListener('click', async () => {
    render(await window.claudeMonitor.togglePin());
  });

  els.settingsBtn.addEventListener('click', async () => {
    await setSettingsExpanded(!settingsExpanded);
  });

  els.alwaysOnTopToggle.addEventListener('change', async (event) => {
    render(
      await window.claudeMonitor.updateSettings({
        alwaysOnTop: event.target.checked
      })
    );
  });

  els.autoRefreshSelect.addEventListener('change', async (event) => {
    render(
      await window.claudeMonitor.updateSettings({
        refreshIntervalMs: Number(event.target.value)
      })
    );
  });

  els.minBtn.addEventListener('click', () => {
    window.claudeMonitor.windowAction('minimize');
  });

  els.closeBtn.addEventListener('click', () => {
    window.claudeMonitor.windowAction('close');
  });
}

init();
