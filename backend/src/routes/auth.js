const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database-dev');
const router = express.Router();

// Register endpoint
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').trim().isLength({ min: 1 }),
  body('userType').isIn(['customer', 'provider']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, userType, phone } = req.body;

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password, first_name, last_name, user_type, phone, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id, email, first_name, last_name, user_type',
      [email, hashedPassword, firstName, lastName, userType, phone]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, userType: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login endpoint
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists(),
], async (req, res) => {
  try {
    // DEBUG POINT 1: Login attempt started
    console.log('🔐 LOGIN ATTEMPT STARTED');
    console.log('📧 Email:', req.body.email);
    console.log('⏰ Timestamp:', new Date().toISOString());
    debugger; // BREAKPOINT: Login flow starts here
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    console.log('✅ Validation passed for email:', email);

    // DEBUG POINT 2: Database query
    console.log('🔍 SEARCHING FOR USER IN DATABASE');
    debugger; // BREAKPOINT: About to query database
    
    // Find user
    const result = await pool.query(
      'SELECT id, email, password, first_name, last_name, user_type, is_active FROM users WHERE email = $1',
      [email]
    );

    console.log('📊 Query result:', result.rows.length, 'users found');
    
    if (result.rows.length === 0) {
      console.log('❌ USER NOT FOUND');
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('👤 User found:', { id: user.id, email: user.email, userType: user.user_type, isActive: user.is_active });

    if (!user.is_active) {
      console.log('❌ ACCOUNT DEACTIVATED');
      return res.status(400).json({ error: 'Account is deactivated' });
    }

    // DEBUG POINT 3: Password verification
    console.log('🔑 VERIFYING PASSWORD');
    debugger; // BREAKPOINT: About to verify password
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('🔐 Password match:', isMatch);
    
    if (!isMatch) {
      console.log('❌ INVALID PASSWORD');
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // DEBUG POINT 4: Token generation
    console.log('🎫 GENERATING JWT TOKEN');
    debugger; // BREAKPOINT: About to generate token
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, userType: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    console.log('✅ LOGIN SUCCESSFUL');
    console.log('🎫 Token generated (length):', token.length);
    console.log('👤 User profile:', { id: user.id, email: user.email, userType: user.user_type });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;