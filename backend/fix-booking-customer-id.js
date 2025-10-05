const { AppDataSource } = require('./src/data-source');

async function fixBookingCustomerIds() {
  try {
    await AppDataSource.initialize();
    console.log('Database connected successfully');

    // Get the current authenticated user (from localStorage we know it's bb0f74ef-dac9-480a-855b-e47c8d78d819)
    const targetCustomerId = 'bb0f74ef-dac9-480a-855b-e47c8d78d819';

    // Check if this user exists
    const userExists = await AppDataSource.query('SELECT id FROM users WHERE id = ?', [targetCustomerId]);
    console.log('Target customer exists:', userExists.length > 0);

    if (userExists.length === 0) {
      console.log('Target customer not found. Need to use the actual authenticated user ID.');

      // Find the demo customer
      const demoCustomer = await AppDataSource.query('SELECT id FROM users WHERE email = ?', ['customer@demo.com']);
      if (demoCustomer.length > 0) {
        const actualCustomerId = demoCustomer[0].id;
        console.log('Found demo customer with ID:', actualCustomerId);

        // Update all bookings to point to this customer
        const result = await AppDataSource.query(
          'UPDATE bookings SET customerId = ? WHERE customerId != ?',
          [actualCustomerId, actualCustomerId]
        );

        console.log('Updated bookings count:', result.changes || 'unknown');

        // Verify the update
        const bookingCount = await AppDataSource.query('SELECT COUNT(*) as count FROM bookings WHERE customerId = ?', [actualCustomerId]);
        console.log('Total bookings for demo customer:', bookingCount[0].count);
      }
    } else {
      // Update all bookings to the target customer ID
      const result = await AppDataSource.query(
        'UPDATE bookings SET customerId = ? WHERE customerId != ?',
        [targetCustomerId, targetCustomerId]
      );

      console.log('Updated bookings count:', result.changes || 'unknown');

      // Verify the update
      const bookingCount = await AppDataSource.query('SELECT COUNT(*) as count FROM bookings WHERE customerId = ?', [targetCustomerId]);
      console.log('Total bookings for target customer:', bookingCount[0].count);
    }

    await AppDataSource.destroy();
    console.log('Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixBookingCustomerIds();