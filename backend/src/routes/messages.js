const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database-dev');
const auth = require('../middleware/auth');
const router = express.Router();

// Send message
router.post('/', auth, [
  body('recipientId').isInt(),
  body('message').notEmpty(),
  body('conversationType').isIn(['booking', 'quote', 'general'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { recipientId, message, conversationType, relatedId } = req.body;

    const result = await pool.query(`
      INSERT INTO messages (
        sender_id, recipient_id, message, conversation_type, related_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [req.user.userId, recipientId, message, conversationType, relatedId]);

    res.status(201).json({
      message: 'Message sent successfully',
      messageData: result.rows[0]
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get conversations
router.get('/conversations', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT
        CASE 
          WHEN m.sender_id = $1 THEN m.recipient_id
          ELSE m.sender_id
        END as other_user_id,
        CASE 
          WHEN m.sender_id = $1 THEN u2.first_name || ' ' || u2.last_name
          ELSE u1.first_name || ' ' || u1.last_name
        END as other_user_name,
        m.conversation_type,
        m.related_id,
        MAX(m.created_at) as last_message_date,
        (
          SELECT message 
          FROM messages 
          WHERE (sender_id = $1 AND recipient_id = other_user_id) OR (sender_id = other_user_id AND recipient_id = $1)
          ORDER BY created_at DESC 
          LIMIT 1
        ) as last_message
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      JOIN users u2 ON m.recipient_id = u2.id
      WHERE m.sender_id = $1 OR m.recipient_id = $1
      GROUP BY other_user_id, other_user_name, m.conversation_type, m.related_id
      ORDER BY last_message_date DESC
    `, [req.user.userId]);

    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages in a conversation
router.get('/:otherUserId', auth, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT 
        m.*,
        u1.first_name as sender_first_name,
        u1.last_name as sender_last_name,
        u2.first_name as recipient_first_name,
        u2.last_name as recipient_last_name
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      JOIN users u2 ON m.recipient_id = u2.id
      WHERE 
        (m.sender_id = $1 AND m.recipient_id = $2) OR 
        (m.sender_id = $2 AND m.recipient_id = $1)
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4
    `, [req.user.userId, otherUserId, parseInt(limit), offset]);

    res.json({
      messages: result.rows.reverse(),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;