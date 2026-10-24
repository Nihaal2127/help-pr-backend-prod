const mongoose = require('mongoose');
const { fieldLabel } = require('../../../utils/field_labels');
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

module.exports = {
  validateOrderIdParam,
  validateCreateDirectOrderBody,
};
