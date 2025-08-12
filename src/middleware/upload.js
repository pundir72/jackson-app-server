const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { generateFileName, isValidFileType, isValidFileSize } = require('../utils/helpers');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = uploadsDir;
    
    // Create subdirectories based on file type
    if (file.fieldname === 'avatar') {
      uploadPath = path.join(uploadsDir, 'avatars');
    } else if (file.fieldname === 'receipt') {
      uploadPath = path.join(uploadsDir, 'receipts');
    } else if (file.fieldname === 'document') {
      uploadPath = path.join(uploadsDir, 'documents');
    } else {
      uploadPath = path.join(uploadsDir, 'misc');
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileName = generateFileName(file.originalname, `${file.fieldname}_`);
    cb(null, fileName);
  },
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Define allowed file types
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedDocumentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const allowedReceiptTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  
  let allowedTypes = [];
  
  // Set allowed types based on field name
  if (file.fieldname === 'avatar') {
    allowedTypes = allowedImageTypes;
  } else if (file.fieldname === 'receipt') {
    allowedTypes = allowedReceiptTypes;
  } else if (file.fieldname === 'document') {
    allowedTypes = allowedDocumentTypes;
  } else {
    allowedTypes = [...allowedImageTypes, ...allowedDocumentTypes];
  }
  
  if (isValidFileType(file, allowedTypes)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
  },
});

// Single file upload middleware
const singleUpload = (fieldName) => {
  return upload.single(fieldName);
};

// Multiple files upload middleware
const multipleUpload = (fieldName, maxCount = 10) => {
  return upload.array(fieldName, maxCount);
};

// Multiple fields upload middleware
const fieldsUpload = (fields) => {
  return upload.fields(fields);
};

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.',
        statusCode: 400,
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files.',
        statusCode: 400,
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.',
        statusCode: 400,
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      statusCode: 400,
    });
  }
  
  next(error);
};

// Avatar upload middleware
const avatarUpload = singleUpload('avatar');

// Receipt upload middleware
const receiptUpload = singleUpload('receipt');

// Document upload middleware
const documentUpload = singleUpload('document');

// Multiple receipts upload middleware
const receiptsUpload = multipleUpload('receipts', 5);

// Multiple documents upload middleware
const documentsUpload = multipleUpload('documents', 10);

module.exports = {
  upload,
  singleUpload,
  multipleUpload,
  fieldsUpload,
  handleUploadError,
  avatarUpload,
  receiptUpload,
  documentUpload,
  receiptsUpload,
  documentsUpload,
}; 