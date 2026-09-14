// seed.js
// Generates a large synthetic e-commerce "orders" dataset into a local SQLite
// database. Run once with: npm run seed
//
// You can tune TOTAL_ROWS below. 1,000,000 rows takes a couple of minutes
// on a typical laptop and produces a ~150-200MB sqlite file.

import Database from "better-sqlite3";
import { faker } from "@faker-js/faker";
import fs from "fs";

const DB_PATH = "./orders.db";
const TOTAL_ROWS = 1_000_000;
const BATCH_SIZE = 5_000;

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled", "refunded"];
const REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East", "Africa"];
const CATEGORIES = ["Electronics", "Apparel", "Home & Kitchen", "Books", "Sports", "Beauty", "Toys", "Grocery"];

if (fs.existsSync(DB_PATH)) {
  console.log("Existing orders.db found — deleting to reseed fresh.");
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = OFF");

db.exec(`
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    region TEXT NOT NULL,
    order_date TEXT NOT NULL
  );
`);

// Indexes matter here: they're what makes sort/filter over 1M rows fast.
// Create them AFTER the bulk insert (much faster than maintaining them during insert).
const insertStmt = db.prepare(`
  INSERT INTO orders (order_number, customer_name, product_name, category, amount, status, region, order_date)
  VALUES (@order_number, @customer_name, @product_name, @category, @amount, @status, @region, @order_date)
`);

const insertBatch = db.transaction((rows) => {
  for (const row of rows) insertStmt.run(row);
});

console.log(`Seeding ${TOTAL_ROWS.toLocaleString()} orders into ${DB_PATH} ...`);
const start = Date.now();

let buffer = [];
for (let i = 1; i <= TOTAL_ROWS; i++) {
  buffer.push({
    order_number: `ORD-${String(i).padStart(7, "0")}`,
    customer_name: faker.person.fullName(),
    product_name: faker.commerce.productName(),
    category: faker.helpers.arrayElement(CATEGORIES),
    amount: Number(faker.commerce.price({ min: 5, max: 2500 })),
    status: faker.helpers.arrayElement(STATUSES),
    region: faker.helpers.arrayElement(REGIONS),
    order_date: faker.date.between({ from: "2023-01-01", to: "2026-09-01" }).toISOString(),
  });

  if (buffer.length === BATCH_SIZE) {
    insertBatch(buffer);
    buffer = [];
    if (i % 100_000 === 0) {
      console.log(`  ${i.toLocaleString()} / ${TOTAL_ROWS.toLocaleString()} rows...`);
    }
  }
}
if (buffer.length) insertBatch(buffer);

console.log("Creating indexes (used for fast sort/filter)...");
db.exec(`
  CREATE INDEX idx_orders_status ON orders(status);
  CREATE INDEX idx_orders_region ON orders(region);
  CREATE INDEX idx_orders_category ON orders(category);
  CREATE INDEX idx_orders_amount ON orders(amount);
  CREATE INDEX idx_orders_date ON orders(order_date);
`);

// Free-text search (order number / customer / product) previously ran as
// LIKE '%term%' across three columns, which can't use a normal B-tree index
// because of the leading wildcard — that's an O(n) scan over all 1M rows on
// every keystroke. An FTS5 virtual table with the trigram tokenizer indexes
// every 3-character sequence in the text, so substring search (including
// mid-word) stays index-backed instead of a full scan.
console.log("Building full-text search index (trigram)...");
db.exec(`
  CREATE VIRTUAL TABLE orders_fts USING fts5(
    order_number, customer_name, product_name,
    content='orders', content_rowid='id',
    tokenize='trigram'
  );
`);
db.exec(`
  INSERT INTO orders_fts(rowid, order_number, customer_name, product_name)
  SELECT id, order_number, customer_name, product_name FROM orders;
`);

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`Done. Seeded ${TOTAL_ROWS.toLocaleString()} rows in ${elapsed}s.`);
db.close();
