import type { Request, Response } from 'express';
import resumeService from '../services/resumeService.js';

/**
 * Analyze a specific resume by ID
 */
export const analyzeResumeById = async (req: Request, res: Response) => {
  try {
    const resumeId = req.params.id;
    const userId = req.user?.id;
    const targetLevel = req.body?.targetLevel;

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

    console.log(`Analyzing resume ID ${resumeId} for user ${userId}`);
    if (targetLevel) {
      console.log(`Target experience level: ${targetLevel}`);
    }

    const { resume: updatedResume, analysis } = await resumeService.analyzeExistingResume(
      resumeId,
      userId,
      targetLevel
    );

    return res.status(200).json({
      success: true,
      message: 'Resume analyzed successfully',
      analysis,
      resume: {
        id: updatedResume.id,
        fileName: updatedResume.file_name,
        status: updatedResume.status,
        analysisData: updatedResume.analysis_data
      }
    });
  } catch (error: any) {
    console.error('Error analyzing resume:', error);
    if (error.message === 'RESUME_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }
    if (error.message === 'ACCESS_DENIED') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: This resume does not belong to you'
      });
    }

    return res.status(500).json({
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
    const targetLevel = req.body?.targetLevel;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (targetLevel) {
      console.log(`Analyzing with target experience level: ${targetLevel}`);
    }

    console.log(`Analyzing latest resume for user ${userId}`);
    const { resume, analysis, alreadyAnalyzed } = await resumeService.analyzeLatestResume(
      userId,
      targetLevel
    );

    if (alreadyAnalyzed) {
      return res.status(200).json({
        success: true,
        message: 'Resume already analyzed',
        analysis,
        resume: {
          id: resume.id,
          fileName: resume.file_name,
          status: resume.status
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Resume analyzed successfully',
      analysis,
      resume: {
        id: resume.id,
        fileName: resume.file_name,
        status: resume.status,
        analysisData: resume.analysis_data
      }
    });
  } catch (error: any) {
    console.error('Error analyzing latest resume:', error);
    if (error.message === 'NO_RESUME_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'No resume found. Please upload a resume first.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error analyzing resume: ' + (error.message || 'Unknown error')
    });
  }
};
