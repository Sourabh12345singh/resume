import path from 'path';
import resumeModelInstance, { Resume, ResumeModel, DeletedResumeSummary } from '../models/Resume.js';
import s3Service, { S3Service } from './s3Service.js';
import analysisService, { AnalysisService } from './analysisService.js';

export interface UploadResumeResult {
  resume: Resume;
  analysis?: any;
  analysisError?: string;
  deletedByRetention: DeletedResumeSummary[];
}

export class ResumeService {
  private readonly resumeModel: ResumeModel;
  private readonly s3Service: S3Service;
  private readonly analysisService: AnalysisService;
  private readonly defaultRetention: number;

  constructor(
    customResumeModel?: ResumeModel,
    customS3Service?: S3Service,
    customAnalysisService?: AnalysisService
  ) {
    this.resumeModel = customResumeModel || resumeModelInstance;
    this.s3Service = customS3Service || s3Service;
    this.analysisService = customAnalysisService || analysisService;
    this.defaultRetention = Number(process.env.RESUME_RETENTION_COUNT || 3);
  }

  /**
   * Fresh resume upload pipeline:
   * 1. Upload Multer Buffer directly to S3.
   * 2. Save resume metadata to MongoDB. (If MongoDB fails, rollback S3 upload to prevent orphan files).
   * 3. Analyze the SAME in-memory Buffer directly (NO downloading back from S3).
   * 4. If analysis succeeds, update resume in MongoDB with status 'processed'.
   * 5. Enforce retention policy.
   */
  async uploadAndProcessResume(
    userId: string,
    file: Express.Multer.File,
    targetLevel?: string
  ): Promise<UploadResumeResult> {
    const ext = path.extname(file.originalname) || '.pdf';
    const s3Key = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    console.log(`[ResumeService] Uploading resume buffer to S3: ${s3Key}`);
    await this.s3Service.uploadBuffer(file.buffer, s3Key, file.mimetype);

    let createdResume: Resume;
    try {
      console.log(`[ResumeService] Creating resume record in MongoDB for user: ${userId}`);
      createdResume = await this.resumeModel.createResume(userId, file.originalname, s3Key);

      if (targetLevel) {
        createdResume = await this.resumeModel.updateResumeStatus(createdResume.id, 'uploaded', { targetLevel });
      }
    } catch (mongoError) {
      console.error(`[ResumeService] MongoDB save failed! Rolling back S3 object: ${s3Key}`, mongoError);
      try {
        await this.s3Service.deleteObject(s3Key);
      } catch (rollbackError) {
        console.error(`[ResumeService] Failed to rollback S3 object ${s3Key}:`, rollbackError);
      }
      throw mongoError;
    }

    // Analyze the same in-memory Buffer directly (never download from S3 for fresh uploads)
    let analysisResult: any = null;
    let analysisError: string | undefined = undefined;

    try {
      console.log(`[ResumeService] Directly analyzing upload buffer (${file.buffer.length} bytes)...`);
      const analysis = await this.analysisService.analyzeBuffer(file.buffer, targetLevel, file.originalname);

      if (analysis && analysis.success) {
        const analysisWithLevel = targetLevel ? { ...analysis, targetLevel } : analysis;
        createdResume = await this.resumeModel.updateResumeStatus(createdResume.id, 'processed', analysisWithLevel);
        analysisResult = analysis;
        console.log(`[ResumeService] Resume analysis succeeded and saved for id: ${createdResume.id}`);
      } else {
        analysisError = analysis?.error || 'Resume analysis failed or returned unsuccessful';
        console.warn(`[ResumeService] Resume analysis was not successful: ${analysisError}`);
      }
    } catch (err: any) {
      analysisError = err.message || 'Error occurred during resume buffer analysis';
      console.error(`[ResumeService] Analysis error on fresh upload:`, err);
    }

    // Enforce retention policy
    let deletedByRetention: DeletedResumeSummary[] = [];
    try {
      deletedByRetention = await this.resumeModel.enforceRetentionPolicy(userId, this.defaultRetention);
    } catch (retentionError) {
      console.warn(`[ResumeService] Failed to enforce retention policy for user ${userId}:`, retentionError);
    }

    return {
      resume: createdResume,
      analysis: analysisResult,
      analysisError,
      deletedByRetention
    };
  }

  /**
   * Existing resume analysis pipeline:
   * 1. Retrieve resume record from MongoDB.
   * 2. Verify authorization.
   * 3. Download from S3 to temporary file.
   * 4. Perform ML analysis and clean up temp file.
   * 5. Save analysis results and version history to MongoDB.
   */
  async analyzeExistingResume(
    resumeId: string,
    userId: string,
    targetLevel?: string
  ): Promise<{ resume: Resume; analysis: any }> {
    const resume = await this.resumeModel.getResumeById(resumeId);

    if (!resume) {
      throw new Error('RESUME_NOT_FOUND');
    }

    if (resume.user_id.toString() !== userId.toString()) {
      throw new Error('ACCESS_DENIED');
    }

    if (!resume.s3_key) {
      throw new Error('RESUME_S3_KEY_MISSING');
    }

    console.log(`[ResumeService] Downloading existing resume from S3 (${resume.s3_key}) to temp file...`);
    const tempFilePath = await this.s3Service.downloadToTempFile(resume.s3_key, resume.id);

    try {
      console.log(`[ResumeService] Analyzing existing resume from temp file: ${tempFilePath}`);
      const analysisResult = await this.analysisService.analyzeResume(tempFilePath, targetLevel);

      if (!analysisResult.success) {
        throw new Error(analysisResult.error || 'Analysis failed');
      }

      const analysisWithLevel = targetLevel ? { ...analysisResult, targetLevel } : analysisResult;
      const updatedResume = await this.resumeModel.updateResumeStatus(resumeId, 'processed', analysisWithLevel);

      return {
        resume: updatedResume,
        analysis: analysisResult
      };
    } finally {
      // Temp file cleanup is handled by analysisService.analyzeResume in finally block
    }
  }

  /**
   * Analyze latest resume for user
   */
  async analyzeLatestResume(
    userId: string,
    targetLevel?: string
  ): Promise<{ resume: Resume; analysis: any; alreadyAnalyzed?: boolean }> {
    const resume = await this.resumeModel.getLatestResume(userId);

    if (!resume) {
      throw new Error('NO_RESUME_FOUND');
    }

    // If already analyzed and no new targetLevel specified, return cached analysis
    if (!targetLevel && resume.status === 'processed' && resume.analysis_data) {
      return {
        resume,
        analysis: resume.analysis_data,
        alreadyAnalyzed: true
      };
    }

    const result = await this.analyzeExistingResume(resume.id, userId, targetLevel);
    return {
      resume: result.resume,
      analysis: result.analysis,
      alreadyAnalyzed: false
    };
  }

  async getLatestResume(userId: string): Promise<Resume | null> {
    return this.resumeModel.getLatestResume(userId);
  }

  async getResumeById(id: string): Promise<Resume | null> {
    return this.resumeModel.getResumeById(id);
  }

  async getUserResumes(userId: string): Promise<Resume[]> {
    return this.resumeModel.getUserResumes(userId);
  }

  async deleteResumeForUser(userId: string, resumeId: string): Promise<Resume | null> {
    return this.resumeModel.deleteResumeForUser(userId, resumeId);
  }

  async enforceRetentionPolicy(userId: string, keepLatest?: number): Promise<DeletedResumeSummary[]> {
    const keep = Number.isFinite(keepLatest) ? (keepLatest as number) : this.defaultRetention;
    return this.resumeModel.enforceRetentionPolicy(userId, keep);
  }
}

export default new ResumeService();
