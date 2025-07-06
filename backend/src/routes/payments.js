const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database-dev');
const auth = require('../middleware/auth');
const router = express.Router();

// Process payment
router.post('/process', auth, [
  body('bookingId').isInt(),
  body('amount').isNumeric(),
  body('paymentMethod').isIn(['card', 'paypal', 'apple_pay', 'google_pay'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bookingId, amount, paymentMethod, paymentToken } = req.body;

    // Verify booking belongs to user
    const booking = await pool.query(
      'SELECT * FROM bookings WHERE id = $1 AND customer_id = $2',
      [bookingId, req.user.userId]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Process payment with payment gateway (placeholder)
    const paymentResult = await processPaymentWithGateway({
      amount,
      paymentMethod,
      paymentToken,
      bookingId
    });

    if (paymentResult.success) {
      // Record payment
      const result = await pool.query(`
        INSERT INTO payments (
          booking_id, customer_id, amount, payment_method, 
          transaction_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'completed', NOW())
        RETURNING *
      `, [bookingId, req.user.userId, amount, paymentMethod, paymentResult.transactionId]);

      // Update booking status
      await pool.query(
        'UPDATE bookings SET payment_status = $1 WHERE id = $2',
        ['paid', bookingId]
      );

      res.json({
        message: 'Payment processed successfully',
        payment: result.rows[0]
      });
    } else {
      res.status(400).json({ error: 'Payment failed', details: paymentResult.error });
    }
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get payment history
router.get('/history', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT 
        p.*,
        b.service_type,
        b.scheduled_date,
        CASE 
          WHEN b.customer_id = $1 THEN 'outgoing'
          ELSE 'incoming'
        END as payment_type
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.customer_id = $1 OR b.provider_id IN (
        SELECT id FROM providers WHERE user_id = $1
      )
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.userId, parseInt(limit), offset]);

    res.json({
      payments: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Placeholder payment processing function
async function processPaymentWithGateway({ amount, paymentMethod, paymentToken, bookingId }) {
  // This would integrate with actual payment gateways like Stripe, PayPal, etc.
  // For now, return a mock success response
  return {
    success: true,
    transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    amount: amount,
    paymentMethod: paymentMethod
  };
}

module.exports = router;