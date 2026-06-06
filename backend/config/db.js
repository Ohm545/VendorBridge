/**
 * PostgreSQL connection pool
 * Supports both DATABASE_URL (Neon/cloud) and individual DB_* variables (local)
 */
const { Pool } = require('pg');

let poolConfig;

if (process.env.DATABASE_URL) {
  // Neon / cloud Postgres via connection string
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
} else {
  // Local Postgres via individual env vars
  poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'vendorbridge',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});

// Test connection on startup
pool.query('SELECT NOW()').then(() => {
  console.log('   ✅ Database connected successfully');
}).catch(err => {
  console.error('   ❌ Database connection failed:', err.message);
});

module.exports = pool;
