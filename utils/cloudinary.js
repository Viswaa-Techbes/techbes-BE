const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');

dotenv.config();

const requiredEnv = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

const hasCloudinaryConfig = requiredEnv.every((key) => Boolean(process.env[key]));

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const uploadToCloudinary = async (fileBuffer, fileName, options = {}) => {
  if (!hasCloudinaryConfig) {
    throw new Error(`Missing Cloudinary environment variables: ${requiredEnv.join(', ')}`);
  }

  const safeName = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const folder = options.folder || 'technician_app/work_proofs';
  const public_id = options.publicId || `${Date.now()}-${safeName || 'work-proof'}`;
  const resource_type = options.resource_type || 'auto';

  const uploadOptions = {
    folder,
    public_id,
    resource_type,
  };

  if (resource_type !== 'raw' && !options.isRaw) {
    uploadOptions.fetch_format = 'webp';
    uploadOptions.format = 'webp';
    uploadOptions.transformation = [
      { width: 1280, crop: 'limit' },
      { quality: 75 }
    ];
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
};
