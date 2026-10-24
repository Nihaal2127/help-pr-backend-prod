const mongoose = require('mongoose');
const { fieldLabel } = require('../../../utils/field_labels');
const { DISALLOWED_CLIENT_PRICING_KEYS } = require('../../../utils/mobile_quote_constants');
const {
  validateCreateQuoteBody,
  validateConvertQuoteBody,
} = require('./quote_middleware');

const MAX_ORDER_DESCRIPTION_LEN = 1000;

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    status,
    message,
  });

const validateOrderIdParam = (req, res, next) => {
  const orderId = req.params.orderId;
  if (orderId === undefined || orderId === null || String(orderId).trim() === '') {
    return sendError(res, 400, `${fieldLabel('orderId')} is required.`);
  }
  if (!mongoose.Types.ObjectId.isValid(String(orderId).trim())) {
    return sendError(res, 400, 'Invalid order id.');
  }
  next();
};

const validateCreateDirectOrderBody = (req, res, next) => {
  req.body = req.body || {};
  const body = req.body;

  const partnerId =
    body.partner_id !== undefined && body.partner_id !== null
      ? String(body.partner_id).trim()
      : '';
  if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) {
    return sendError(res, 400, `Valid ${fieldLabel('partner_id')} is required.`);
  }
  body.partner_id = partnerId;

  if (body.order_description !== undefined && body.order_description !== null) {
    if (typeof body.order_description !== 'string') {
      return sendError(res, 400, `${fieldLabel('order_description')} must be a string.`);
    }
    if (body.order_description.trim().length > MAX_ORDER_DESCRIPTION_LEN) {
      return sendError(
        res,
        409,
        `${fieldLabel('order_description')} must be ${MAX_ORDER_DESCRIPTION_LEN} characters or fewer.`
      );
    }
  }

  validateCreateQuoteBody(req, res, (err) => {
    if (err) return next(err);
    validateConvertQuoteBody(req, res, next);
  });
};

const coerceOptionalPositiveAmount = (query, key, res) => {
  if (query[key] === undefined || query[key] === null || String(query[key]).trim() === '') {
    delete query[key];
    return true;
  }
  const amount = Number(query[key]);
  if (!Number.isFinite(amount) || amount <= 0) {
    sendError(res, 400, `${fieldLabel(key)} must be greater than 0.`);
    return false;
  }
  query[key] = amount;
  return true;
};

const validateCreateDirectOrderPreviewQuery = (req, res, next) => {
  req.query = req.query || {};
  const query = req.query;

  const sentPricing = DISALLOWED_CLIENT_PRICING_KEYS.filter((key) => query[key] !== undefined);
  if (sentPricing.length > 0) {
    return sendError(
      res,
      409,
      `Do not send server-computed pricing fields: ${sentPricing.map(fieldLabel).join(', ')}. Send only ${fieldLabel('total_service_charge')} (or ${fieldLabel('service_price')}) on preview.`
    );
  }

  const requiredIds = ['franchise_id', 'category_id', 'service_id', 'address_id', 'partner_id'];
  for (const key of requiredIds) {
    const raw = query[key] !== undefined && query[key] !== null ? String(query[key]).trim() : '';
    if (!raw || !mongoose.Types.ObjectId.isValid(raw)) {
      return sendError(res, 400, `Valid ${fieldLabel(key)} is required.`);
    }
    query[key] = raw;
  }

  if (query.subcategory_id !== undefined && query.subcategory_id !== null && String(query.subcategory_id).trim() !== '') {
    const subcategoryId = String(query.subcategory_id).trim();
    if (!mongoose.Types.ObjectId.isValid(subcategoryId)) {
      return sendError(res, 400, `Invalid ${fieldLabel('subcategory_id')}.`);
    }
    query.subcategory_id = subcategoryId;
  } else {
    delete query.subcategory_id;
  }

  if (!coerceOptionalPositiveAmount(query, 'total_service_charge', res)) return;
  if (!coerceOptionalPositiveAmount(query, 'service_price', res)) return;

  next();
};

module.exports = {
  validateOrderIdParam,
  validateCreateDirectOrderBody,
  validateCreateDirectOrderPreviewQuery,
};
