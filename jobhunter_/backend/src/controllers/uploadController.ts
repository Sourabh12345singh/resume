import type { Request, Response } from 'express';
import resumeService from '../services/resumeService.js';

export const uploadResume = async (req: Request, res: Response) => {
  try {
    console.log('Upload request received');
    console.log('File:', req.file ? req.file.originalname : 'No file');
    console.log('User:', req.user?.id);
    console.log('Target Level:', req.body?.targetLevel);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select a PDF file.'
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const targetLevel = req.body?.targetLevel;

    const result = await resumeService.uploadAndProcessResume(
      req.user.id,
      req.file,
      targetLevel
    );

    return res.status(200).json({
      success: true,
      message: 'Resume uploaded and processed successfully',
      resume: {
        id: result.resume.id,
        fileName: result.resume.file_name,
        uploadDate: result.resume.upload_date,
        status: result.resume.status,
        targetLevel,
        analysisData: result.resume.analysis_data
      },
      analysis: result.analysis,
      ...(result.analysisError && { analysisError: result.analysisError }),
      retention: {
        keepLatest: 3,
        deletedCount: result.deletedByRetention.length
      }
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error uploading file'
    });
  }
};

export const getLatestResume = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const resume = await resumeService.getLatestResume(req.user.id);

    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'No resume found'
      });
    }

    return res.status(200).json({
      success: true,
      resume: {
        id: resume.id,
        fileName: resume.file_name,
        uploadDate: resume.upload_date,
        status: resume.status,
        analysisData: resume.analysis_data,
        analysisVersion: resume.analysis_version || 0,
        analysisHistoryCount: resume.analysis_history?.length || 0
      }
    });
  } catch (error: any) {
    console.error('Error fetching resume:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching resume'
    });
  }
};

export const getResumeById = async (req: Request, res: Response) => {
  try {
    const resumeId = req.params.id;
    if (!resumeId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid resume ID'
      });
    }

    const resume = await resumeService.getResumeById(resumeId);
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    return res.status(302).redirect(resume.file_path);
  } catch (error: any) {
    console.error('Download error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error downloading file'
    });
  }
};

export const getLatestResumeContent = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const resume = await resumeService.getLatestResume(req.user.id);
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'No resume found'
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${resume.file_name}"`);
    return res.status(302).redirect(resume.file_path);
  } catch (error: any) {
    console.error('Download error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error downloading file'
    });
  }
};

export const listResumes = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const resumes = await resumeService.getUserResumes(req.user.id);
    return res.status(200).json({
      success: true,
      count: resumes.length,
      resumes: resumes.map((resume) => ({
        id: resume.id,
        fileName: resume.file_name,
        uploadDate: resume.upload_date,
        status: resume.status,
        isLatest: resume.is_latest,
        analysisVersion: resume.analysis_version || 0,
        analysisHistoryCount: resume.analysis_history?.length || 0
      }))
    });
  } catch (error: any) {
    console.error('Error listing resumes:', error);
    return res.status(500).json({ success: false, message: 'Error listing resumes' });
  }
};

export const deleteResume = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const deleted = await resumeService.deleteResumeForUser(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Resume deleted successfully',
      deletedResumeId: deleted.id
    });
  } catch (error: any) {
    console.error('Error deleting resume:', error);
    return res.status(500).json({ success: false, message: 'Error deleting resume' });
  }
};

export const cleanupResumes = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const requestedKeep = Number(req.query.keepLatest || req.body?.keepLatest);
    const keepLatest = Number.isFinite(requestedKeep) ? requestedKeep : 3;

    const deleted = await resumeService.enforceRetentionPolicy(req.user.id, keepLatest);

    return res.status(200).json({
      success: true,
      message: 'Resume cleanup completed',
      keepLatest,
      deletedCount: deleted.length,
      deletedResumeIds: deleted.map((item) => item.id)
    });
  } catch (error: any) {
    console.error('Error cleaning up resumes:', error);
    return res.status(500).json({ success: false, message: 'Error cleaning up resumes' });
  }
};
