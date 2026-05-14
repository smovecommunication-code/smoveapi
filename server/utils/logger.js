function redactValue(key, value) {
  if (/password|secret|token|cookie|authorization|smtp_pass/i.test(key)) {
    return '[redacted]';
  }
  if (/email/i.test(key) && typeof value === 'string') {
    return '[redacted-email]';
  }
  return value;
}

function sanitizeObject(input = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(input)) {
    safe[key] = redactValue(key, value);
  }
  return safe;
}

function write(level, event, details = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeObject(details),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

function logInfo(event, details) {
  write('info', event, details);
}

function logWarn(event, details) {
  write('warn', event, details);
}

function logError(event, details) {
  write('error', event, details);
}

module.exports = { logInfo, logWarn, logError, sanitizeObject };
