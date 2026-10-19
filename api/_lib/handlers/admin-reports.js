/**
 * GET /api/admin/reports — relatórios com filtros e exportação CSV.
 *   ?report=posicao|movimentacoes|vendas|estoque-baixo
 *   &from=&to=&category=&product=&format=json|csv
 * Todos os números vêm do banco — nada inventado.
 */
const auth = require('../auth');
const repo = require('../repo');
const migrate = require('../migrate');
const { send, sendError, requireMethod } = require('../http');

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows) {
  if (!rows.length) return '';
  const header = Object.keys(rows[0]);
  const lines = [header.join(';')];
  for (const r of rows) lines.push(header.map((h) => csvEscape(r[h])).join(';'));
  return '﻿' + lines.join('\r\n'); // BOM para abrir corretamente no Excel
}

module.exports = async (req, res) => {
  try {
    await auth.requireAdmin(req);
    requireMethod(req, 'GET');
    await migrate.ensureMigrated();

    const q = req.query || {};
    const report = String(q.report || 'posicao');
    const csv = String(q.format || 'json') === 'csv';

    let rows = [];
    let title = '';

    if (report === 'posicao') {
      title = 'Posição atual do estoque';
      const products = await repo.listProducts({ includeInactive: true });
      // resolve os nomes dos fornecedores para o relatório fazer sentido na prática
      const suppliers = await repo.listSuppliers();
      const supName = (id) => {
        if (!id) return '';
        const s = suppliers.find((x) => x.id === id);
        return s ? s.name : id;
      };
      rows = products.map((p) => ({
        SKU: p.sku,
        Produto: p.name,
        Categoria: p.category,
        Marca: p.brand || '',
        Status: p.status,
        Saldo: p.stock,
        Minimo: p.minStock,
        CustoUnitario: p.costBRL,
        ValorEmEstoque: Math.round((p.stock || 0) * (p.costBRL || 0) * 100) / 100,
        PrecoVenda: p.priceBRL,
        Local: p.location || '',
        Fornecedor: supName(p.supplierId),
      }));
    } else if (report === 'movimentacoes') {
      title = 'Histórico de movimentações';
      const movements = await repo.listMovements({
        from: q.from || null, to: q.to || null,
        productId: q.product || null, type: q.type || null, limit: 1000,
      });
      rows = movements.map((m) => ({
        Data: m.at,
        Produto: m.productName,
        SKU: m.productSku,
        Tipo: m.type,
        Quantidade: m.delta,
        Antes: m.before,
        Depois: m.after,
        Responsavel: m.user,
        Motivo: m.reason || '',
        Pedido: m.orderId || '',
        Origem: m.origin || '',
      }));
    } else if (report === 'vendas') {
      title = 'Vendas por produto (saídas com pedido)';
      const movements = await repo.listMovements({ type: 'saida', limit: 1000 });
      const map = new Map();
      for (const m of movements) {
        if (!m.orderId) continue; // só saídas efetivamente ligadas a pedidos
        const k = m.productId || m.productSku;
        const cur = map.get(k) || { Produto: m.productName, SKU: m.productSku, Unidades: 0, Pedidos: new Set() };
        cur.Unidades += Math.abs(m.delta || 0);
        cur.Pedidos.add(m.orderId);
        map.set(k, cur);
      }
      rows = Array.from(map.values())
        .map((r) => ({ Produto: r.Produto, SKU: r.SKU, Unidades: r.Unidades, Pedidos: r.Pedidos.size }))
        .sort((a, b) => b.Unidades - a.Unidades);
    } else if (report === 'estoque-baixo') {
      title = 'Produtos abaixo do mínimo / sem estoque';
      const products = await repo.listProducts({ includeInactive: true });
      rows = products
        .filter((p) => p.status !== 'inativo' && p.stockControl && p.stock <= (p.minStock || 0))
        .map((p) => ({
          SKU: p.sku, Produto: p.name, Saldo: p.stock, Minimo: p.minStock,
          Situacao: p.stock === 0 ? 'Sem estoque' : 'Estoque baixo',
        }));
    } else {
      send(res, 400, { ok: false, error: 'Relatório desconhecido.', code: 'RELATORIO' });
      return;
    }

    if (csv) {
      const filename = `zavalla-${report}-${new Date().toISOString().slice(0, 10)}.csv`;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.end(toCSV(rows));
      return;
    }

    send(res, 200, { ok: true, report, title, rows, total: rows.length, generatedAt: new Date().toISOString() });
  } catch (err) {
    sendError(res, err);
  }
};
