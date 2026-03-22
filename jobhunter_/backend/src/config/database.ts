import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { JobRecommendationModel, JobModel, ResumeDbModel, UserModel } from '../models/DbModels.js';

dotenv.config({ path: '.env' });

const connectionString = process.env.MONGODB_URI;

if (!connectionString) {
  console.error('Missing MongoDB connection string. Set MONGODB_URI in backend/.env.');
  process.exit(1);
}

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(connectionString as string);
    await Promise.all([
      UserModel.syncIndexes(),
      ResumeDbModel.syncIndexes(),
      JobModel.syncIndexes(),
      JobRecommendationModel.syncIndexes()
    ]);
    console.log('Successfully connected to MongoDB database!');
  } catch (err) {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  }
}

export default mongoose;