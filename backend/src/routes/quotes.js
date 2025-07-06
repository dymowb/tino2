const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database-dev');
const auth = require('../middleware/auth');
const router = express.Router();

// Request quote
router.post('/request', auth, [
  body('serviceType').notEmpty(),
  body('description').notEmpty(),
  body('address').notEmpty(),
  body('preferredDate').isISO8601(),
  body('estimatedBudget').optional().isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { serviceType, description, address, preferredDate, estimatedBudget, latitude, longitude } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_requests (
        customer_id, service_type, description, address, preferred_date,
        estimated_budget, latitude, longitude, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW())
      RETURNING *
    `, [req.user.userId, serviceType, description, address, preferredDate, estimatedBudget, latitude, longitude]);

    res.status(201).json({
      message: 'Quote request created successfully',
      quoteRequest: result.rows[0]
    });
  } catch (error) {
    console.error('Create quote request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit quote (providers only)
router.post('/:requestId/submit', auth, [
  body('totalPrice').isNumeric(),
  body('estimatedDuration').isInt(),
  body('description').notEmpty(),
  body('validUntil').isISO8601()
], async (req, res) => {
  try {
    if (req.user.userType !== 'provider') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { requestId } = req.params;
    const { totalPrice, estimatedDuration, description, validUntil, itemizedPricing } = req.body;

    // Get provider ID
    const providerResult = await pool.query(
      'SELECT id FROM providers WHERE user_id = $1',
      [req.user.userId]
    );

    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }

    const providerId = providerResult.rows[0].id;

    // Check if quote already exists
    const existingQuote = await pool.query(
      'SELECT id FROM quotes WHERE quote_request_id = $1 AND provider_id = $2',
      [requestId, providerId]
    );

    if (existingQuote.rows.length > 0) {
      return res.status(400).json({ error: 'Quote already submitted for this request' });
    }

    const result = await pool.query(`
      INSERT INTO quotes (
        quote_request_id, provider_id, total_price, estimated_duration,
        description, valid_until, itemized_pricing, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
      RETURNING *
    `, [requestId, providerId, totalPrice, estimatedDuration, description, validUntil, JSON.stringify(itemizedPricing)]);

    res.status(201).json({
      message: 'Quote submitted successfully',
      quote: result.rows[0]
    });
  } catch (error) {
    console.error('Submit quote error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get quotes for a request
router.get('/request/:requestId', auth, async (req, res) => {
  try {
    const { requestId } = req.params;

    const result = await pool.query(`
      SELECT 
        q.*,
        p.business_name, p.rating, p.total_reviews,
        u.first_name, u.last_name, u.phone
      FROM quotes q
      JOIN providers p ON q.provider_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE q.quote_request_id = $1
      ORDER BY q.created_at DESC
    `, [requestId]);

    res.json({ quotes: result.rows });
  } catch (error) {
    console.error('Get quotes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept quote
router.put('/:quoteId/accept', auth, async (req, res) => {
  try {
    const { quoteId } = req.params;

    const result = await pool.query(`
      UPDATE quotes 
      SET status = 'accepted', updated_at = NOW()
      WHERE id = $1 AND quote_request_id IN (
        SELECT id FROM quote_requests WHERE customer_id = $2
      )
      RETURNING *
    `, [quoteId, req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found or access denied' });
    }

    // Update other quotes for the same request to 'rejected'
    await pool.query(`
      UPDATE quotes 
      SET status = 'rejected', updated_at = NOW()
      WHERE quote_request_id = $1 AND id != $2
    `, [result.rows[0].quote_request_id, quoteId]);

    res.json({
      message: 'Quote accepted successfully',
      quote: result.rows[0]
    });
  } catch (error) {
    console.error('Accept quote error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;