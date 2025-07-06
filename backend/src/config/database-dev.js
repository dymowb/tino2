const Database = require('better-sqlite3');
const RedisMock = require('ioredis-mock');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// SQLite for development (replaces PostgreSQL) - persistent file
const path = require('path');
const dbPath = path.join(__dirname, '../../data/development.db');
const fs = require('fs');

// Create data directory if it doesn't exist
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Redis Mock for development
const redisClient = new RedisMock();

// MongoDB Memory Server
let mongoServer;
let mongoUri;

// Initialize SQLite tables (equivalent to PostgreSQL schema)
const initializeSQLite = () => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      user_type TEXT NOT NULL CHECK(user_type IN ('customer', 'provider')),
      phone TEXT,
      profile_image TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Providers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      business_name TEXT,
      description TEXT,
      services JSON,
      hourly_rate DECIMAL(10,2),
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      availability_status TEXT DEFAULT 'available',
      rating DECIMAL(3,2) DEFAULT 0,
      total_reviews INTEGER DEFAULT 0,
      profile_image TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Bookings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      provider_id INTEGER NOT NULL,
      service_type TEXT NOT NULL,
      scheduled_date DATETIME NOT NULL,
      address TEXT NOT NULL,
      description TEXT,
      estimated_duration INTEGER,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
      payment_status TEXT DEFAULT 'unpaid',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (provider_id) REFERENCES providers(id)
    )
  `);

  // Quote requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS quote_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      service_type TEXT NOT NULL,
      description TEXT NOT NULL,
      address TEXT NOT NULL,
      preferred_date DATETIME NOT NULL,
      estimated_budget DECIMAL(10,2),
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id)
    )
  `);

  // Quotes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_request_id INTEGER NOT NULL,
      provider_id INTEGER NOT NULL,
      total_price DECIMAL(10,2) NOT NULL,
      estimated_duration INTEGER NOT NULL,
      description TEXT NOT NULL,
      valid_until DATETIME NOT NULL,
      itemized_pricing JSON,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quote_request_id) REFERENCES quote_requests(id),
      FOREIGN KEY (provider_id) REFERENCES providers(id)
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      conversation_type TEXT DEFAULT 'general',
      related_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (recipient_id) REFERENCES users(id)
    )
  `);

  // Payments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_method TEXT NOT NULL,
      transaction_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id),
      FOREIGN KEY (customer_id) REFERENCES users(id)
    )
  `);

  // Reviews table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      provider_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      categories JSON,
      customer_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id),
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (provider_id) REFERENCES providers(id)
    )
  `);

  console.log('SQLite tables initialized');
};

// MongoDB Memory Server setup
const connectMongoDB = async () => {
  try {
    mongoServer = await MongoMemoryServer.create();
    mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB Memory Server');
  } catch (error) {
    console.error('MongoDB Memory Server connection error:', error);
  }
};

// Database initialization
const initializeDatabases = async () => {
  try {
    // Initialize SQLite
    initializeSQLite();
    console.log('Connected to SQLite (development database)');
    
    // Redis Mock is ready by default
    console.log('Connected to Redis Mock (development cache)');
    
    // Connect to MongoDB Memory Server
    await connectMongoDB();
    
    console.log('All development databases connected successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    console.log('Continuing without some database connections...');
  }
};

// Create a pool-like interface for SQLite to match PostgreSQL usage
const pool = {
  query: (text, params = []) => {
    try {
      // Convert PostgreSQL style ($1, $2) to SQLite style (?, ?)
      let sqliteQuery = text;
      const paramRegex = /\$(\d+)/g;
      let match;
      const paramMap = {};
      let paramIndex = 1;
      
      // Find all $1, $2, etc. and replace with ?
      while ((match = paramRegex.exec(text)) !== null) {
        const pgParam = match[0]; // $1, $2, etc.
        const paramNumber = parseInt(match[1]);
        if (!paramMap[pgParam]) {
          paramMap[pgParam] = paramIndex++;
        }
      }
      
      // Replace PostgreSQL parameters with SQLite parameters
      Object.keys(paramMap).forEach(pgParam => {
        sqliteQuery = sqliteQuery.replace(new RegExp('\\' + pgParam + '\\b', 'g'), '?');
      });

      console.log('Executing SQLite query:', sqliteQuery, 'with params:', params);

      if (sqliteQuery.toLowerCase().includes('insert') && sqliteQuery.toLowerCase().includes('returning')) {
        // Handle INSERT ... RETURNING for SQLite
        const insertText = sqliteQuery.split(/\s+RETURNING\s+/i)[0];
        const returningClause = sqliteQuery.split(/\s+RETURNING\s+/i)[1];
        
        const stmt = db.prepare(insertText);
        const result = stmt.run(params);
        
        // Get the inserted row
        const selectStmt = db.prepare(`SELECT ${returningClause} FROM users WHERE id = ?`);
        const insertedRow = selectStmt.get(result.lastInsertRowid);
        
        return { rows: [insertedRow] };
      } else if (sqliteQuery.toLowerCase().startsWith('select')) {
        const stmt = db.prepare(sqliteQuery);
        const rows = stmt.all(params);
        return { rows };
      } else if (sqliteQuery.toLowerCase().startsWith('update')) {
        const stmt = db.prepare(sqliteQuery);
        const result = stmt.run(params);
        
        // For UPDATE ... RETURNING queries
        if (sqliteQuery.toLowerCase().includes('returning')) {
          const tableName = sqliteQuery.match(/UPDATE\s+(\w+)/i)[1];
          const returningClause = sqliteQuery.split(/\s+RETURNING\s+/i)[1];
          const selectStmt = db.prepare(`SELECT ${returningClause} FROM ${tableName} WHERE id = ?`);
          const updatedRow = selectStmt.get(params[params.length - 1]); // Assuming last param is the ID
          return { rows: [updatedRow] };
        }
        
        return { rows: [], changes: result.changes };
      } else {
        const stmt = db.prepare(sqliteQuery);
        const result = stmt.run(params);
        return { rows: [], changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      }
    } catch (error) {
      console.error('SQLite query error:', error);
      console.error('Original query:', text);
      console.error('Parameters:', params);
      throw error;
    }
  }
};

module.exports = {
  pool,
  redisClient,
  mongoose,
  initializeDatabases
};