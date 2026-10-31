const mongoose = require('mongoose');
const { fieldLabel } = require('../../../utils/field_labels');

const validateHomeLocationQuery = (req, res, next) => {
  const location = req.query.location;
  if (location === undefined || location === null || String(location).trim() === '') {
    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Location is required.',
    });
  }

  const cityId = req.query.city_id;
  if (cityId !== undefined && cityId !== null && String(cityId).trim() !== '') {
    if (!mongoose.Types.ObjectId.isValid(String(cityId).trim())) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: `${fieldLabel('city_id')} must be a valid ObjectId.`,
      });
    }
  }

  next();
};

module.exports = {
  validateHomeLocationQuery,
};
