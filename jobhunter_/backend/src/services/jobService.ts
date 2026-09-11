import joobleService, { JoobleService } from './joobleService.js';
import jobRecommendationService, { JobRecommendationService } from './jobRecommendationService.js';
import resumeService, { ResumeService } from './resumeService.js';

export interface JobFilterParams {
  location?: string;
  keywords?: string;
  days_posted?: number;
  min_match_score?: number;
}

export class JobService {
  private readonly joobleService: JoobleService;
  private readonly jobRecommendationService: JobRecommendationService;
  private readonly resumeService: ResumeService;

  constructor(
    customJoobleService?: JoobleService,
    customJobRecommendationService?: JobRecommendationService,
    customResumeService?: ResumeService
  ) {
    this.joobleService = customJoobleService || joobleService;
    this.jobRecommendationService = customJobRecommendationService || jobRecommendationService;
    this.resumeService = customResumeService || resumeService;
  }

  async searchJobs(params: { keywords?: string; location?: string; page?: string }) {
    const keywords = params.keywords || 'software developer';
    const location = params.location || '';
    const page = params.page || '1';

    console.log(`[JobService] Searching jobs: keywords="${keywords}", location="${location}", page="${page}"`);
    const result = await this.joobleService.searchJobs({
      keywords,
      location,
      page
    });

    const apiCallsUsed = (this.joobleService as any)['apiCallCount'] || 0;
    return {
      totalCount: result.totalCount,
      jobsCount: result.jobs.length,
      jobs: result.jobs,
      apiCallsUsed,
      apiCallsRemaining: Math.max(0, 500 - apiCallsUsed)
    };
  }

  async getJobs(filters: { location?: string; keywords?: string; days_posted?: number }) {
    const jobs = await this.jobRecommendationService.getJobs(filters);

    if (jobs.length === 0 && !filters.location && !filters.keywords && !filters.days_posted) {
      console.log('[JobService] No jobs found in database, attempting live refresh from Jooble');
      const refreshed = await this.joobleService.searchJobs({
        keywords: 'software developer',
        location: '',
        page: '1'
      });

      console.log(`[JobService] Live refresh returned ${refreshed.jobs.length} jobs`);
      return {
        count: refreshed.jobs.length,
        jobs: refreshed.jobs,
        source: 'jooble_live_refresh'
      };
    }

    return {
      count: jobs.length,
      jobs,
      source: 'database'
    };
  }

  async refreshJobs(keywords: string = 'software developer', location: string = '') {
    await this.joobleService.refreshJobs(keywords, location);
    return {
      message: `Successfully refreshed jobs for "${keywords}" in "${location}"`
    };
  }

  async archiveStaleJobs(days: number = 45) {
    const archivedCount = await this.joobleService.archiveStaleJobs(days);
    return {
      archivedCount,
      thresholdDays: days
    };
  }

  async getRecommendations(userId: string, filters: JobFilterParams) {
    const resume = await this.resumeService.getLatestResume(userId);

    if (!resume) {
      const error: any = new Error('No resume found. Please upload a resume first.');
      error.statusCode = 404;
      throw error;
    }

    if (!resume.analysis_data) {
      const error: any = new Error('Resume has not been analyzed yet. Please analyze your resume first at /api/analyze');
      error.statusCode = 400;
      throw error;
    }

    // Check if analysis is outdated (limited skills or missing parser fields)
    const hasLimitedSkills =
      resume.analysis_data.extractedInfo?.skills &&
      Array.isArray(resume.analysis_data.extractedInfo.skills) &&
      resume.analysis_data.extractedInfo.skills.length < 10;

    const missingNewFields =
      !resume.analysis_data.extractedInfo?.name ||
      !resume.analysis_data.extractedInfo?.projects ||
      !resume.analysis_data.extractedInfo?.education;

    const needsReanalysis = Boolean(hasLimitedSkills || missingNewFields);

    if (needsReanalysis) {
      console.log('⚠️ [JobService] Detected outdated analysis. Re-analyzing existing resume with enhanced parser...');
      const targetLevel = resume.analysis_data?.targetLevel || 'entry';
      try {
        const reanalysisResult = await this.resumeService.analyzeExistingResume(
          resume.id,
          userId,
          targetLevel
        );
        resume.analysis_data = reanalysisResult.analysis;
        console.log('✅ [JobService] Resume re-analyzed successfully!');
      } catch (reanalysisErr) {
        console.warn('⚠️ [JobService] Re-analysis failed, falling back to existing analysis data:', reanalysisErr);
      }
    }

    // Get recommendations from Jooble service
    const recommendations = await this.joobleService.getRecommendedJobs(
      userId,
      resume.analysis_data,
      filters
    );

    if (!recommendations.success) {
      return {
        success: false,
        message: recommendations.error || 'Failed to generate recommendations',
        atsScore: recommendations.atsScore || 0,
        totalJobs: 0,
        recommendedJobs: 0,
        recommendations: []
      };
    }

    // Cache recommendations in MongoDB
    if (recommendations.recommendations && recommendations.recommendations.length > 0) {
      await this.jobRecommendationService.storeRecommendations(
        userId,
        resume.id,
        recommendations.recommendations
      );
    }

    return {
      success: true,
      atsScore: recommendations.atsScore,
      totalJobs: recommendations.totalJobs,
      recommendedJobs: recommendations.recommendedJobs,
      recommendations: recommendations.recommendations,
      apiCallsUsed: recommendations.apiCallsUsed,
      apiCallsRemaining: recommendations.apiCallsRemaining
    };
  }

  async getUserRecommendations(userId: string, limit: number = 20) {
    return this.jobRecommendationService.getUserRecommendations(userId, limit);
  }
}

export default new JobService();
