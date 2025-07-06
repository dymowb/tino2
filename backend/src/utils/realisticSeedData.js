const bcrypt = require('bcryptjs');
const { pool } = require('../config/database-dev');

// Realistic data arrays
const firstNames = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth',
  'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Christopher', 'Karen',
  'Charles', 'Nancy', 'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Helen', 'Mark', 'Sandra',
  'Donald', 'Donna', 'Steven', 'Carol', 'Paul', 'Ruth', 'Andrew', 'Sharon', 'Joshua', 'Michelle',
  'Kenneth', 'Laura', 'Kevin', 'Emily', 'Brian', 'Kimberly', 'George', 'Deborah', 'Timothy', 'Dorothy',
  'Ronald', 'Amy', 'Jason', 'Angela', 'Edward', 'Ashley', 'Jeffrey', 'Brenda', 'Ryan', 'Emma',
  'Jacob', 'Olivia', 'Gary', 'Cynthia', 'Nicholas', 'Marie', 'Eric', 'Janet', 'Jonathan', 'Catherine',
  'Stephen', 'Frances', 'Larry', 'Christine', 'Justin', 'Samantha', 'Scott', 'Debra', 'Brandon', 'Rachel'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
];

const businessNames = [
  'Pro Clean Services', 'Elite Home Care', 'Quick Fix Solutions', 'Premier Maintenance', 'Expert Touch',
  'Reliable Home Services', 'Master Craft Works', 'Superior Cleaning Co', 'Precision Repairs', 'Quality Care Plus',
  'Diamond Services', 'Golden Touch Cleaning', 'Swift Solutions', 'Perfect Home Care', 'Ultimate Maintenance',
  'Crystal Clear Services', 'Ace Home Solutions', 'Prime Time Services', 'Top Notch Care', 'Stellar Cleaning',
  'Rapid Response Services', 'Excellence Home Care', 'Professional Touch', 'Spotless Solutions', 'Five Star Services'
];

const serviceCategories = {
  'house_cleaning': {
    name: 'House Cleaning',
    services: ['house_cleaning', 'deep_cleaning', 'move_in_cleaning', 'move_out_cleaning', 'post_construction_cleaning'],
    rate: [20, 35],
    photos: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
      'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400',
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400'
    ]
  },
  'plumbing': {
    name: 'Plumbing',
    services: ['plumbing', 'drain_cleaning', 'pipe_repair', 'faucet_installation', 'toilet_repair'],
    rate: [45, 85],
    photos: [
      'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=400',
      'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=400',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400'
    ]
  },
  'electrical': {
    name: 'Electrical',
    services: ['electrical', 'wiring', 'outlet_installation', 'lighting_installation', 'electrical_repair'],
    rate: [50, 90],
    photos: [
      'https://images.unsplash.com/photo-1621905252472-91a5a11f6e45?w=400',
      'https://images.unsplash.com/photo-1551536241-b1f8e9e1e0a2?w=400',
      'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400'
    ]
  },
  'carpentry': {
    name: 'Carpentry',
    services: ['carpentry', 'furniture_assembly', 'deck_building', 'cabinet_installation', 'custom_woodwork'],
    rate: [35, 70],
    photos: [
      'https://images.unsplash.com/photo-1609205097515-9c5bb05fea77?w=400',
      'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400',
      'https://images.unsplash.com/photo-1617380171727-d9e6ba42b8c3?w=400'
    ]
  },
  'painting': {
    name: 'Painting',
    services: ['painting', 'interior_painting', 'exterior_painting', 'wall_repair', 'wallpaper_removal'],
    rate: [25, 50],
    photos: [
      'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400',
      'https://images.unsplash.com/photo-1581404719674-241c16fdfad6?w=400',
      'https://images.unsplash.com/photo-1609205096853-1f7dd4446c82?w=400'
    ]
  },
  'gardening': {
    name: 'Gardening & Landscaping',
    services: ['gardening', 'lawn_mowing', 'landscaping', 'tree_trimming', 'garden_maintenance'],
    rate: [20, 45],
    photos: [
      'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400',
      'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=400',
      'https://images.unsplash.com/photo-1529688530647-80e027d2ebb6?w=400'
    ]
  },
  'hvac': {
    name: 'HVAC',
    services: ['hvac', 'air_conditioning', 'heating_repair', 'duct_cleaning', 'thermostat_installation'],
    rate: [55, 95],
    photos: [
      'https://images.unsplash.com/photo-1621905251179-baf70d79e30b?w=400',
      'https://images.unsplash.com/photo-1609205096853-1f7dd4446c82?w=400',
      'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400'
    ]
  },
  'appliance_repair': {
    name: 'Appliance Repair',
    services: ['appliance_repair', 'washer_repair', 'dryer_repair', 'refrigerator_repair', 'dishwasher_repair'],
    rate: [40, 80],
    photos: [
      'https://images.unsplash.com/photo-1621905252472-91a5a11f6e45?w=400',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400'
    ]
  }
};

const addresses = [
  '123 Main St, New York, NY 10001',
  '456 Oak Ave, Brooklyn, NY 11201',
  '789 Pine St, Queens, NY 11354',
  '321 Elm Dr, Manhattan, NY 10002',
  '654 Maple Ln, Bronx, NY 10451',
  '987 Cedar Rd, Staten Island, NY 10301',
  '147 Birch St, Yonkers, NY 10701',
  '258 Ash Ave, White Plains, NY 10601',
  '369 Willow Way, New Rochelle, NY 10801',
  '741 Spruce St, Mount Vernon, NY 10550'
];

const reviewComments = [
  'Excellent service! Very professional and thorough.',
  'Great work, arrived on time and finished quickly.',
  'Outstanding quality, would definitely hire again.',
  'Professional and reliable. Highly recommended!',
  'Amazing attention to detail. Very satisfied.',
  'Quick response and fair pricing. Great job!',
  'Very knowledgeable and efficient. Perfect results.',
  'Friendly service and excellent workmanship.',
  'Exceeded expectations. Will use again for sure.',
  'Prompt, professional, and reasonably priced.',
  'Fantastic work! Clean and organized throughout.',
  'Very impressed with the quality and speed.',
  'Courteous and skilled. Highly recommend.',
  'Great communication and beautiful results.',
  'Reliable and trustworthy. Excellent service.'
];

// Helper functions
const randomChoice = (array) => array[Math.floor(Math.random() * array.length)];
const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(2);
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

// NYC coordinates for realistic locations
const nycBounds = {
  minLat: 40.4774,
  maxLat: 40.9176,
  minLng: -74.2591,
  maxLng: -73.7004
};

const generateCoordinates = () => ({
  lat: parseFloat((Math.random() * (nycBounds.maxLat - nycBounds.minLat) + nycBounds.minLat).toFixed(6)),
  lng: parseFloat((Math.random() * (nycBounds.maxLng - nycBounds.minLng) + nycBounds.minLng).toFixed(6))
});

const generatePhoneNumber = () => {
  const areaCode = randomChoice(['212', '646', '917', '347', '718', '929']);
  const exchange = randomNumber(200, 999);
  const number = randomNumber(1000, 9999);
  return `+1${areaCode}${exchange}${number}`;
};

const generateEmail = (firstName, lastName, domain = 'example.com') => {
  const variations = [
    `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
    `${firstName.toLowerCase()}${lastName.toLowerCase()}@${domain}`,
    `${firstName.toLowerCase()}${randomNumber(1, 999)}@${domain}`,
    `${firstName.charAt(0).toLowerCase()}${lastName.toLowerCase()}@${domain}`
  ];
  return randomChoice(variations);
};

const seedRealisticData = async () => {
  try {
    console.log('🌱 Starting realistic data seeding...');
    
    // Clear existing data
    console.log('🗑️ Clearing existing data...');
    pool.query('DELETE FROM reviews');
    pool.query('DELETE FROM payments');
    pool.query('DELETE FROM messages');
    pool.query('DELETE FROM quotes');
    pool.query('DELETE FROM quote_requests');
    pool.query('DELETE FROM bookings');
    pool.query('DELETE FROM providers');
    pool.query('DELETE FROM users');

    const hashedPassword = await bcrypt.hash('password123', 12);
    const userIds = [];
    const providerIds = [];

    // Generate 1000 users (900 customers, 100 providers)
    console.log('👥 Creating 1000 users...');
    for (let i = 0; i < 1000; i++) {
      const firstName = randomChoice(firstNames);
      const lastName = randomChoice(lastNames);
      const userType = i < 100 ? 'provider' : 'customer';
      const email = generateEmail(firstName, lastName, userType === 'provider' ? 'business.com' : 'gmail.com');
      const phone = generatePhoneNumber();
      
      const createdAt = randomDate(new Date('2023-01-01'), new Date('2024-12-01'));
      
      const result = pool.query(`
        INSERT INTO users (email, password, first_name, last_name, user_type, phone, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [email, hashedPassword, firstName, lastName, userType, phone, createdAt.toISOString(), createdAt.toISOString()]);

      userIds.push({ id: result.lastInsertRowid, userType, firstName, lastName });
      
      if (i % 100 === 0) {
        console.log(`   Created ${i + 1}/1000 users...`);
      }
    }

    // Generate provider profiles
    console.log('🏢 Creating provider profiles...');
    const providerUsers = userIds.filter(u => u.userType === 'provider');
    
    for (let i = 0; i < providerUsers.length; i++) {
      const user = providerUsers[i];
      const categories = Object.keys(serviceCategories);
      const category = randomChoice(categories);
      const categoryData = serviceCategories[category];
      
      const businessName = `${randomChoice(businessNames)} - ${categoryData.name}`;
      const description = `Professional ${categoryData.name.toLowerCase()} services with ${randomNumber(2, 15)} years of experience. Licensed and insured.`;
      const services = JSON.stringify(categoryData.services);
      const hourlyRate = randomFloat(categoryData.rate[0], categoryData.rate[1]);
      const coords = generateCoordinates();
      const rating = randomFloat(3.5, 5.0);
      const totalReviews = randomNumber(5, 150);
      const profileImage = randomChoice(categoryData.photos);

      const result = pool.query(`
        INSERT INTO providers (
          user_id, business_name, description, services, hourly_rate, 
          latitude, longitude, availability_status, rating, total_reviews, 
          profile_image, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        user.id, businessName, description, services, hourlyRate,
        coords.lat, coords.lng, 'available', rating, totalReviews,
        profileImage, 1, new Date().toISOString(), new Date().toISOString()
      ]);

      providerIds.push({ 
        id: result.lastInsertRowid, 
        userId: user.id, 
        category,
        businessName,
        rating: parseFloat(rating)
      });

      if ((i + 1) % 25 === 0) {
        console.log(`   Created ${i + 1}/${providerUsers.length} providers...`);
      }
    }

    // Generate bookings (5-100 per customer)
    console.log('📅 Creating bookings...');
    const customerUsers = userIds.filter(u => u.userType === 'customer');
    let totalBookings = 0;

    for (let i = 0; i < customerUsers.length; i++) {
      const customer = customerUsers[i];
      const numBookings = randomNumber(5, 100);
      
      for (let j = 0; j < numBookings; j++) {
        const provider = randomChoice(providerIds);
        const providerCategory = serviceCategories[provider.category];
        const serviceType = randomChoice(providerCategory.services);
        
        const scheduledDate = randomDate(new Date('2024-01-01'), new Date('2024-12-31'));
        const address = randomChoice(addresses);
        const description = `Need ${serviceType.replace(/_/g, ' ')} service for my home.`;
        const estimatedDuration = randomNumber(1, 8);
        const status = randomChoice(['completed', 'completed', 'completed', 'confirmed', 'pending']);
        const paymentStatus = status === 'completed' ? 'paid' : 'unpaid';
        
        const createdAt = new Date(scheduledDate.getTime() - randomNumber(1, 30) * 24 * 60 * 60 * 1000);

        const result = pool.query(`
          INSERT INTO bookings (
            customer_id, provider_id, service_type, scheduled_date, address, 
            description, estimated_duration, status, payment_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          customer.id, provider.id, serviceType, scheduledDate.toISOString(), address,
          description, estimatedDuration, status, paymentStatus, 
          createdAt.toISOString(), new Date().toISOString()
        ]);

        // Generate payment for completed bookings
        if (status === 'completed') {
          const amount = randomFloat(50, 500);
          const paymentMethod = randomChoice(['card', 'paypal', 'apple_pay']);
          const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          pool.query(`
            INSERT INTO payments (
              booking_id, customer_id, amount, payment_method, transaction_id, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            result.lastInsertRowid, customer.id, amount, paymentMethod, 
            transactionId, 'completed', scheduledDate.toISOString()
          ]);

          // Generate review for completed bookings (80% chance)
          if (Math.random() < 0.8) {
            const rating = randomNumber(3, 5);
            const comment = randomChoice(reviewComments);
            const customerName = `${customer.firstName} ${customer.lastName}`;
            
            pool.query(`
              INSERT INTO reviews (
                booking_id, customer_id, provider_id, rating, comment, 
                customer_name, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
              result.lastInsertRowid, customer.id, provider.id, rating, 
              comment, customerName, new Date(scheduledDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
            ]);
          }
        }

        totalBookings++;
      }

      if ((i + 1) % 50 === 0) {
        console.log(`   Created bookings for ${i + 1}/${customerUsers.length} customers...`);
      }
    }

    // Generate quote requests
    console.log('💬 Creating quote requests...');
    for (let i = 0; i < 500; i++) {
      const customer = randomChoice(customerUsers);
      const category = randomChoice(Object.keys(serviceCategories));
      const serviceType = randomChoice(serviceCategories[category].services);
      const coords = generateCoordinates();
      
      const preferredDate = randomDate(new Date(), new Date('2025-03-01'));
      const description = `Looking for ${serviceType.replace(/_/g, ' ')} service. Please provide quote.`;
      const address = randomChoice(addresses);
      const estimatedBudget = randomFloat(100, 1000);
      
      pool.query(`
        INSERT INTO quote_requests (
          customer_id, service_type, description, address, preferred_date,
          estimated_budget, latitude, longitude, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        customer.id, serviceType, description, address, preferredDate.toISOString(),
        estimatedBudget, coords.lat, coords.lng, 'open', new Date().toISOString()
      ]);
    }

    console.log('✅ Realistic data seeding completed!');
    console.log(`📊 Data Summary:`);
    console.log(`   • 1000 users (900 customers, 100 providers)`);
    console.log(`   • 100 provider profiles across 8 categories`);
    console.log(`   • ${totalBookings} bookings with realistic dates`);
    console.log(`   • Reviews and ratings for completed services`);
    console.log(`   • 500 quote requests`);
    console.log(`   • Payments for completed bookings`);
    console.log('');
    console.log('🔑 Test accounts:');
    console.log('   • customer@example.com / password123 (any user email / password123)');
    console.log('   • provider1@example.com / password123 (any provider email / password123)');

  } catch (error) {
    console.error('❌ Error seeding realistic data:', error);
  }
};

module.exports = { seedRealisticData };