import type { Request, Response } from 'express';
import jobService from '../services/jobService.js';

export const searchJobs = async (req: Request, res: Response) => {
  try {
    const { keywords = 'software developer', location = '', page = '1' } = req.body;
    const result = await jobService.searchJobs({ keywords, location, page });

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error: any) {
    console.error('Error searching jobs:', error);
    return res.status(500).json({
      success: false,
      message: 'Error searching jobs: ' + (error.message || 'Unknown error')
    });
  }
};

export const getJobs = async (req: Request, res: Response) => {
  try {
    const { location, keywords, days_posted } = req.query;
    const filters: any = {};
    if (location) filters.location = location as string;
    if (keywords) filters.keywords = keywords as string;
    if (days_posted) filters.days_posted = parseInt(days_posted as string);

    const result = await jobService.getJobs(filters);
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching jobs: ' + (error.message || 'Unknown error')
    });
  }
};

export const refreshJobs = async (req: Request, res: Response) => {
  try {
    const { keywords = 'software developer', location = '' } = req.body;
    const result = await jobService.refreshJobs(keywords, location);
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error: any) {
    console.error('Error refreshing jobs:', error);
    return res.status(500).json({
      success: false,
      message: 'Error refreshing jobs: ' + (error.message || 'Unknown error')
    });
  }
};

export const archiveStaleJobs = async (req: Request, res: Response) => {
  try {
    const requestedDays = Number(req.body?.days || req.query.days || process.env.JOB_ARCHIVE_DAYS || 45);
    const days = Number.isFinite(requestedDays) ? requestedDays : 45;
    const result = await jobService.archiveStaleJobs(days);

    return res.status(200).json({
      success: true,
      message: 'Stale jobs archived successfully',
      ...result
    });
  } catch (error: any) {
    console.error('Error archiving stale jobs:', error);
    return res.status(500).json({
      success: false,
      message: 'Error archiving stale jobs: ' + (error.message || 'Unknown error')
    });
  }
};

export const getRecommendations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const { location, keywords, days_posted, min_match_score } = req.query;
    const filters: any = {};
    if (location) filters.location = location as string;
    if (keywords) filters.keywords = keywords as string;
    if (days_posted) filters.days_posted = parseInt(days_posted as string);
    if (min_match_score) filters.min_match_score = parseFloat(min_match_score as string);

    const result = await jobService.getRecommendations(userId, filters);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error getting recommendations:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Error generating recommendations'
    });
  }
};

export const getStoredRecommendations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const recommendations = await jobService.getUserRecommendations(userId, limit);

    return res.status(200).json({
      success: true,
      count: recommendations.length,
      recommendations
    });
  } catch (error: any) {
    console.error('Error fetching stored recommendations:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching recommendations: ' + (error.message || 'Unknown error')
    });
  }
};
