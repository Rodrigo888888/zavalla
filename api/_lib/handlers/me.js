const { send, sendError, requireMethod } = require('../http');
const auth = require('../auth');

module.exports = async (req, res) => {
  try {
    requireMethod(req, 'GET');
    const admin = await auth.requireAdmin(req);
    send(res, 200, { ok: true, user: admin.user });
  } catch (err) {
    sendError(res, err);
  }
};
