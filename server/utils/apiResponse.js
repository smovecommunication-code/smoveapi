function normalizeHttpStatus(status, fallback = 500) {
  const code = Number(status);
  if (Number.isInteger(code) && code >= 100 && code <= 599) {
    return code;
  }
  return fallback;
}

function sendSuccess(res, status, data = {}) {
  return res.status(normalizeHttpStatus(status, 200)).json({
    success: true,
    data,
    error: null,
  });
}

function sendError(res, status, code, message, details = null) {
  return res.status(normalizeHttpStatus(status, 500)).json({
    success: false,
    data: null,
    error: {
      code,
      message,
      details,
    },
  });
}

module.exports = { sendSuccess, sendError, normalizeHttpStatus };
