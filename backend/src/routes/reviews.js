const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database-dev');
const auth = require('../middleware/auth');
const router = express.Router();

// Submit review
router.post('/', auth, [
  body('bookingId').isInt(),
  body('providerId').isInt(),
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().isLength({ max: 500 }),
  body('categories').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bookingId, providerId, rating, comment, categories } = req.body;

    // Verify booking belongs to user and is completed
    const booking = await pool.query(
      'SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 AND status = $3',
      [bookingId, req.user.userId, 'completed']
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or not completed' });
    }

    // Check if review already exists
    const existingReview = await pool.query(
      'SELECT id FROM reviews WHERE booking_id = $1 AND customer_id = $2',
      [bookingId, req.user.userId]
    );

    if (existingReview.rows.length > 0) {
      return res.status(400).json({ error: 'Review already submitted for this booking' });
    }

    // Get customer name
    const customer = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [req.user.userId]
    );

    const customerName = `${customer.rows[0].first_name} ${customer.rows[0].last_name}`;

    // Create review
    const result = await pool.query(`
      INSERT INTO reviews (
        booking_id, customer_id, provider_id, rating, comment, 
        categories, customer_name, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [bookingId, req.user.userId, providerId, rating, comment, JSON.stringify(categories), customerName]);

    // Update provider rating
    await updateProviderRating(providerId);

    res.status(201).json({
      message: 'Review submitted successfully',
      review: result.rows[0]
    });
  } catch (error) {
    console.error('Submit review error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reviews for a provider
router.get('/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT 
        r.*,
        b.service_type,
        b.scheduled_date
      FROM reviews r
      JOIN bookings b ON r.booking_id = b.id
      WHERE r.provider_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, [providerId, parseInt(limit), offset]);

    res.json({
      reviews: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get customer's reviews
router.get('/my-reviews', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT 
        r.*,
        b.service_type,
        b.scheduled_date,
        p.business_name,
        u.first_name as provider_first_name,
        u.last_name as provider_last_name
      FROM reviews r
      JOIN bookings b ON r.booking_id = b.id
      JOIN providers p ON r.provider_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE r.customer_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.userId, parseInt(limit), offset]);

    res.json({
      reviews: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get my reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update provider rating
async function updateProviderRating(providerId) {
  try {
    const result = await pool.query(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews FROM reviews WHERE provider_id = $1',
      [providerId]
    );

    const avgRating = parseFloat(result.rows[0].avg_rating).toFixed(1);
    const totalReviews = parseInt(result.rows[0].total_reviews);

    await pool.query(
      'UPDATE providers SET rating = $1, total_reviews = $2 WHERE id = $3',
      [avgRating, totalReviews, providerId]
    );
  } catch (error) {
    console.error('Update provider rating error:', error);
  }
}

module.exports = router;