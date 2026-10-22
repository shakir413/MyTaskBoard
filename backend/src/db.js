require("dotenv").config();
const { Pool } = require("pg");

// A "pool" keeps a few database connections open and reuses them.
// Analogy: a taxi stand - cars (connections) wait ready instead of
// building a new car for every passenger (request).
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // RDS requires an encrypted (SSL) connection
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// Create the table automatically on first start
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

module.exports = { pool, initDb };
