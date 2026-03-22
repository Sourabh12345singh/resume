// backend/src/services/jobRecommendationService.ts
import mongoose from 'mongoose';
import { JobModel, JobRecommendationModel } from '../models/DbModels.js';

interface JobFilters {
  location?: string;
  keywords?: string;
  days_posted?: number;
  min_match_score?: number;
}

export class JobRecommendationService {
  private buildJobFilter(filters?: JobFilters): Record<string, any> {
    const query: Record<string, any> = { is_active: true, is_archived: false };

    if (filters?.location) {
      query.$or = [
        { location: { $regex: filters.location, $options: 'i' } },
        { location: { $regex: '^remote$', $options: 'i' } }
      ];
    }

    if (filters?.keywords) {
      query.$and = [
        {
          $or: [
            { title: { $regex: filters.keywords, $options: 'i' } },
            { description: { $regex: filters.keywords, $options: 'i' } }
          ]
        }
      ];
    }

    if (filters?.days_posted) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filters.days_posted);
      query.posted_date = { $gte: cutoff };
    }

    return query;
  }

  /**
   * Get jobs from database with filters
   */
  async getJobs(filters?: JobFilters): Promise<any[]> {
    try {
      const query = this.buildJobFilter(filters);
      const jobs = await JobModel.find(query).sort({ posted_date: -1 }).limit(100).lean().exec();

      return jobs.map((job: any) => ({
        ...job,
        id: job._id.toString()
      }));
    } catch (error) {
      console.error('Error fetching jobs from database:', error);
      return [];
    }
  }

  /**
   * Store job recommendations in database
   */
  async storeRecommendations(
    userId: string,
    resumeId: string,
    recommendations: any[]
  ): Promise<void> {
    try {
      if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(resumeId)) {
        throw new Error('Invalid user or resume id');
      }

      const batchId = `rec_${Date.now()}_${Math.round(Math.random() * 1_000_000)}`;

      // Archive old recommendations for this user and resume instead of hard-deleting.
      await JobRecommendationModel.updateMany(
        { user_id: userId, resume_id: resumeId, is_archived: false },
        {
          $set: {
            is_archived: true,
            archived_at: new Date(),
            archive_reason: 'superseded_by_new_batch'
          }
        }
      ).exec();

      // Insert new recommendations
      for (const rec of recommendations) {
        const job = await JobModel.findOneAndUpdate(
          { url: rec.link },
          {
            title: rec.title,
            company: rec.company || 'Unknown',
            location: rec.location,
            description: rec.snippet,
            url: rec.link,
            posted_date: rec.updated || new Date().toISOString(),
            salary: rec.salary || 'Not specified',
            tags: [],
            source: rec.source || 'jooble',
            experience_required: 'Not specified',
            job_type: rec.type || 'Full-time',
            is_active: true
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).exec();

        await JobRecommendationModel.findOneAndUpdate(
          {
            user_id: userId,
            resume_id: resumeId,
            job_id: job._id
          },
          {
            user_id: userId,
            resume_id: resumeId,
            job_id: job._id,
            match_score: rec.matchScore,
            recommendation_reasons: rec.recommendationReasons || [],
            is_archived: false,
            archived_at: null,
            archive_reason: null,
            recommendation_batch_id: batchId
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).exec();
      }

      console.log(`Stored ${recommendations.length} recommendations for user ${userId}`);
    } catch (error) {
      console.error('Error storing recommendations:', error);
      throw error;
    }
  }

  /**
   * Get stored recommendations for a user
   */
  async getUserRecommendations(userId: string, limit: number = 20): Promise<any[]> {
    try {
      if (!mongoose.isValidObjectId(userId)) {
        return [];
      }

      const results = await JobRecommendationModel.find({ user_id: userId, is_archived: false })
        .sort({ match_score: -1, createdAt: -1 })
        .limit(limit)
        .populate({
          path: 'job_id',
          model: JobModel,
          match: { is_active: true, is_archived: false }
        })
        .lean()
        .exec();

      return results
        .filter((rec: any) => rec.job_id)
        .map((rec: any) => {
          const job = rec.job_id;
          return {
            recommendation_id: rec._id.toString(),
            match_score: rec.match_score,
            recommendation_reasons: rec.recommendation_reasons,
            created_at: rec.createdAt,
            job_id: job._id.toString(),
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            url: job.url,
            posted_date: job.posted_date,
            salary: job.salary,
            tags: job.tags,
            experience_required: job.experience_required,
            job_type: job.job_type,
            source: job.source
          };
        });
    } catch (error) {
      console.error('Error fetching user recommendations:', error);
      return [];
    }
  }
}

export default new JobRecommendationService();