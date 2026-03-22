import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

export const signup = async (req: Request, res: Response) => {
  console.log('\n=== Signup Request ===');
  console.log('Request body:', req.body);
  
  const { username, email, password } = req.body;

  if (!email || !username || !password) {
    console.log('Missing required fields:', { email: !!email, username: !!username, password: !!password });
    return res.status(400).json({
      success: false,
      message: 'Email, username and password are required'
    });
  }

  // console.log('hello i am runing upto here ');
  // console.log('Received data:');
  // console.log('Email:', email);
  // console.log('Username:', username);
  // console.log('Password:', password);
  
  const normalizedEmail = email.toLowerCase();
  console.log('Normalized email:', normalizedEmail);
  // console.log('hello i am runing upto here ');

  try {
    // Check if user already exists
    console.log('Checking if user exists...');
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND username = $2',
      [normalizedEmail, username]
    );

    console.log('User exists:', userExists.rows.length > 0);
    
    if (userExists.rows.length > 0) {
      console.log('User already exists');
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }

    // Hash password
    console.log('Hashing password...');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert new user
    console.log('Creating new user...');
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, normalizedEmail, passwordHash]
    );

    console.log('User created successfully:', result.rows[0]);
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user'
    });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  const normalizedEmail = email.toLowerCase();

  try {
    // Find user
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login'
    });
  }
}; 