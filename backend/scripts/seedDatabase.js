#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { initializeDatabases } = require('../src/config/database-dev');
const { seedRealisticData } = require('../src/utils/realisticSeedData');

async function main() {
  console.log('🚀 Starting database seeding process...\n');
  
  try {
    // Initialize databases
    await initializeDatabases();
    console.log('✅ Database initialized\n');
    
    // Seed realistic data
    await seedRealisticData();
    
    console.log('\n🎉 Database seeding completed successfully!');
    console.log('You can now refresh your app to see the new data.');
    
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();