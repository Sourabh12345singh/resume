import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.js';
import * as uploadController from '../controllers/uploadController.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
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

// Multer error handling wrapper middleware
const handleResumeUpload = (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error'
      });
    }
    next();
  });
};

// Routes
router.post('/upload-resume', authenticateToken, handleResumeUpload, uploadController.uploadResume);
router.get('/latest-resume', authenticateToken, uploadController.getLatestResume);
router.get('/resume/:id', authenticateToken, uploadController.getResumeById);
router.get('/latest-resume-content', authenticateToken, uploadController.getLatestResumeContent);
router.get('/resumes', authenticateToken, uploadController.listResumes);
router.delete('/resume/:id', authenticateToken, uploadController.deleteResume);
router.delete('/resumes/cleanup', authenticateToken, uploadController.cleanupResumes);

export default router;
