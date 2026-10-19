const { HttpError, send, sendError, readBody, assertSameOrigin, requireMethod, cleanText } = require('../http');
const auth = require('../auth');

module.exports = async (req, res) => {
  try {
    requireMethod(req, 'POST');
    assertSameOrigin(req);
    const body = await readBody(req);
    const user = cleanText(body.user, 60);
    const password = String(body.password || '').slice(0, 200);
    if (!user || !password) throw new HttpError(400, 'Informe usuário e senha.', 'VALIDACAO');

    const token = await auth.login(req, user, password);
    // O token vai no corpo também: navegadores/WebView que descartam cookie
    // conseguem seguir autenticados pelo cabeçalho X-Zavala-Session (em
    // memória, same-origin; o cookie HttpOnly continua sendo o caminho normal).
    send(res, 200, { ok: true, user, token }, { 'Set-Cookie': auth.sessionCookie(token, auth.isHttps(req)) });
  } catch (err) {
    sendError(res, err);
  }
};
