const mongoose = require('mongoose');
const { fieldLabel } = require('../../../utils/field_labels');

const validatePartnersListQuery = (req, res, next) => {
  const cityId = req.query.city_id;
  const franchiseId = req.query.franchise_id;
  const hasCityId = cityId !== undefined && cityId !== null && String(cityId).trim() !== '';
  const hasFranchiseId =
    franchiseId !== undefined && franchiseId !== null && String(franchiseId).trim() !== '';

  if (hasCityId) {
    if (!mongoose.Types.ObjectId.isValid(String(cityId).trim())) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: `${fieldLabel('city_id')} must be a valid ObjectId.`,
      });
    }
    return next();
  }

  if (!hasFranchiseId) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: `${fieldLabel('city_id')} or ${fieldLabel('franchise_id')} is required.`,
    });
  }

  if (!mongoose.Types.ObjectId.isValid(String(franchiseId).trim())) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: `${fieldLabel('franchise_id')} must be a valid ObjectId.`,
    });
  }

  next();
};

const validatePartnerProfileQuery = (req, res, next) => {
  const franchiseId = req.query.franchise_id;
  if (franchiseId === undefined || franchiseId === null || String(franchiseId).trim() === '') {
    return next();
  }

  if (!mongoose.Types.ObjectId.isValid(String(franchiseId).trim())) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: `${fieldLabel('franchise_id')} must be a valid ObjectId.`,
    });
  }

  next();
};

const validatePartnerIdParam = (req, res, next) => {
  const partnerId = req.params.partnerId;
  if (partnerId === undefined || partnerId === null || String(partnerId).trim() === '') {
    return res.status(400).json({
      success: false,
      status: 400,
      message: `${fieldLabel('partnerId')} is required.`,
    });
  }

  if (!mongoose.Types.ObjectId.isValid(String(partnerId).trim())) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: `${fieldLabel('partnerId')} must be a valid ObjectId.`,
    });
  }

  next();
};

module.exports = {
  validatePartnersListQuery,
  validatePartnerProfileQuery,
  validatePartnerIdParam,
};
