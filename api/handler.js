/**
 * Única função de servidor do ZAVALLA (plano Hobby: máximo de 12 funções por
 * deploy). Recebe todos os pedidos de /api/* — roteados pelo vercel.json — e
 * repassa ao handler correspondente (ver api/_lib/routes.js).
 */
const { dispatch } = require('./_lib/routes');

module.exports = async (req, res) => dispatch(req, res);
