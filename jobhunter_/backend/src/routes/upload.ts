import express from 'express';
import multer from 'multer';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ResumeModel } from '../models/Resume.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const resumeModel = new ResumeModel();
const DEFAULT_RESUME_RETENTION = Number(process.env.RESUME_RETENTION_COUNT || 3);
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const BUCKET_ARN = process.env.BUCKET_ARN || 'arn:aws:s3:::jobhunter-resumes01';
const BUCKET_NAME = process.env.BUCKET_NAME || BUCKET_ARN.split(':::').pop() || 'jobhunter-resumes01';
const s3 = new S3Client({ region: AWS_REGION });

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
    // Accept only PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Upload resume endpoint with proper error handling
router.post('/upload-resume', authenticateToken, (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Use multer and handle errors
  upload.single('resume')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum size is 5MB.'
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
      }
      // Other multer errors (like file type)
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error'
      });
    }
    next();
  });
}, async (req: express.Request, res: express.Response) => {
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

    // Get target level from request body (optional)
    const targetLevel = req.body?.targetLevel; // 'entry', 'mid', 'senior'
    const ext = path.extname(req.file.originalname) || '.pdf';
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    console.log('Uploading resume to S3...');
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    console.log('Storing resume in database...');
    // Store resume information in database
    const resume = await resumeModel.createResume(
      req.user.id,
      req.file.originalname,
      fileName
    );

    // Store target level in resume metadata (for later use during analysis)
    if (targetLevel) {
      await resumeModel.updateResumeStatus(resume.id, 'uploaded', { targetLevel });
    }

    console.log('Resume stored successfully:', resume.id);

    // Keep only the latest N resumes per user in production to control storage cost.
    const deletedByRetention = await resumeModel.enforceRetentionPolicy(
      req.user.id,
      DEFAULT_RESUME_RETENTION
    );

    res.status(200).json({
      success: true,
      message: 'Resume uploaded and processed successfully',
      resume: {
        id: resume.id,
        fileName: resume.file_name,
        uploadDate: resume.upload_date,
        status: resume.status,
        targetLevel: targetLevel
      },
      retention: {
        keepLatest: DEFAULT_RESUME_RETENTION,
        deletedCount: deletedByRetention.length
      }
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    console.error('Error stack:', error.stack);

    // Provide more detailed error message
    const errorMessage = error.message || 'Error uploading file';
    const isDatabaseError = error.code === '23503' || error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist');

    res.status(500).json({
      success: false,
      message: isDatabaseError 
        ? 'Database error: Please ensure all tables are created. Check database connection.'
        : errorMessage
    });
  }
});

// Get user's latest resume
router.get('/latest-resume', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const resume = await resumeModel.getLatestResume(req.user.id);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'No resume found'
      });
    }

    res.status(200).json({
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
  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching resume'
    });
  }
});

// Get resume file endpoint
router.get('/resume/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const resumeId = req.params.id;
    if (!resumeId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid resume ID'
      });
    }

    const resume = await resumeModel.getResumeById(resumeId);
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    return res.status(302).redirect(resume.file_path);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file'
    });
  }
});

// Get latest resume content endpoint
router.get('/latest-resume-content', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const resume = await resumeModel.getLatestResume(req.user.id);
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'No resume found'
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${resume.file_name}"`);
    return res.status(302).redirect(resume.file_path);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file'
    });
  }
});

// List all resumes for authenticated user
router.get('/resumes', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const resumes = await resumeModel.getUserResumes(req.user.id);
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
  } catch (error) {
    console.error('Error listing resumes:', error);
    return res.status(500).json({ success: false, message: 'Error listing resumes' });
  }
});

// Delete one resume owned by the authenticated user
router.delete('/resume/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const deleted = await resumeModel.deleteResumeForUser(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Resume deleted successfully',
      deletedResumeId: deleted.id
    });
  } catch (error) {
    console.error('Error deleting resume:', error);
    return res.status(500).json({ success: false, message: 'Error deleting resume' });
  }
});

// Cleanup old resumes while keeping the latest N items
router.delete('/resumes/cleanup', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const requestedKeep = Number(req.query.keepLatest || req.body?.keepLatest || DEFAULT_RESUME_RETENTION);
    const keepLatest = Number.isFinite(requestedKeep) ? requestedKeep : DEFAULT_RESUME_RETENTION;

    const deleted = await resumeModel.enforceRetentionPolicy(req.user.id, keepLatest);

    return res.status(200).json({
      success: true,
      message: 'Resume cleanup completed',
      keepLatest,
      deletedCount: deleted.length,
      deletedResumeIds: deleted.map((item) => item.id)
    });
  } catch (error) {
    console.error('Error cleaning up resumes:', error);
    return res.status(500).json({ success: false, message: 'Error cleaning up resumes' });
  }
});

export default router; 
