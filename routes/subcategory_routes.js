const express = require('express');
const router = express.Router();
const {
  getAll,
  create,
  update,
  getById,
  deleteSubcategory,
  getDropDown,
} = require('../controllers/subcategory_controller');
const authMiddleware = require('../middleware/auth_middleware');
const rateLimiter = require('../middleware/rate_middleware');
const {
  subcategoryCreateParser,
  subcategoryUpdateParser,
  createSubcategoryMiddleware,
  createSubcategoryRequestMiddleware,
  updateSubcategoryRequestMiddleware,
  updateSubcategoryMiddleware,
  prepareSubcategoryCreateBody,
  prepareSubcategoryUpdateBody,
} = require('../middleware/subcategory_middleware');

router.use(rateLimiter);

router.post(
  '/create',
  authMiddleware,
  subcategoryCreateParser,
  prepareSubcategoryCreateBody,
  createSubcategoryMiddleware,
  create
);
router.post(
  '/create-request',
  authMiddleware,
  subcategoryCreateParser,
  prepareSubcategoryCreateBody,
  createSubcategoryRequestMiddleware,
  create
);
router.get('/get/:id', authMiddleware, getById);
router.get('/getAll', authMiddleware, getAll);
router.get('/getDropDown', authMiddleware, getDropDown);
router.put(
  '/update/:id',
  authMiddleware,
  subcategoryUpdateParser,
  prepareSubcategoryUpdateBody,
  updateSubcategoryMiddleware,
  update
);
router.put(
  '/update-request/:id',
  authMiddleware,
  subcategoryUpdateParser,
  prepareSubcategoryUpdateBody,
  updateSubcategoryRequestMiddleware,
  update
);
router.delete('/delete/:id', authMiddleware, deleteSubcategory);

module.exports = router;
