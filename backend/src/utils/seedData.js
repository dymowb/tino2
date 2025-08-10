const bcrypt = require('bcryptjs');
const { pool } = require('../config/database-dev');

// Sample data arrays
const customerData = [
  { email: 'john.doe@email.com', firstName: 'John', lastName: 'Doe', phone: '+1234567801' },
  { email: 'sarah.wilson@email.com', firstName: 'Sarah', lastName: 'Wilson', phone: '+1234567802' },
  { email: 'michael.brown@email.com', firstName: 'Michael', lastName: 'Brown', phone: '+1234567803' },
  { email: 'emma.davis@email.com', firstName: 'Emma', lastName: 'Davis', phone: '+1234567804' },
  { email: 'james.miller@email.com', firstName: 'James', lastName: 'Miller', phone: '+1234567805' },
  { email: 'olivia.garcia@email.com', firstName: 'Olivia', lastName: 'Garcia', phone: '+1234567806' },
  { email: 'william.martinez@email.com', firstName: 'William', lastName: 'Martinez', phone: '+1234567807' },
  { email: 'sophia.anderson@email.com', firstName: 'Sophia', lastName: 'Anderson', phone: '+1234567808' },
  { email: 'benjamin.taylor@email.com', firstName: 'Benjamin', lastName: 'Taylor', phone: '+1234567809' },
  { email: 'ava.thomas@email.com', firstName: 'Ava', lastName: 'Thomas', phone: '+1234567810' },
  { email: 'lucas.jackson@email.com', firstName: 'Lucas', lastName: 'Jackson', phone: '+1234567811' },
  { email: 'mia.white@email.com', firstName: 'Mia', lastName: 'White', phone: '+1234567812' },
  { email: 'henry.harris@email.com', firstName: 'Henry', lastName: 'Harris', phone: '+1234567813' },
  { email: 'charlotte.clark@email.com', firstName: 'Charlotte', lastName: 'Clark', phone: '+1234567814' },
  { email: 'alexander.lewis@email.com', firstName: 'Alexander', lastName: 'Lewis', phone: '+1234567815' },
  { email: 'amelia.robinson@email.com', firstName: 'Amelia', lastName: 'Robinson', phone: '+1234567816' },
  { email: 'daniel.walker@email.com', firstName: 'Daniel', lastName: 'Walker', phone: '+1234567817' },
  { email: 'harper.hall@email.com', firstName: 'Harper', lastName: 'Hall', phone: '+1234567818' },
  { email: 'matthew.allen@email.com', firstName: 'Matthew', lastName: 'Allen', phone: '+1234567819' },
  { email: 'evelyn.young@email.com', firstName: 'Evelyn', lastName: 'Young', phone: '+1234567820' },
  { email: 'jackson.hernandez@email.com', firstName: 'Jackson', lastName: 'Hernandez', phone: '+1234567821' },
  { email: 'abigail.king@email.com', firstName: 'Abigail', lastName: 'King', phone: '+1234567822' }
];

const providerData = [
  { 
    email: 'clean.masters@email.com', firstName: 'Maria', lastName: 'Rodriguez', phone: '+1234567901',
    businessName: 'CleanMasters Pro', description: 'Professional residential and commercial cleaning services',
    services: ['house_cleaning', 'deep_cleaning', 'office_cleaning', 'post_construction_cleanup'],
    hourlyRate: 28.00, lat: 40.7128, lng: -74.0060
  },
  { 
    email: 'sparkle.clean@email.com', firstName: 'Jennifer', lastName: 'Kim', phone: '+1234567902',
    businessName: 'Sparkle & Shine', description: 'Eco-friendly cleaning solutions for your home',
    services: ['house_cleaning', 'green_cleaning', 'move_in_out_cleaning'],
    hourlyRate: 32.00, lat: 40.7589, lng: -73.9851
  },
  { 
    email: 'handy.solutions@email.com', firstName: 'Robert', lastName: 'Thompson', phone: '+1234567903',
    businessName: 'HandyFix Solutions', description: 'Complete home repair and maintenance services',
    services: ['plumbing', 'electrical', 'carpentry', 'painting', 'appliance_repair'],
    hourlyRate: 45.00, lat: 40.7505, lng: -73.9934
  },
  { 
    email: 'green.thumb@email.com', firstName: 'Carlos', lastName: 'Mendoza', phone: '+1234567904',
    businessName: 'Green Thumb Landscaping', description: 'Professional landscaping and garden maintenance',
    services: ['lawn_care', 'garden_maintenance', 'tree_trimming', 'landscape_design'],
    hourlyRate: 35.00, lat: 40.7282, lng: -73.7949
  },
  { 
    email: 'perfect.paint@email.com', firstName: 'David', lastName: 'Chen', phone: '+1234567905',
    businessName: 'Perfect Paint Pro', description: 'Interior and exterior painting specialists',
    services: ['interior_painting', 'exterior_painting', 'wallpaper_installation'],
    hourlyRate: 40.00, lat: 40.6782, lng: -73.9442
  },
  { 
    email: 'elite.electrical@email.com', firstName: 'Amanda', lastName: 'Johnson', phone: '+1234567906',
    businessName: 'Elite Electrical', description: 'Licensed electrical services for residential and commercial',
    services: ['electrical_repair', 'wiring', 'fixture_installation', 'electrical_inspection'],
    hourlyRate: 55.00, lat: 40.7831, lng: -73.9712
  },
  { 
    email: 'crystal.windows@email.com', firstName: 'Lisa', lastName: 'Williams', phone: '+1234567907',
    businessName: 'Crystal Clear Windows', description: 'Professional window cleaning and pressure washing',
    services: ['window_cleaning', 'pressure_washing', 'gutter_cleaning'],
    hourlyRate: 25.00, lat: 40.6892, lng: -74.0445
  },
  { 
    email: 'plumb.perfect@email.com', firstName: 'Michael', lastName: 'O\'Brien', phone: '+1234567908',
    businessName: 'Plumb Perfect', description: 'Emergency plumbing and drain cleaning services',
    services: ['plumbing_repair', 'drain_cleaning', 'pipe_installation', 'emergency_plumbing'],
    hourlyRate: 50.00, lat: 40.7608, lng: -73.9776
  },
  { 
    email: 'floor.masters@email.com', firstName: 'Sarah', lastName: 'Davis', phone: '+1234567909',
    businessName: 'Floor Masters', description: 'Hardwood, tile, and carpet installation and repair',
    services: ['flooring_installation', 'carpet_cleaning', 'tile_repair', 'hardwood_refinishing'],
    hourlyRate: 42.00, lat: 40.7505, lng: -73.9934
  },
  { 
    email: 'hvac.experts@email.com', firstName: 'Thomas', lastName: 'Wilson', phone: '+1234567910',
    businessName: 'HVAC Experts', description: 'Heating, ventilation, and air conditioning services',
    services: ['hvac_repair', 'ac_installation', 'heating_repair', 'duct_cleaning'],
    hourlyRate: 60.00, lat: 40.7128, lng: -74.0060
  },
  { 
    email: 'organize.it@email.com', firstName: 'Rachel', lastName: 'Martinez', phone: '+1234567911',
    businessName: 'Organize It!', description: 'Professional home and office organization services',
    services: ['home_organization', 'office_organization', 'decluttering', 'storage_solutions'],
    hourlyRate: 30.00, lat: 40.7282, lng: -73.7949
  },
  { 
    email: 'pest.away@email.com', firstName: 'Kevin', lastName: 'Brown', phone: '+1234567912',
    businessName: 'Pest Away Solutions', description: 'Safe and effective pest control services',
    services: ['pest_control', 'termite_treatment', 'rodent_control', 'insect_extermination'],
    hourlyRate: 38.00, lat: 40.6782, lng: -73.9442
  },
  { 
    email: 'security.first@email.com', firstName: 'Jessica', lastName: 'Garcia', phone: '+1234567913',
    businessName: 'Security First', description: 'Home security system installation and monitoring',
    services: ['security_installation', 'camera_setup', 'alarm_systems', 'smart_home_integration'],
    hourlyRate: 48.00, lat: 40.7831, lng: -73.9712
  },
  { 
    email: 'pool.care@email.com', firstName: 'Mark', lastName: 'Anderson', phone: '+1234567914',
    businessName: 'Pool Care Professionals', description: 'Complete pool maintenance and repair services',
    services: ['pool_cleaning', 'pool_repair', 'equipment_maintenance', 'chemical_balancing'],
    hourlyRate: 35.00, lat: 40.6892, lng: -74.0445
  },
  { 
    email: 'appliance.rescue@email.com', firstName: 'Nicole', lastName: 'Taylor', phone: '+1234567915',
    businessName: 'Appliance Rescue', description: 'Expert appliance repair and maintenance',
    services: ['appliance_repair', 'dishwasher_repair', 'refrigerator_repair', 'washer_dryer_repair'],
    hourlyRate: 45.00, lat: 40.7608, lng: -73.9776
  },
  { 
    email: 'roof.right@email.com', firstName: 'Christopher', lastName: 'Miller', phone: '+1234567916',
    businessName: 'Roof Right Contractors', description: 'Roofing installation, repair, and maintenance',
    services: ['roof_repair', 'gutter_installation', 'roof_inspection', 'shingle_replacement'],
    hourlyRate: 52.00, lat: 40.7505, lng: -73.9934
  },
  { 
    email: 'move.easy@email.com', firstName: 'Ashley', lastName: 'Jackson', phone: '+1234567917',
    businessName: 'Move Easy Services', description: 'Professional moving and packing services',
    services: ['moving_services', 'packing', 'furniture_assembly', 'storage_solutions'],
    hourlyRate: 33.00, lat: 40.7128, lng: -74.0060
  },
  { 
    email: 'detail.masters@email.com', firstName: 'Ryan', lastName: 'White', phone: '+1234567918',
    businessName: 'Detail Masters', description: 'Premium car detailing and mobile wash services',
    services: ['car_detailing', 'mobile_car_wash', 'interior_cleaning', 'wax_protection'],
    hourlyRate: 28.00, lat: 40.7282, lng: -73.7949
  },
  { 
    email: 'tech.help@email.com', firstName: 'Michelle', lastName: 'Harris', phone: '+1234567919',
    businessName: 'Tech Help Solutions', description: 'Computer repair and tech support services',
    services: ['computer_repair', 'virus_removal', 'data_recovery', 'network_setup'],
    hourlyRate: 40.00, lat: 40.6782, lng: -73.9442
  },
  { 
    email: 'senior.care@email.com', firstName: 'Patricia', lastName: 'Clark', phone: '+1234567920',
    businessName: 'Senior Care Companions', description: 'Compassionate home care services for seniors',
    services: ['senior_care', 'companion_services', 'meal_preparation', 'medication_reminders'],
    hourlyRate: 22.00, lat: 40.7831, lng: -73.9712
  },
  { 
    email: 'pet.care@email.com', firstName: 'Brian', lastName: 'Lewis', phone: '+1234567921',
    businessName: 'Loving Pet Care', description: 'Professional pet sitting and dog walking services',
    services: ['pet_sitting', 'dog_walking', 'pet_grooming', 'overnight_care'],
    hourlyRate: 18.00, lat: 40.6892, lng: -74.0445
  },
  { 
    email: 'tutor.pro@email.com', firstName: 'Stephanie', lastName: 'Robinson', phone: '+1234567922',
    businessName: 'Tutor Pro Education', description: 'Professional tutoring for all subjects and ages',
    services: ['academic_tutoring', 'test_prep', 'language_lessons', 'music_lessons'],
    hourlyRate: 35.00, lat: 40.7608, lng: -73.9776
  }
];

const reviewComments = [
  'Excellent service! Very professional and thorough.',
  'Amazing work, exceeded my expectations completely.',
  'Punctual, reliable, and does quality work.',
  'Highly recommend! Will definitely use again.',
  'Great attention to detail and very friendly.',
  'Professional service at a fair price.',
  'Outstanding quality and customer service.',
  'Quick response time and excellent results.',
  'Very satisfied with the work performed.',
  'Knowledgeable and efficient service provider.',
  'Clean, organized, and completed on time.',
  'Went above and beyond expectations.',
  'Fantastic work! Highly professional.',
  'Great communication throughout the process.',
  'Quality work at competitive pricing.',
  'Reliable and trustworthy service.',
  'Impressive attention to detail.',
  'Courteous and skilled professional.',
  'Delivered exactly what was promised.',
  'Would definitely recommend to others.'
];

const seedData = async () => {
  try {
    console.log('🌱 Starting comprehensive data seeding...');
    
    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await pool.query('DELETE FROM reviews');
    await pool.query('DELETE FROM payments');
    await pool.query('DELETE FROM messages');
    await pool.query('DELETE FROM quotes');
    await pool.query('DELETE FROM quote_requests');
    await pool.query('DELETE FROM bookings');
    await pool.query('DELETE FROM providers');
    await pool.query('DELETE FROM users');
    
    const hashedPassword = await bcrypt.hash('password123', 12);
    const customerIds = [];
    const providerIds = [];
    const providerUserIds = [];
    
    console.log('👥 Creating customer users...');
    // Create customers
    for (const customer of customerData) {
      const result = await pool.query(
        'INSERT INTO users (email, password, first_name, last_name, user_type, phone) VALUES (?, ?, ?, ?, ?, ?)',
        [customer.email, hashedPassword, customer.firstName, customer.lastName, 'customer', customer.phone]
      );
      customerIds.push(result.lastInsertRowid);
    }
    
    console.log('🔧 Creating service providers...');
    // Create providers and their profiles
    for (const provider of providerData) {
      const userResult = await pool.query(
        'INSERT INTO users (email, password, first_name, last_name, user_type, phone) VALUES (?, ?, ?, ?, ?, ?)',
        [provider.email, hashedPassword, provider.firstName, provider.lastName, 'provider', provider.phone]
      );
      providerUserIds.push(userResult.lastInsertRowid);
      
      const providerResult = await pool.query(
        'INSERT INTO providers (user_id, business_name, description, services, hourly_rate, latitude, longitude, rating, total_reviews) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userResult.lastInsertRowid, provider.businessName, provider.description, JSON.stringify(provider.services), provider.hourlyRate, provider.lat, provider.lng, 0, 0]
      );
      providerIds.push(providerResult.lastInsertRowid);
    }
    
    console.log('📅 Creating bookings...');
    const bookingIds = [];
    const completedBookings = [];
    
    // Create bookings (10-20 completed services per user)
    for (let i = 0; i < customerIds.length; i++) {
      const customerId = customerIds[i];
      const numBookings = Math.floor(Math.random() * 11) + 10; // 10-20 bookings
      
      for (let j = 0; j < numBookings; j++) {
        const providerId = providerIds[Math.floor(Math.random() * providerIds.length)];
        const provider = providerData[providerIds.indexOf(providerId)];
        const serviceType = provider.services[Math.floor(Math.random() * provider.services.length)];
        
        // Most bookings should be completed
        const status = j < numBookings - 2 ? 'completed' : ['pending', 'confirmed'][Math.floor(Math.random() * 2)];
        const scheduledDate = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000); // Last 90 days
        
        const bookingResult = await pool.query(
          'INSERT INTO bookings (customer_id, provider_id, service_type, scheduled_date, address, description, estimated_duration, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [customerId, providerId, serviceType, scheduledDate.toISOString(), `${100 + j} Main St, New York, NY`, `${serviceType.replace('_', ' ')} service`, 120, status]
        );
        
        bookingIds.push(bookingResult.lastInsertRowid);
        if (status === 'completed') {
          completedBookings.push({ id: bookingResult.lastInsertRowid, customerId, providerId });
        }
      }
    }
    
    console.log('⭐ Creating reviews (10-20 per provider)...');
    const reviewsPerProvider = {};
    
    // Create reviews for completed bookings
    for (const booking of completedBookings) {
      if (!reviewsPerProvider[booking.providerId]) {
        reviewsPerProvider[booking.providerId] = 0;
      }
      
      if (reviewsPerProvider[booking.providerId] < 20) {
        const rating = Math.floor(Math.random() * 2) + 4; // 4-5 stars mostly
        const comment = reviewComments[Math.floor(Math.random() * reviewComments.length)];
        const customerName = customerData[customerIds.indexOf(booking.customerId)];
        
        await pool.query(
          'INSERT INTO reviews (booking_id, customer_id, provider_id, rating, comment, customer_name) VALUES (?, ?, ?, ?, ?, ?)',
          [booking.id, booking.customerId, booking.providerId, rating, comment, `${customerName.firstName} ${customerName.lastName}`]
        );
        
        reviewsPerProvider[booking.providerId]++;
      }
    }
    
    console.log('🔢 Updating provider ratings...');
    // Update provider ratings based on reviews
    for (let i = 0; i < providerIds.length; i++) {
      const providerId = providerIds[i];
      const reviewStats = await pool.query(
        'SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews FROM reviews WHERE provider_id = ?',
        [providerId]
      );
      
      if (reviewStats.rows[0].total_reviews > 0) {
        await pool.query(
          'UPDATE providers SET rating = ?, total_reviews = ? WHERE id = ?',
          [Math.round(reviewStats.rows[0].avg_rating * 10) / 10, reviewStats.rows[0].total_reviews, providerId]
        );
      }
    }
    
    console.log('💳 Creating payments...');
    // Create payments for completed bookings
    for (const booking of completedBookings.slice(0, Math.floor(completedBookings.length * 0.8))) {
      const amount = (Math.random() * 200 + 50).toFixed(2);
      await pool.query(
        'INSERT INTO payments (booking_id, customer_id, amount, payment_method, transaction_id, status) VALUES (?, ?, ?, ?, ?, ?)',
        [booking.id, booking.customerId, amount, 'credit_card', `txn_${Date.now()}_${Math.random().toString(36)}`, 'completed']
      );
    }
    
    console.log('💬 Creating sample messages...');
    // Create some sample messages
    for (let i = 0; i < 50; i++) {
      const customerId = customerIds[Math.floor(Math.random() * customerIds.length)];
      const providerUserId = providerUserIds[Math.floor(Math.random() * providerUserIds.length)];
      
      await pool.query(
        'INSERT INTO messages (sender_id, recipient_id, message) VALUES (?, ?, ?)',
        [customerId, providerUserId, `Hello, I'm interested in your services. Could you provide more details?`]
      );
    }
    
    console.log('✅ Comprehensive data seeded successfully!');
    console.log(`📊 Created:`);
    console.log(`   👥 ${customerData.length} customers`);
    console.log(`   🔧 ${providerData.length} service providers`);
    console.log(`   📅 ${bookingIds.length} bookings`);
    console.log(`   ⭐ Reviews for each provider (10-20 each)`);
    console.log(`   💳 Payments for completed services`);
    console.log(`   💬 Sample messages`);
    console.log('');
    console.log('🔑 All accounts use password: password123');
    
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  }
};

module.exports = { seedData };