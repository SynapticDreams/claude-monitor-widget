(() => {
  const text = (document.body?.innerText || '').replace(/\u00a0/g, ' ');
  const clean = (value) => value?.replace(/\s+/g, ' ').trim() || null;

  const looksLoggedOut =
    /log in|sign in|continue with google|continue with apple|enter your email/i.test(text) &&
    !/current session|weekly limit|weekly limits|resets in|all models/i.test(text);

  const normalizeDuration = (value) => {
    if (!value) return null;
    return clean(value)
      ?.replace(/\bminutes?\b/gi, 'm')
      ?.replace(/\bmins?\b/gi, 'm')
      ?.replace(/\bhours?\b/gi, 'h')
      ?.replace(/\bhrs?\b/gi, 'h')
      ?.replace(/\bdays?\b/gi, 'd')
      ?.replace(/\s+/g, ' ');
  };

  const patterns = {
    currentSessionPercent: [
      /current\s+session[\s\S]{0,160}?(\d{1,3})\s*%\s*used/i,
      /current\s+session[\s\S]{0,120}?(\d{1,3})\s*%/i,
      /session\s+used[\s\S]{0,120}?(\d{1,3})\s*%/i
    ],
    weeklyLimitPercent: [
      /all\s+models[\s\S]{0,160}?(\d{1,3})\s*%\s*used/i,
      /weekly\s+limits?[\s\S]{0,240}?(\d{1,3})\s*%\s*used/i,
      /weekly\s+limit[\s\S]{0,120}?(\d{1,3})\s*%/i
    ],
    currentSessionResetsIn: [
      /current\s+session[\s\S]{0,120}?resets\s+in\s+((?:\d+\s*(?:d|h|m|min|mins?|hours?|hrs?|days?)\s*){1,4})/i
    ],
    weeklyResetMoment: [
      /all\s+models[\s\S]{0,120}?resets\s+([A-Za-z]{3,9}(?:\s+\d{1,2})?(?:\s+\d{1,2}:\d{2}\s*[AP]M)?|\d{1,2}:\d{2}\s*[AP]M)/i,
      /weekly\s+limits?[\s\S]{0,220}?resets\s+([A-Za-z]{3,9}(?:\s+\d{1,2})?(?:\s+\d{1,2}:\d{2}\s*[AP]M)?|\d{1,2}:\d{2}\s*[AP]M)/i
    ]
  };

  const findByPatternList = (list, formatter = clean) => {
    for (const pattern of list) {
      const match = text.match(pattern);
      if (match?.[1]) return formatter(match[1]);
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

  const exactElement = (labelText) =>
    allVisibleElements.find((el) => clean(el.innerText)?.toLowerCase() === labelText.toLowerCase()) || null;

  const findSiblingLine = (labelText, validator) => {
    const label = exactElement(labelText);
    if (!label) return null;

    const pool = [
      label.nextElementSibling,
      label.parentElement,
      label.parentElement?.nextElementSibling,
      label.parentElement?.parentElement,
      ...Array.from(label.parentElement?.children || [])
    ].filter(Boolean);

    for (const node of pool) {
      const lines = clean(node.innerText)?.split('\n').map(clean).filter(Boolean) || [];
      for (const line of lines) {
        if (validator(line)) return line;
      }
    }

    return null;
  };

  const currentSessionPercentRaw =
    findByPatternList(patterns.currentSessionPercent) ||
    findSiblingLine('Current session', (line) => /^\d{1,3}%(\s*used)?$/i.test(line));

  const weeklyLimitPercentRaw =
    findByPatternList(patterns.weeklyLimitPercent) ||
    findSiblingLine('All models', (line) => /^\d{1,3}%(\s*used)?$/i.test(line)) ||
    findSiblingLine('Weekly limits', (line) => /^\d{1,3}%(\s*used)?$/i.test(line));

  const currentSessionResetsIn =
    normalizeDuration(findByPatternList(patterns.currentSessionResetsIn, normalizeDuration)) ||
    normalizeDuration(
      findSiblingLine('Current session', (line) => /^resets\s+in\s+/i.test(line))?.replace(/^resets\s+in\s+/i, '')
    );

  const weeklyResetMoment =
    findByPatternList(patterns.weeklyResetMoment) ||
    clean(findSiblingLine('All models', (line) => /^resets\s+/i.test(line))?.replace(/^resets\s+/i, ''));

  const currentSessionPercent = currentSessionPercentRaw
    ? Number(String(currentSessionPercentRaw).replace(/%|\s*used/gi, ''))
    : null;
  const weeklyLimitPercent = weeklyLimitPercentRaw
    ? Number(String(weeklyLimitPercentRaw).replace(/%|\s*used/gi, ''))
    : null;

  const anyMetricFound = [currentSessionPercent, weeklyLimitPercent, currentSessionResetsIn, weeklyResetMoment].some(
    (value) => value !== null && value !== undefined && value !== ''
  );

  return {
    ok: Boolean(anyMetricFound),
    needsAuth: Boolean(looksLoggedOut && !anyMetricFound),
    metrics: {
      currentSessionPercent: Number.isFinite(currentSessionPercent) ? currentSessionPercent : null,
      weeklyLimitPercent: Number.isFinite(weeklyLimitPercent) ? weeklyLimitPercent : null,
      currentSessionResetsIn,
      weeklyResetMoment,
      currentSessionLabel: 'CURRENT SESSION',
      weeklyLimitLabel: 'WEEKLY LIMIT'
    },
    debug: {
      url: location.href,
      title: document.title,
      metricKeysFound: {
        currentSessionPercent: currentSessionPercent !== null,
        weeklyLimitPercent: weeklyLimitPercent !== null,
        currentSessionResetsIn: Boolean(currentSessionResetsIn),
        weeklyResetMoment: Boolean(weeklyResetMoment)
      }
    }
  };
})();
