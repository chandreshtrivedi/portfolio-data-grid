// server.js
// Minimal API serving paginated/sortable/filterable reads over a 1M-row
// SQLite table. This is the piece that makes the frontend demo credible:
// the grid never loads more than one page (200-500 rows) at a time.

import express from "express";
import cors from "cors";
import Database from "better-sqlite3";

const db = new Database("./orders.db", { readonly: true, fileMustExist: true });
const app = express();
app.use(cors());

const SORTABLE_COLUMNS = new Set([
  "id", "order_number", "customer_name", "product_name",
  "category", "amount", "status", "region", "order_date",
]);
const FILTERABLE_COLUMNS = new Set(["status", "region", "category"]);

// GET /orders?page=1&pageSize=200&sortBy=order_date&sortDir=desc&status=shipped&region=Europe&search=foo
app.get("/orders", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize) || 200));
  const offset = (page - 1) * pageSize;

  let sortBy = req.query.sortBy;
  let sortDir = (req.query.sortDir || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  if (!SORTABLE_COLUMNS.has(sortBy)) sortBy = "id";

  const whereClauses = [];
  const params = {};
  // Default: query the orders table directly. Swapped for a join against
  // the FTS index below when a usable search term is present.
  let fromSql = "orders o";

  for (const col of FILTERABLE_COLUMNS) {
    if (req.query[col]) {
      whereClauses.push(`o.${col} = @${col}`);
      params[col] = req.query[col];
    }
  }

  const rawSearch = (req.query.search || "").trim();
  if (rawSearch.length >= 3) {
    // Trigram FTS: index-backed substring search (including mid-word),
    // instead of a full-table LIKE '%...%' scan. Quoting the term as an
    // FTS5 phrase preserves the exact substring/word order the user typed;
    // doubling embedded quotes escapes them per FTS5 phrase syntax.
    fromSql = "orders o JOIN orders_fts f ON f.rowid = o.id";
    whereClauses.push("orders_fts MATCH @ftsQuery");
    params.ftsQuery = `"${rawSearch.replace(/"/g, '""')}"`;
  } else if (rawSearch.length > 0) {
    // Trigram tokens are 3 characters, so 1-2 character queries can't use
    // the FTS index. This is rare in practice (most searches are longer),
    // so we fall back to the original scan rather than adding complexity
    // for a couple of edge-case keystrokes.
    whereClauses.push(`(o.customer_name LIKE @search OR o.product_name LIKE @search OR o.order_number LIKE @search)`);
    params.search = `%${rawSearch}%`;
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM ${fromSql} ${whereSql}`).get(params);
  const total = totalRow.count;

  const rows = db.prepare(`
    SELECT o.id, o.order_number, o.customer_name, o.product_name, o.category, o.amount, o.status, o.region, o.order_date
    FROM ${fromSql}
    ${whereSql}
    ORDER BY o.${sortBy} ${sortDir}
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pageSize, offset });

  res.json({ rows, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
});

// Cheap endpoint to power filter dropdowns without shipping 1M rows to the client.
app.get("/orders/facets", (_req, res) => {
  const statuses = db.prepare(`SELECT DISTINCT status FROM orders`).all().map(r => r.status);
  const regions = db.prepare(`SELECT DISTINCT region FROM orders`).all().map(r => r.region);
  const categories = db.prepare(`SELECT DISTINCT category FROM orders`).all().map(r => r.category);
  res.json({ statuses, regions, categories });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Orders API running at http://localhost:${PORT}`);
  console.log(`Try: http://localhost:${PORT}/orders?page=1&pageSize=200&sortBy=order_date&sortDir=desc`);
});
