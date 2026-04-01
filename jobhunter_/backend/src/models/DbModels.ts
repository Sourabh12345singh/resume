import mongoose from 'mongoose';

const { Schema, model, Types } = mongoose;

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    last_login: { type: Date }
  },
  { timestamps: true }
);

const resumeSchema = new Schema(
  {
    user_id: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    file_name: { type: String, required: true },
    s3_key: { type: String, required: true, index: true },
    file_path: { type: String },
    upload_date: { type: Date, default: Date.now },
    is_latest: { type: Boolean, default: true, index: true },
    status: { type: String, default: 'uploaded' },
    analysis_data: { type: Schema.Types.Mixed },
    analysis_version: { type: Number, default: 0 },
    analysis_history: [
      {
        version: { type: Number, required: true },
        analyzed_at: { type: Date, default: Date.now },
        data: { type: Schema.Types.Mixed }
      }
    ]
  },
  { timestamps: true }
);

const jobSchema = new Schema(
  {
    title: { type: String, required: true },
    company: { type: String, default: 'Unknown' },
    location: { type: String, default: '' },
    description: { type: String, default: '' },
    url: { type: String, required: true, unique: true, index: true },
    posted_date: { type: Date, default: Date.now },
    salary: { type: String, default: 'Not specified' },
    tags: [{ type: String }],
    source: { type: String, default: 'jooble' },
    experience_required: { type: String, default: 'Not specified' },
    job_type: { type: String, default: 'Full-time' },
    is_active: { type: Boolean, default: true, index: true },
    is_archived: { type: Boolean, default: false, index: true },
    archived_at: { type: Date },
    archive_reason: { type: String },
    last_seen_at: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

const jobRecommendationSchema = new Schema(
  {
    user_id: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    resume_id: { type: Types.ObjectId, ref: 'Resume', required: true, index: true },
    job_id: { type: Types.ObjectId, ref: 'Job', required: true, index: true },
    match_score: { type: Number, required: true },
    recommendation_reasons: [{ type: String }],
    is_archived: { type: Boolean, default: false, index: true },
    archived_at: { type: Date },
    archive_reason: { type: String },
    recommendation_batch_id: { type: String }
  },
  { timestamps: true }
);

jobRecommendationSchema.index(
  { user_id: 1, resume_id: 1, job_id: 1 },
  { unique: true, partialFilterExpression: { is_archived: false } }
);

export const UserModel = model('User', userSchema);
export const ResumeDbModel = model('Resume', resumeSchema);
export const JobModel = model('Job', jobSchema);
export const JobRecommendationModel = model('JobRecommendation', jobRecommendationSchema);
