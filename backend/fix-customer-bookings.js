const { execSync } = require('child_process');
const path = require('path');

async function fixCustomerBookings() {
  console.log('Running booking customer ID fix...');

  try {
    // Get the current demo customer ID from fresh seeding
    const seedOutput = execSync('npm run seed', {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    console.log('Database reseeded successfully');
    console.log('Demo customer will have new UUID from fresh seeding');
    console.log('Issue should be resolved - frontend will pick up new customer ID on fresh login');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

fixCustomerBookings();