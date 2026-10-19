/**
 * /api/admin/settings — configurações do controle de estoque.
 *   GET — lê configurações atuais
 *   PUT — atualiza (estoque mínimo padrão, expiração de pedidos pendentes)
 */
const auth = require('../auth');
const repo = require('../repo');
const { validateSettings, DEFAULT_SETTINGS } = require('../model');
const { send, sendError, requireMethod, readBody } = require('../http');

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);

    if (req.method === 'GET') {
      const stored = await repo.getSettings();
      return send(res, 200, { ok: true, settings: { ...DEFAULT_SETTINGS, ...(stored || {}) } });
    }

    requireMethod(req, 'PUT');
    const body = await readBody(req);
    const current = (await repo.getSettings()) || {};
    const next = validateSettings(body, current);
    next.updatedBy = admin.user;
    await repo.mutateSettings(() => next);
    send(res, 200, { ok: true, settings: next });
  } catch (err) {
    sendError(res, err);
  }
};
