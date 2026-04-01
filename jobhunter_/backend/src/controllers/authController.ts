import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { UserModel } from '../models/DbModels.js';

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
    const userExists = await UserModel.findOne({
      $or: [{ email: normalizedEmail }, { username }]
    }).lean();

    console.log('User exists:', !!userExists);
    
    if (userExists) {
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
    const createdUser = await UserModel.create({
      username,
      email: normalizedEmail,
      password_hash: passwordHash
    });

    const responseUser = {
      id: createdUser._id.toString(),
      username: createdUser.username,
      email: createdUser.email
    };

    console.log('User created successfully:', responseUser);
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: responseUser
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
    const user = await UserModel.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.last_login = new Date();
    await user.save();

    // Generate JWT token
    const jwtExpiry: SignOptions['expiresIn'] = (process.env.JWT_EXPIRES_IN as SignOptions['expiresIn']) || '7d';
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    const token = jwt.sign(
      { id: user._id.toString(), email: user.email },
      jwtSecret,
      { expiresIn: jwtExpiry }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id.toString(),
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
