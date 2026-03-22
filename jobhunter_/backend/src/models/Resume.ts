import mongoose from 'mongoose';
import fs from 'fs';
import { ResumeDbModel } from './DbModels.js';

export interface AnalysisHistoryEntry {
  version: number;
  analyzed_at: Date;
  data: any;
}

export interface Resume {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  upload_date: Date;
  is_latest: boolean;
  status: string;
  analysis_data?: any;
  analysis_version?: number;
  analysis_history?: AnalysisHistoryEntry[];
  created_at: Date;
  updated_at: Date;
}

export interface ResumeContent {
  content?: Buffer;
  fileName: string;
  uploadDate: Date;
  status: string;
}

export interface DeletedResumeSummary {
  id: string;
  file_path: string;
}

export class ResumeModel {
  private mapResume(doc: any): Resume {
    return {
      id: doc._id.toString(),
      user_id: doc.user_id.toString(),
      file_name: doc.file_name,
      file_path: doc.file_path,
      upload_date: doc.upload_date,
      is_latest: doc.is_latest,
      status: doc.status,
      analysis_data: doc.analysis_data,
      analysis_version: doc.analysis_version,
      analysis_history: doc.analysis_history || [],
      created_at: doc.createdAt,
      updated_at: doc.updatedAt
    };
  }

  async createResume(userId: string, fileName: string, filePath: string): Promise<Resume> {
    if (!mongoose.isValidObjectId(userId)) {
      throw new Error('Invalid user id');
    }

    await ResumeDbModel.updateMany({ user_id: userId }, { is_latest: false });

    const created = await ResumeDbModel.create({
      user_id: userId,
      file_name: fileName,
      file_path: filePath,
      is_latest: true,
      status: 'uploaded'
    });

    return this.mapResume(created);
  }

  async getLatestResume(userId: string): Promise<Resume | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }

    const doc = await ResumeDbModel.findOne({ user_id: userId, is_latest: true })
      .sort({ createdAt: -1 })
      .exec();

    return doc ? this.mapResume(doc) : null;
  }

  async getResumeById(id: string): Promise<Resume | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }

    const doc = await ResumeDbModel.findById(id).exec();
    return doc ? this.mapResume(doc) : null;
  }

  async updateResumeStatus(id: string, status: string, analysisData?: any): Promise<Resume> {
    if (!mongoose.isValidObjectId(id)) {
      throw new Error('Invalid resume id');
    }

    const existing = await ResumeDbModel.findById(id).exec();

    if (!existing) {
      throw new Error('Resume not found');
    }

    const updatePayload: Record<string, any> = { $set: { status } };

    if (analysisData !== undefined) {
      const currentVersion = existing.analysis_version || 0;

      if (existing.analysis_data) {
        const historyEntry: AnalysisHistoryEntry = {
          version: currentVersion,
          analyzed_at: new Date(),
          data: existing.analysis_data
        };

        updatePayload.$push = { analysis_history: historyEntry };
      }

      updatePayload.$set.analysis_data = analysisData;
      updatePayload.$set.analysis_version = currentVersion + 1;
    }

    const updated = await ResumeDbModel.findByIdAndUpdate(id, updatePayload, { new: true }).exec();

    if (!updated) {
      throw new Error('Resume not found');
    }

    return this.mapResume(updated);
  }

  async getUserResumes(userId: string): Promise<Resume[]> {
    if (!mongoose.isValidObjectId(userId)) {
      return [];
    }

    const docs = await ResumeDbModel.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .exec();

    return docs.map((doc) => this.mapResume(doc));
  }

  async getResumeContent(id: string): Promise<ResumeContent | null> {
    if (!mongoose.isValidObjectId(id)) {
      return null;
    }

    const doc = await ResumeDbModel.findById(id)
      .select('file_name upload_date status')
      .exec();

    if (!doc) {
      return null;
    }

    return {
      fileName: doc.file_name,
      uploadDate: doc.upload_date,
      status: doc.status
    };
  }

  async getLatestResumeContent(userId: string): Promise<ResumeContent | null> {
    if (!mongoose.isValidObjectId(userId)) {
      return null;
    }

    const doc = await ResumeDbModel.findOne({ user_id: userId, is_latest: true })
      .sort({ createdAt: -1 })
      .select('file_name upload_date status')
      .exec();

    if (!doc) {
      return null;
    }

    return {
      fileName: doc.file_name,
      uploadDate: doc.upload_date,
      status: doc.status
    };
  }

  async enforceRetentionPolicy(userId: string, keepLatest: number = 3): Promise<DeletedResumeSummary[]> {
    if (!mongoose.isValidObjectId(userId)) {
      return [];
    }

    const safeKeep = Math.max(1, keepLatest);
    const docs = await ResumeDbModel.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .exec();

    if (docs.length <= safeKeep) {
      return [];
    }

    const toDelete = docs.slice(safeKeep);
    const deletedSummaries: DeletedResumeSummary[] = toDelete.map((doc: any) => ({
      id: doc._id.toString(),
      file_path: doc.file_path
    }));

    await ResumeDbModel.deleteMany({ _id: { $in: toDelete.map((doc: any) => doc._id) } }).exec();

    for (const item of deletedSummaries) {
      if (fs.existsSync(item.file_path)) {
        fs.unlink(item.file_path, () => undefined);
      }
    }

    await this.ensureSingleLatestResume(userId);
    return deletedSummaries;
  }

  async deleteResumeForUser(userId: string, resumeId: string): Promise<Resume | null> {
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(resumeId)) {
      return null;
    }

    const resume = await ResumeDbModel.findOne({ _id: resumeId, user_id: userId }).exec();
    if (!resume) {
      return null;
    }

    await ResumeDbModel.deleteOne({ _id: resumeId }).exec();

    if (fs.existsSync(resume.file_path)) {
      fs.unlink(resume.file_path, () => undefined);
    }

    await this.ensureSingleLatestResume(userId);
    return this.mapResume(resume);
  }

  private async ensureSingleLatestResume(userId: string): Promise<void> {
    const latest = await ResumeDbModel.findOne({ user_id: userId })
      .sort({ createdAt: -1 })
      .exec();

    if (!latest) {
      return;
    }

    await ResumeDbModel.updateMany({ user_id: userId, _id: { $ne: latest._id } }, { is_latest: false }).exec();
    if (!latest.is_latest) {
      latest.is_latest = true;
      await latest.save();
    }
  }
} 