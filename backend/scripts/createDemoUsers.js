const { pool } = require('../config/database-dev');

async function createDemoUsers() {
  console.log('🚀 Creating demo users...');
  
  // Use a pre-hashed password for demo123
  const demoPassword = '$2b$12$sSrEJq3D4d435iFwC0nQiOSeHHIHPfWUC2YfTdDKfYez86sIUMoru';
  
  try {
    // Create demo customer
    const customerResult = await pool.query(`
      INSERT OR REPLACE INTO users (email, password, first_name, last_name, user_type, phone, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'customer@demo.com',
      demoPassword,
      'Demo',
      'Customer',
      'customer',
      '+1234567890',
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    
    console.log('✅ Demo customer created: customer@demo.com / demo123');

    // Create demo provider
    const providerResult = await pool.query(`
      INSERT OR REPLACE INTO users (email, password, first_name, last_name, user_type, phone, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'provider@demo.com',
      demoPassword,
      'Demo',
      'Provider',
      'provider',
      '+1234567891',
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    
    console.log('✅ Demo provider created: provider@demo.com / demo123');

    // Get the provider user ID to create provider profile
    const userResult = await pool.query(`
      SELECT id FROM users WHERE email = ?
    `, ['provider@demo.com']);

    if (userResult.rows && userResult.rows.length > 0) {
      const providerId = userResult.rows[0].id;
      
      // Create provider profile
      await pool.query(`
        INSERT OR REPLACE INTO providers (
          user_id, business_name, description, services, hourly_rate, 
          latitude, longitude, availability_status, rating, total_reviews, 
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        providerId,
        'Demo Cleaning Services',
        'Professional cleaning services for your home and office.',
        JSON.stringify(['house_cleaning', 'office_cleaning']),
        25.00,
        40.7128, // NYC coordinates
        -74.0060,
        'available',
        4.8,
        15,
        true,
        new Date().toISOString(),
        new Date().toISOString()
      ]);
      
      console.log('✅ Demo provider profile created');
    }

    console.log('\n🎉 Demo users created successfully!');
    console.log('📧 Customer Login: customer@demo.com / demo123');
    console.log('📧 Provider Login: provider@demo.com / demo123');
    
  } catch (error) {
    console.error('❌ Error creating demo users:', error.message);
  }
  
  process.exit(0);
}

createDemoUsers();