const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database-dev');
const auth = require('../middleware/auth');
const router = express.Router();

// Create booking
router.post('/', auth, [
  body('providerId').isInt(),
  body('serviceType').notEmpty(),
  body('scheduledDate').isISO8601(),
  body('address').notEmpty(),
  body('description').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { providerId, serviceType, scheduledDate, address, description, estimatedDuration } = req.body;

    const result = await pool.query(`
      INSERT INTO bookings (
        customer_id, provider_id, service_type, scheduled_date, 
        address, description, estimated_duration, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      RETURNING *
    `, [req.user.userId, providerId, serviceType, scheduledDate, address, description, estimatedDuration]);

    res.status(201).json({
      message: 'Booking created successfully',
      booking: result.rows[0]
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user bookings
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        b.*,
        CASE 
          WHEN b.customer_id = ? THEN 
            JSON_OBJECT(
              'id', p.id,
              'business_name', p.business_name,
              'rating', p.rating,
              'name', u_provider.first_name || ' ' || u_provider.last_name,
              'phone', u_provider.phone
            )
          ELSE 
            JSON_OBJECT(
              'id', b.customer_id,
              'name', u_customer.first_name || ' ' || u_customer.last_name,
              'phone', u_customer.phone
            )
        END as other_party
      FROM bookings b
      LEFT JOIN providers p ON b.provider_id = p.id
      LEFT JOIN users u_provider ON p.user_id = u_provider.id
      LEFT JOIN users u_customer ON b.customer_id = u_customer.id
      WHERE (b.customer_id = ? OR b.provider_id IN (SELECT id FROM providers WHERE user_id = ?))
    `;

    const params = [req.user.userId, req.user.userId, req.user.userId1];

    if (status) {
      query += ` AND b.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      bookings: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update booking status
router.put('/:id/status', auth, [
  body('status').isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(`
      UPDATE bookings 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ? AND (
        customer_id = ? OR 
        provider_id IN (SELECT id FROM providers WHERE user_id = ?)
      )
      RETURNING *
    `, [status, id, req.user.userId, req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or access denied' });
    }

    res.json({
      message: 'Booking status updated successfully',
      booking: result.rows[0]
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;