import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as jobController from '../controllers/jobController.js';

const router = express.Router();

// Search jobs
router.post('/jobs/search', authenticateToken, jobController.searchJobs);

// Get all jobs with optional filters
router.get('/jobs', authenticateToken, jobController.getJobs);

// Refresh jobs manually from Jooble
router.post('/jobs/refresh', authenticateToken, jobController.refreshJobs);

// Soft-archive stale jobs
router.post('/jobs/archive-stale', authenticateToken, jobController.archiveStaleJobs);

// Get job recommendations based on resume analysis
router.get('/jobs/recommendations', authenticateToken, jobController.getRecommendations);

// Get stored recommendations from database
router.get('/jobs/recommendations/stored', authenticateToken, jobController.getStoredRecommendations);

export default router;
