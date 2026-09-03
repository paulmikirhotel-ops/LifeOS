import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '../../');
const uploadsRoot = path.join(serverRoot, 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = req.user.tenantId;
    const dest = path.join(uploadsRoot, tenantId);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic'];
    const safeExt = allowedExts.includes(ext) ? ext : '.bin';
    const storedName = crypto.randomBytes(12).toString('hex') + safeExt;
    cb(null, storedName);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
  }
};

export const multerUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export function evidenceFilePath(tenantId, storedName) {
  // Security: reject storedName with path separators
  if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
    throw new Error('Invalid file name');
  }
  return path.join(uploadsRoot, tenantId, storedName);
}
