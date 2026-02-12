import * as Minio from 'minio';
import dotenv from 'dotenv';

dotenv.config();

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'capsula',
  secretKey: process.env.MINIO_SECRET_KEY || 'capsula_password',
});

export const BUCKET_NAME = process.env.MINIO_BUCKET || 'capsules';

// Ensure bucket exists
export const initMinio = async () => {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
      console.log(`Bucket ${BUCKET_NAME} created.`);
    } else {
      console.log(`Bucket ${BUCKET_NAME} exists.`);
    }
  } catch (err) {
    console.error('Error initializing MinIO:', err);
  }
};
