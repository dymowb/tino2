const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database-dev');
const auth = require('../middleware/auth');
const router = express.Router();

// Get nearby providers
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 10, service_type, page = 1, limit = 20 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const offset = (page - 1) * limit;
    let query = `
      SELECT 
        p.id, p.user_id, p.business_name, p.description, p.services,
        p.hourly_rate, p.rating, p.total_reviews, p.profile_image,
        p.latitude, p.longitude, p.availability_status,
        u.first_name, u.last_name, u.phone
      FROM providers p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_active = true AND u.is_active = true
      AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
      AND (
        6371 * acos(
          cos(radians($1)) * cos(radians(p.latitude)) *
          cos(radians(p.longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(p.latitude))
        )
      ) <= $3
    `;

    const params = [parseFloat(lat), parseFloat(lng), parseFloat(radius)];
    let paramCount = 4;

    if (service_type) {
      query += ` AND $${paramCount} = ANY(p.services)`;
      params.push(service_type);
      paramCount++;
    }

    query += ` ORDER BY p.rating DESC, p.total_reviews DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      providers: result.rows,
      page: parseInt(page),
      limit: parseInt(limit),
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get nearby providers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get provider profile
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT 
        p.*, u.first_name, u.last_name, u.phone, u.email,
        COALESCE(
          json_agg(
            json_build_object(
              'id', r.id,
              'customer_name', r.customer_name,
              'rating', r.rating,
              'comment', r.comment,
              'created_at', r.created_at
            )
          ) FILTER (WHERE r.id IS NOT NULL), 
          '[]'
        ) as reviews
      FROM providers p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN reviews r ON p.id = r.provider_id
      WHERE p.id = $1 AND p.is_active = true
      GROUP BY p.id, u.id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json({ provider: result.rows[0] });
  } catch (error) {
    console.error('Get provider profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update provider profile (providers only)
router.put('/profile', auth, async (req, res) => {
  try {
    if (req.user.userType !== 'provider') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      businessName,
      description,
      services,
      hourlyRate,
      latitude,
      longitude,
      availabilityStatus
    } = req.body;

    const result = await pool.query(`
      UPDATE providers 
      SET 
        business_name = COALESCE($1, business_name),
        description = COALESCE($2, description),
        services = COALESCE($3, services),
        hourly_rate = COALESCE($4, hourly_rate),
        latitude = COALESCE($5, latitude),
        longitude = COALESCE($6, longitude),
        availability_status = COALESCE($7, availability_status),
        updated_at = NOW()
      WHERE user_id = $8
      RETURNING *
    `, [businessName, description, services, hourlyRate, latitude, longitude, availabilityStatus, req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }

    res.json({
      message: 'Provider profile updated successfully',
      provider: result.rows[0]
    });
  } catch (error) {
    console.error('Update provider profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;