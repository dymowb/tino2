require('dotenv').config();

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

async function addDemoCustomers() {
  console.log('🚀 Adding demo customer accounts...');
  
  // Connect to the SQLite database
  const dbPath = path.join(__dirname, '../data/development.db');
  const db = new sqlite3.Database(dbPath);
  
  try {
    // Hash the demo password
    const demoPassword = await bcrypt.hash('demo123', 12);
    
    // Demo customer accounts
    const demoCustomers = [
      {
        email: 'customer@demo.com',
        password: demoPassword,
        firstName: 'Demo',
        lastName: 'Customer',
        userType: 'customer',
        phone: '+1234567890'
      },
      {
        email: 'john.customer@demo.com', 
        password: demoPassword,
        firstName: 'John',
        lastName: 'Smith',
        userType: 'customer',
        phone: '+1234567891'
      },
      {
        email: 'jane.customer@demo.com',
        password: demoPassword,
        firstName: 'Jane',
        lastName: 'Doe', 
        userType: 'customer',
        phone: '+1234567892'
      }
    ];
    
    // Insert each demo customer
    for (const customer of demoCustomers) {
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT OR REPLACE INTO users 
          (email, password, first_name, last_name, user_type, phone, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          customer.email,
          customer.password,
          customer.firstName,
          customer.lastName,
          customer.userType,
          customer.phone,
          new Date().toISOString(),
          new Date().toISOString()
        ], function(err) {
          if (err) {
            console.error(`❌ Error creating ${customer.email}:`, err);
            reject(err);
          } else {
            console.log(`✅ Created customer: ${customer.email}`);
            resolve();
          }
        });
      });
    }
    
    console.log('\n🎉 Demo customer accounts created successfully!');
    console.log('📧 Login Credentials (password for all: demo123):');
    console.log('   • customer@demo.com');
    console.log('   • john.customer@demo.com');
    console.log('   • jane.customer@demo.com');
    console.log('\n📧 Existing Provider Account:');
    console.log('   • lauralee@business.com (password: password123)');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

addDemoCustomers();