const { send, sendError, requireMethod, getCookie } = require('../http');
const { destroySession, clearCookie, COOKIE_NAME, isHttps } = require('../auth');

module.exports = async (req, res) => {
  try {
    requireMethod(req, 'POST');
    const token = getCookie(req, COOKIE_NAME);
    if (token) await destroySession(token);
    send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(isHttps(req)) });
  } catch (err) {
    sendError(res, err);
  }
};
