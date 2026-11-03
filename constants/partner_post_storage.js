const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Fixed partner-post media (images + videos) storage caps by subscription plan_name. */
const PARTNER_POST_STORAGE_LIMIT_BYTES_BY_PLAN = Object.freeze({
  basic: 5 * BYTES_PER_GB,
  silver: 15 * BYTES_PER_GB,
  gold: 50 * BYTES_PER_GB,
  platinum: null, // unlimited
});

module.exports = {
  BYTES_PER_GB,
  PARTNER_POST_STORAGE_LIMIT_BYTES_BY_PLAN,
};
