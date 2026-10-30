const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth_middleware');
const rateLimiter = require('../middleware/rate_middleware');
const { requireSuperAdminStaffFranchiseAdminEmployee } = require('../middleware/role_middleware');
const { getAll } = require('../controllers/audit_log_controller');

router.use(rateLimiter);

router.get('/getAll', authMiddleware, requireSuperAdminStaffFranchiseAdminEmployee, getAll);

module.exports = router;
