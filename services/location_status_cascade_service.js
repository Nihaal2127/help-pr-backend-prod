const City = require('../models/city');
const Area = require('../models/area');
const State = require('../models/state');

const coerceIsActive = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { present: false };
  }
  if (typeof value === 'boolean') {
    return { present: true, value };
  }
  if (value === 1 || value === '1') {
    return { present: true, value: true };
  }
  if (value === 0 || value === '0') {
    return { present: true, value: false };
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') {
    return { present: true, value: true };
  }
  if (normalized === 'false') {
    return { present: true, value: false };
  }
  return { present: false };
};

const stamp = (isActive) => ({
  is_active: isActive,
  updated_at: new Date(),
});

const cascadeStateStatusToCitiesAndAreas = async (stateId, isActive) => {
  const filter = { state_id: stateId, deleted_at: null };
  const $set = stamp(isActive);
  await City.updateMany(filter, { $set });
  await Area.updateMany(filter, { $set });
};

const cascadeCityStatusToAreas = async (cityId, isActive) => {
  await Area.updateMany(
    { city_id: cityId, deleted_at: null },
    { $set: stamp(isActive) }
  );
};

const assertCanActivateCity = async (stateId) => {
  const state = await State.findOne({ _id: stateId, deleted_at: null }).select('is_active').lean();
  if (!state) {
    return { ok: false, status: 404, message: 'State not found.' };
  }
  if (state.is_active === false) {
    return {
      ok: false,
      status: 400,
      message: 'Cannot activate a city while its state is inactive. Activate the state first.',
    };
  }
  return { ok: true };
};

const assertCanActivateArea = async (cityId) => {
  const city = await City.findOne({ _id: cityId, deleted_at: null }).select('is_active state_id').lean();
  if (!city) {
    return { ok: false, status: 404, message: 'City not found.' };
  }
  if (city.is_active === false) {
    return {
      ok: false,
      status: 400,
      message: 'Cannot activate an area while its city is inactive. Activate the city first.',
    };
  }
  const stateOk = await assertCanActivateCity(city.state_id);
  if (!stateOk.ok) {
    return {
      ok: false,
      status: 400,
      message: 'Cannot activate an area while its state is inactive. Activate the state first.',
    };
  }
  return { ok: true };
};

module.exports = {
  coerceIsActive,
  cascadeStateStatusToCitiesAndAreas,
  cascadeCityStatusToAreas,
  assertCanActivateCity,
  assertCanActivateArea,
};
