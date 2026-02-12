import { Router, Request, Response } from 'express';
import multer from 'multer';
import { minioClient, BUCKET_NAME } from '../config/minio';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const router = Router();
// Using memory storage to process file before uploading to MinIO
const upload = multer({ storage: multer.memoryStorage() });

// Extend Request type if needed, but 'req.file' is added by multer
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const multerReq = req as MulterRequest;
  if (!multerReq.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const file = multerReq.file;
  const fileExt = path.extname(file.originalname);
  const objectName = `${uuidv4()}${fileExt}`; // Unique name

  try {
    await minioClient.putObject(BUCKET_NAME, objectName, file.buffer, file.size, {
      'Content-Type': file.mimetype
    });

    // Basic URL construction - in production, orchestrated by Nginx or presigned URLs
    const fileUrl = `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${BUCKET_NAME}/${objectName}`;

    res.json({
      message: 'File uploaded successfully',
      url: fileUrl,
      objectName: objectName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    });
  } catch (err) {
    console.error('Error uploading to MinIO:', err);
    res.status(500).json({ error: 'Failed to upload file to storage' });
  }
});

export default router;
