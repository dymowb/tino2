const bcrypt = require('bcryptjs');
const { pool } = require('../config/database-dev');

const seedData = async () => {
  try {
    console.log('Seeding development data...');

    // Check if data already exists
    const existingUsers = pool.query('SELECT COUNT(*) as count FROM users');
    if (existingUsers.rows[0].count > 0) {
      console.log('Data already exists, skipping seed');
      return;
    }

    // Create sample users
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    // Customer user
    const customerResult = pool.query(`
      INSERT INTO users (email, password, first_name, last_name, user_type, phone, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, ['customer@example.com', hashedPassword, 'John', 'Doe', 'customer', '+1234567890']);

    // Provider users
    const provider1Result = pool.query(`
      INSERT INTO users (email, password, first_name, last_name, user_type, phone, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, ['provider1@example.com', hashedPassword, 'Jane', 'Smith', 'provider', '+1234567891']);

    const provider2Result = pool.query(`
      INSERT INTO users (email, password, first_name, last_name, user_type, phone, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, ['provider2@example.com', hashedPassword, 'Mike', 'Johnson', 'provider', '+1234567892']);

    // Create provider profiles
    pool.query(`
      INSERT INTO providers (user_id, business_name, description, services, hourly_rate, latitude, longitude, rating, total_reviews, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      provider1Result.lastInsertRowid,
      'CleanPro Services',
      'Professional cleaning services with 5+ years experience',
      JSON.stringify(['house_cleaning', 'deep_cleaning', 'office_cleaning']),
      25.00,
      40.7128,
      -74.0060,
      4.5,
      12
    ]);

    pool.query(`
      INSERT INTO providers (user_id, business_name, description, services, hourly_rate, latitude, longitude, rating, total_reviews, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      provider2Result.lastInsertRowid,
      'HandyFix Solutions',
      'Home repairs and maintenance specialists',
      JSON.stringify(['plumbing', 'electrical', 'carpentry', 'painting']),
      35.00,
      40.7589,
      -73.9851,
      4.8,
      25
    ]);

    // Create sample quote request
    pool.query(`
      INSERT INTO quote_requests (customer_id, service_type, description, address, preferred_date, estimated_budget, latitude, longitude, status, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      customerResult.lastInsertRowid,
      'house_cleaning',
      'Need a deep cleaning for a 3-bedroom apartment',
      '123 Main St, New York, NY 10001',
      '2024-01-15 10:00:00',
      150.00,
      40.7505,
      -73.9934,
      'open'
    ]);

    console.log('✅ Development data seeded successfully');
    console.log('📧 Test accounts created:');
    console.log('   Customer: customer@example.com / password123');
    console.log('   Provider 1: provider1@example.com / password123');
    console.log('   Provider 2: provider2@example.com / password123');

  } catch (error) {
    console.error('Error seeding data:', error);
  }
};

module.exports = { seedData };