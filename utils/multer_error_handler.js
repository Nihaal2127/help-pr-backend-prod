const multer = require('multer');

/**
 * Map Multer / fileFilter errors to client-facing 400 responses (not 500).
 */
const formatUploadErrorResponse = (err, options = {}) => {
  if (!err) return null;

  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return {
          status: 400,
          message: 'File must be 10 MB or smaller.',
        };
      case 'LIMIT_FILE_COUNT':
        return {
          status: 400,
          message: 'Too many files uploaded.',
        };
      case 'LIMIT_UNEXPECTED_FILE':
        return {
          status: 400,
          message: `You can upload up to ${options.maxFiles} images.`,
        };
      case 'LIMIT_PART_COUNT':
        return {
          status: 400,
          message: 'Too many parts in the upload request.',
        };
      default:
        return {
          status: 400,
          message: err.message || 'Invalid file upload.',
        };
    }
  }

  if (typeof err.message === 'string' && err.message.trim()) {
    return {
      status: 400,
      message: err.message.trim(),
    };
  }

  return null;
};

/** Wrap multer middleware so upload validation returns 400 JSON instead of falling through as 500. */
const wrapMulterUpload = (uploadMiddleware, options = {}) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (!err) return next();

    const formatted = formatUploadErrorResponse(err, options);
    if (formatted) {
      return res.status(formatted.status).json({
        success: false,
        status: formatted.status,
        message: formatted.message,
      });
    }

    return next(err);
  });
};

module.exports = {
  formatUploadErrorResponse,
  wrapMulterUpload,
};
