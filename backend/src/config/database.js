const { Pool } = require('pg');
const redis = require('redis');
const mongoose = require('mongoose');

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis connection
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

// MongoDB connection for messaging
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Database initialization
const initializeDatabases = async () => {
  try {
    // Test PostgreSQL connection
    try {
      await pool.query('SELECT NOW()');
      console.log('Connected to PostgreSQL');
    } catch (error) {
      console.warn('PostgreSQL connection failed:', error.message);
    }
    
    // Connect to Redis
    try {
      await redisClient.connect();
      console.log('Connected to Redis');
    } catch (error) {
      console.warn('Redis connection failed:', error.message);
    }
    
    // Connect to MongoDB
    try {
      await connectMongoDB();
    } catch (error) {
      console.warn('MongoDB connection failed:', error.message);
    }
    
    console.log('Database initialization completed (some services may be unavailable)');
  } catch (error) {
    console.error('Database initialization error:', error);
    console.log('Continuing without database connections...');
  }
};

module.exports = {
  pool,
  redisClient,
  mongoose,
  initializeDatabases
};