import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

export class S3Service {
  private readonly s3: S3Client;
  private readonly region: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'ap-south-1';
    this.s3 = new S3Client({ region: this.region });
  }

  getBucketName(): string {
    const bucketArn = process.env.BUCKET_ARN || 'arn:aws:s3:::jobhunter-resumes01';
    return process.env.BUCKET_NAME || bucketArn.split(':::').pop() || 'jobhunter-resumes01';
  }

  getPublicUrl(s3Key: string): string {
    return `https://${this.getBucketName()}.s3.${this.region}.amazonaws.com/${encodeURIComponent(s3Key)}`;
  }

  async uploadBuffer(buffer: Buffer, key: string, contentType: string = 'application/pdf'): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.getBucketName(),
        Key: key,
        Body: buffer,
        ContentType: contentType
      })
    );
    return key;
  }

  async downloadToTempFile(s3Key: string, resumeId: string): Promise<string> {
    if (!s3Key) {
      throw new Error('Resume S3 key is missing');
    }

    const tempDir = path.join(os.tmpdir(), 'jobhunter-resumes');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `${resumeId}-${Date.now()}-${path.basename(s3Key)}`);
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.getBucketName(),
        Key: s3Key
      })
    );

    if (!response.Body) {
      throw new Error('Empty S3 response body');
    }

    const writeStream = createWriteStream(tempFilePath);
    await pipeline(response.Body as any, writeStream);
    return tempFilePath;
  }

  async deleteObject(s3Key: string): Promise<void> {
    if (!s3Key) return;
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.getBucketName(),
          Key: s3Key
        })
      );
      console.log(`Successfully deleted S3 object: ${s3Key}`);
    } catch (error) {
      console.error(`Failed to delete S3 object ${s3Key}:`, error);
      throw error;
    }
  }
}

export default new S3Service();
