(() => {
  const text = (document.body?.innerText || '').replace(/\u00a0/g, ' ');
  const clean = (value) => value?.replace(/\s+/g, ' ').trim() || null;

  const lower = text.toLowerCase();
  const looksLoggedOut =
    /log in|sign in|continue with google|continue with apple|enter your email/i.test(text) &&
    !/current session|weekly limit|resets in|resets at/i.test(text);

  const patterns = {
    currentSessionPercent: [
      /current\s+session[\s\S]{0,120}?(\d{1,3})\s*%/i,
      /session\s+used[\s\S]{0,120}?(\d{1,3})\s*%/i
    ],
    weeklyLimitPercent: [
      /weekly\s+limit[\s\S]{0,120}?(\d{1,3})\s*%/i,
      /weekly[\s\S]{0,120}?(\d{1,3})\s*%/i
    ],
    elapsed: [
      /elapsed[\s\S]{0,80}?((?:\d+\s*[dhm]\s*){1,4})/i
    ],
    resetsIn: [
      /resets\s+in[\s\S]{0,80}?((?:\d+\s*[dhm]\s*){1,4})/i,
      /resets\s+in[\s\S]{0,80}?([A-Za-z]{3,9}\s+\d{1,2}|\d{1,2}:\d{2}\s*[AP]M)/i
    ],
    resetsAt: [
      /resets\s+at[\s\S]{0,80}?([A-Za-z]{3,9}\s+\d{1,2}|\d{1,2}:\d{2}\s*[AP]M)/i,
      /next\s+reset[\s\S]{0,80}?([A-Za-z]{3,9}\s+\d{1,2}|\d{1,2}:\d{2}\s*[AP]M)/i
    ]
  };

  const findByPatternList = (list) => {
    for (const pattern of list) {
      const match = text.match(pattern);
      if (match?.[1]) return clean(match[1]);
    }
    return null;
  };

  const allVisibleElements = [...document.querySelectorAll('body *')]
    .filter((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0;
      return visible && el.innerText && el.innerText.trim().length > 0;
    })
    .slice(0, 3000);

  const findNearbyValue = (labelText, validator) => {
    const label = allVisibleElements.find((el) => el.innerText.trim().toLowerCase() === labelText.toLowerCase());
    if (!label) return null;

    const pool = [
      label.parentElement,
      label.parentElement?.parentElement,
      label.nextElementSibling,
      label.parentElement?.nextElementSibling
    ].filter(Boolean);

    for (const node of pool) {
      const candidateText = clean(node.innerText);
      if (!candidateText) continue;
      const lines = candidateText.split('\n').map(clean).filter(Boolean);
      for (const line of lines) {
        if (validator(line)) return line;
      }
    }

    return null;
  };

  const currentSessionPercentRaw =
    findNearbyValue('CURRENT SESSION', (line) => /^\d{1,3}%$/.test(line)) ||
    findByPatternList(patterns.currentSessionPercent);

  const weeklyLimitPercentRaw =
    findNearbyValue('WEEKLY LIMIT', (line) => /^\d{1,3}%$/.test(line)) ||
    findByPatternList(patterns.weeklyLimitPercent);

  const elapsed = findNearbyValue('ELAPSED', (line) => /\d+\s*[dhm]/i.test(line)) || findByPatternList(patterns.elapsed);
  const resetsIn = findNearbyValue('RESETS IN', (line) => /\d+\s*[dhm]/i.test(line) || /[AP]M/i.test(line)) || findByPatternList(patterns.resetsIn);
  const resetsAt = findNearbyValue('RESETS AT', (line) => /[AP]M/i.test(line) || /[A-Za-z]{3,9}\s+\d{1,2}/i.test(line)) || findByPatternList(patterns.resetsAt);

  const currentSessionPercent = currentSessionPercentRaw ? Number(String(currentSessionPercentRaw).replace('%', '')) : null;
  const weeklyLimitPercent = weeklyLimitPercentRaw ? Number(String(weeklyLimitPercentRaw).replace('%', '')) : null;

  const anyMetricFound = [currentSessionPercent, weeklyLimitPercent, elapsed, resetsIn, resetsAt].some(
    (value) => value !== null && value !== undefined && value !== ''
  );

  return {
    ok: Boolean(anyMetricFound),
    needsAuth: Boolean(looksLoggedOut && !anyMetricFound),
    metrics: {
      currentSessionPercent: Number.isFinite(currentSessionPercent) ? currentSessionPercent : null,
      weeklyLimitPercent: Number.isFinite(weeklyLimitPercent) ? weeklyLimitPercent : null,
      elapsed,
      resetsIn,
      resetsAt,
      currentSessionLabel: 'CURRENT SESSION',
      weeklyLimitLabel: 'WEEKLY LIMIT'
    },
    debug: {
      url: location.href,
      title: document.title,
      sample: clean(text.slice(0, 1200))
    }
  };
})();
