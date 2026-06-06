/**
 * VendorBridge — Admin Seeder
 * Run: node database/seed-admin.js
 * 
 * Creates an admin account directly in the database.
 * CHANGE credentials before running in production.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Use the same database configuration as the main app
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

async function seedAdmin() {
  const adminData = {
    full_name:    'Test Admin User',
    company_name: 'Oddo Corporation',
    email:        'admin@oddo.com',
    password:     'TestAdmin@123',          // Test password - change as needed
    role:         'admin',
  };

  try {
    // Check if already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [adminData.email]
    );

    if (existing.rows.length > 0) {
      console.log('Admin account already exists:', adminData.email);
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(adminData.password, salt);

    const result = await pool.query(
      `INSERT INTO users (full_name, company_name, email, password_hash, role, is_verified, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, role`,
      [
        adminData.full_name,
        adminData.company_name,
        adminData.email,
        password_hash,
        'admin',
        true,
        'local',
      ]
    );

    console.log('✅ Admin account created:');
    console.log('   Email   :', result.rows[0].email);
    console.log('   Role    :', result.rows[0].role);
    console.log('   ID      :', result.rows[0].id);
    console.log('\n⚠️  Change the default password immediately!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding admin:', err.message);
    process.exit(1);
  }
}

seedAdmin();
