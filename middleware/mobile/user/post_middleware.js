const mongoose = require('mongoose');
const { normalizeReportReason } = require('../../../enum/post_report_reason_enum');
const { fieldLabel } = require('../../../utils/field_labels');

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    status,
    message,
  });

const validateFranchiseIdQuery = (req, res, next) => {
  const franchiseId = req.query.franchise_id;
  if (franchiseId === undefined || franchiseId === null || String(franchiseId).trim() === '') {
    return sendError(res, 400, `${fieldLabel('franchise_id')} is required.`);
  }

  if (!mongoose.Types.ObjectId.isValid(String(franchiseId).trim())) {
    return sendError(res, 400, `${fieldLabel('franchise_id')} must be a valid ObjectId.`);
  }

  next();
};

const validateFeedListQuery = (req, res, next) => {
  const scope = String(req.query.scope ?? 'city').trim().toLowerCase();
  const cityId = req.query.city_id;
  const franchiseId = req.query.franchise_id;
  const hasCityId = cityId !== undefined && cityId !== null && String(cityId).trim() !== '';
  const hasFranchiseId =
    franchiseId !== undefined && franchiseId !== null && String(franchiseId).trim() !== '';

  if (hasCityId) {
    if (!mongoose.Types.ObjectId.isValid(String(cityId).trim())) {
      return sendError(res, 400, `${fieldLabel('city_id')} must be a valid ObjectId.`);
    }
    return next();
  }

  if (scope === 'all') return next();

  if (!hasFranchiseId) {
    return sendError(
      res,
      400,
      `${fieldLabel('city_id')} or ${fieldLabel('franchise_id')} is required.`
    );
  }

  if (!mongoose.Types.ObjectId.isValid(String(franchiseId).trim())) {
    return sendError(res, 400, `${fieldLabel('franchise_id')} must be a valid ObjectId.`);
  }

  next();
};

const validatePostIdParam = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.postId))) {
    return sendError(res, 400, 'Invalid post id.');
  }
  next();
};

const validatePartnerIdParam = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.partnerId))) {
    return sendError(res, 400, 'Invalid partner id.');
  }
  next();
};

const validateShareTokenParam = (req, res, next) => {
  const token = String(req.params.shareToken ?? '').trim();
  if (!token) {
    return sendError(res, 400, 'share token is required.');
  }
  next();
};

const validateReportBody = (req, res, next) => {
  const { reason } = req.body || {};
  if (!normalizeReportReason(reason)) {
    return sendError(res, 400, `${fieldLabel('reason')} must be one of: spam, inappropriate, misleading, other.`);
  }
  next();
};

module.exports = {
  validateFranchiseIdQuery,
  validateFeedListQuery,
  validatePostIdParam,
  validatePartnerIdParam,
  validateShareTokenParam,
  validateReportBody,
};
