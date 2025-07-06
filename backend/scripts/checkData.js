#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { pool } = require('../src/config/database-dev');

async function checkData() {
  try {
    console.log('📊 Database Data Summary:');
    
    const usersResult = pool.query('SELECT COUNT(*) as count, user_type FROM users GROUP BY user_type');
    console.log('👥 Users:');
    usersResult.rows.forEach(row => {
      console.log(`   ${row.user_type}: ${row.count}`);
    });

    const providersResult = pool.query('SELECT COUNT(*) as count FROM providers');
    console.log(`🏢 Providers: ${providersResult.rows[0].count}`);

    const bookingsResult = pool.query('SELECT COUNT(*) as count FROM bookings');
    console.log(`📅 Bookings: ${bookingsResult.rows[0].count}`);

    const reviewsResult = pool.query('SELECT COUNT(*) as count FROM reviews');
    console.log(`⭐ Reviews: ${reviewsResult.rows[0].count}`);

    const paymentsResult = pool.query('SELECT COUNT(*) as count FROM payments');
    console.log(`💳 Payments: ${paymentsResult.rows[0].count}`);

    const quotesResult = pool.query('SELECT COUNT(*) as count FROM quote_requests');
    console.log(`💬 Quote Requests: ${quotesResult.rows[0].count}`);

    // Test a provider query
    const testProvider = pool.query('SELECT * FROM providers LIMIT 1');
    if (testProvider.rows.length > 0) {
      console.log('\n🔍 Sample Provider:');
      console.log(`   Business: ${testProvider.rows[0].business_name}`);
      console.log(`   Services: ${testProvider.rows[0].services}`);
      console.log(`   Rating: ${testProvider.rows[0].rating}`);
    }

  } catch (error) {
    console.error('❌ Error checking data:', error);
  }
  
  process.exit(0);
}

checkData();