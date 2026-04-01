import type { Request, Response } from 'express';
import analysisService from '../services/analysisService.js';
import { ResumeModel } from '../models/Resume.js';

const resumeModel = new ResumeModel();

/**
 * Analyze a specific resume by ID
 */
export const analyzeResumeById = async (req: Request, res: Response) => {
  try {
    const resumeId = req.params.id;
    const userId = req.user?.id;
    const targetLevel = req.body?.targetLevel; // Get from request body

    if (!resumeId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid resume ID'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Get resume from database
    const resume = await resumeModel.getResumeById(resumeId);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Verify resume belongs to the user
    if (resume.user_id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: This resume does not belong to you'
      });
    }

    console.log(`Analyzing resume ID ${resumeId} for user ${userId}`);
    if (targetLevel) {
      console.log(`Target experience level: ${targetLevel}`);
    }

    // Perform analysis with target level
    const localFilePath = await resumeModel.downloadResumeToTempFile(resume.s3_key, resume.id);
    const analysisResult = await analysisService.analyzeResume(localFilePath, targetLevel);

    if (!analysisResult.success) {
      return res.status(500).json({
        success: false,
        message: analysisResult.error || 'Analysis failed'
      });
    }

    // Add target level to analysis result if provided
    const analysisWithLevel = targetLevel 
      ? { ...analysisResult, targetLevel } 
      : analysisResult;

    // Update resume with analysis results
    const updatedResume = await resumeModel.updateResumeStatus(
      resumeId,
      'processed',
      analysisWithLevel
    );

    res.status(200).json({
      success: true,
      message: 'Resume analyzed successfully',
      analysis: analysisResult,
      resume: {
        id: updatedResume.id,
        fileName: updatedResume.file_name,
        status: updatedResume.status,
        analysisData: updatedResume.analysis_data
      }
    });
  } catch (error: any) {
    console.error('Error analyzing resume:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing resume: ' + (error.message || 'Unknown error')
    });
  }
};

/**
 * Analyze the user's latest resume
 */
export const analyzeLatestResume = async (req: Request, res: Response) => {
  try {
    console.log('Starting analysis of latest resume');
    const userId = req.user?.id;
    const targetLevel = req.body?.targetLevel; // Get from request body

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Get latest resume
    const resume = await resumeModel.getLatestResume(userId);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'No resume found. Please upload a resume first.'
      });
    }

    // Check if already analyzed (skip this check if targetLevel is provided - re-analyze with new level)
    if (!targetLevel && resume.status === 'processed' && resume.analysis_data) {
      return res.status(200).json({
        success: true,
        message: 'Resume already analyzed',
        analysis: resume.analysis_data,
        resume: {
          id: resume.id,
          fileName: resume.file_name,
          status: resume.status
        }
      });
    }

    if (targetLevel) {
      console.log(`Analyzing with target experience level: ${targetLevel}`);
    }
    
    console.log(`Analyzing latest resume for user ${userId}`);

    // Perform analysis with target level
    const localFilePath = await resumeModel.downloadResumeToTempFile(resume.s3_key, resume.id);
    const analysisResult = await analysisService.analyzeResume(localFilePath, targetLevel);

    if (!analysisResult.success) {
      return res.status(500).json({
        success: false,
        message: analysisResult.error || 'Analysis failed'
      });
    }

    // Add target level to analysis result if provided
    const analysisWithLevel = targetLevel 
      ? { ...analysisResult, targetLevel } 
      : analysisResult;

    // Update resume with analysis results
    const updatedResume = await resumeModel.updateResumeStatus(
      resume.id,
      'processed',
      analysisWithLevel
    );

    res.status(200).json({
      success: true,
      message: 'Resume analyzed successfully',
      analysis: analysisResult,
      resume: {
        id: updatedResume.id,
        fileName: updatedResume.file_name,
        status: updatedResume.status,
        analysisData: updatedResume.analysis_data
      }
    });
  } catch (error: any) {
    console.error('Error analyzing latest resume:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing resume: ' + (error.message || 'Unknown error')
    });
  }
};

