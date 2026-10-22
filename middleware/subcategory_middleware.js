const { handleImageUpload } = require("../helper/image_uploader");
const { getUploadType } = require("../enum/upload_type_enum");
const { uploadImages } = require("../utils/fileUpload");

const isMultipart = (req) =>
  (req.headers["content-type"] || "").toLowerCase().includes("multipart/form-data");

const mapDescriptionToDesc = (body) => {
  if (
    (body.desc === undefined ||
      body.desc === null ||
      String(body.desc).trim() === "") &&
    body.description !== undefined &&
    body.description !== null
  ) {
    body.desc = body.description;
  }
  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    delete body.description;
  }
};

const mapCategoryToCategoryId = (body) => {
  if (
    (body.category_id === undefined ||
      body.category_id === null ||
      String(body.category_id).trim() === "") &&
    body.category !== undefined &&
    body.category !== null &&
    String(body.category).trim() !== ""
  ) {
    body.category_id = body.category;
  }
};

const resolveRawServiceInput = (body) => {
  if (body.service_ids !== undefined && body.service_ids !== null) {
    return body.service_ids;
  }
  if (
    Object.prototype.hasOwnProperty.call(body, "service_ids[]") &&
    body["service_ids[]"] !== undefined &&
    body["service_ids[]"] !== null
  ) {
    return body["service_ids[]"];
  }
  if (body.services !== undefined && body.services !== null) {
    return body.services;
  }
  return undefined;
};

const parseServiceIdsField = (body) => {
  const raw = resolveRawServiceInput(body);
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) {
    if (
      raw.length > 0 &&
      typeof raw[0] === "object" &&
      raw[0] !== null &&
      Object.prototype.hasOwnProperty.call(raw[0], "_id")
    ) {
      return raw
        .map((x) => (x && x._id != null ? String(x._id).trim() : ""))
        .filter(Boolean);
    }
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed)
          ? parsed.map((x) => String(x).trim()).filter(Boolean)
          : [];
      } catch (_) {
        return [];
      }
    }
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [String(raw)];
};

const prepareSubcategoryCreateBody = async (req, res, next) => {
  try {
    mapCategoryToCategoryId(req.body);
    mapDescriptionToDesc(req.body);
    if (isMultipart(req)) {
      if (req.file) {
        req.body.image_url = await handleImageUpload(
          req.file,
          getUploadType(2),
          true,
          null
        );
      }
      req.body.service_ids = parseServiceIdsField(req.body);
    } else {
      if (req.body.service_ids == null || !Array.isArray(req.body.service_ids)) {
        req.body.service_ids = parseServiceIdsField(req.body);
      }
    }
    next();
  } catch (err) {
    console.error("prepareSubcategoryCreateBody:", err.message);
    return res.status(500).json({
      success: false,
      status: 500,
      message: err.message || "Image upload failed.",
    });
  }
};

const prepareSubcategoryUpdateBody = async (req, res, next) => {
  try {
    mapCategoryToCategoryId(req.body);
    mapDescriptionToDesc(req.body);
    const hasServiceIdsField = resolveRawServiceInput(req.body) !== undefined;
    if (isMultipart(req)) {
      if (req.file) {
        req.body.image_url = await handleImageUpload(
          req.file,
          getUploadType(2),
          true,
          null
        );
      }
      if (hasServiceIdsField) {
        req.body.service_ids = parseServiceIdsField(req.body);
      }
    } else if (hasServiceIdsField) {
      if (req.body.service_ids == null || !Array.isArray(req.body.service_ids)) {
        req.body.service_ids = parseServiceIdsField(req.body);
      }
    }
    next();
  } catch (err) {
    console.error("prepareSubcategoryUpdateBody:", err.message);
    return res.status(500).json({
      success: false,
      status: 500,
      message: err.message || "Image upload failed.",
    });
  }
};

const subcategoryImageUpload = (req, res, next) => {
  uploadImages.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: err.message || "File upload error.",
      });
    }
    next();
  });
};

const subcategoryCreateParser = (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) {
    return subcategoryImageUpload(req, res, next);
  }
  next();
};

const subcategoryUpdateParser = (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) {
    return subcategoryImageUpload(req, res, next);
  }
  next();
};

const createSubcategoryMiddleware = (req, res, next) => {
  const { name, desc, image_url, category_id, service_ids } = req.body;

  if (!name || String(name).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Sub Category name is required.",
    });
  }
  if (!category_id || String(category_id).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Category is required.",
    });
  }
  if (!desc || String(desc).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Sub Category description is required.",
    });
  }
  if (!image_url || String(image_url).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Sub Category Image is required.",
    });
  }
  // Services are optional on platform create
  if (service_ids !== undefined && service_ids !== null) {
    if (!Array.isArray(service_ids)) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Service ids must be an array.",
      });
    }
    if (
      service_ids.length > 0 &&
      !service_ids.every(
        (id) => id !== undefined && id !== null && String(id).trim() !== ""
      )
    ) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Each service id must be a non-empty value.",
      });
    }
  }
  next();
};

const createSubcategoryRequestMiddleware = (req, res, next) => {
  const { name, desc, image_url, category_id, service_ids } = req.body;

  if (!name || String(name).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Sub Category name is required.",
    });
  }
  if (!category_id || String(category_id).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Category is required.",
    });
  }
  if (!desc || String(desc).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Sub Category description is required.",
    });
  }
  if (!image_url || String(image_url).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Sub Category Image is required.",
    });
  }
  // Services are optional on franchise create-request / update-request
  if (service_ids !== undefined && service_ids !== null) {
    if (!Array.isArray(service_ids)) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Service ids must be an array.",
      });
    }
    if (
      service_ids.length > 0 &&
      !service_ids.every(
        (id) => id !== undefined && id !== null && String(id).trim() !== ""
      )
    ) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Each service id must be a non-empty value.",
      });
    }
  }
  req.body.is_request = true;
  next();
};

const updateSubcategoryRequestMiddleware = (req, res, next) =>
  createSubcategoryRequestMiddleware(req, res, next);

const updateSubcategoryMiddleware = (req, res, next) => {
  const { name, desc, image_url, category_id, service_ids } = req.body;

  if (name !== undefined && String(name).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Sub Category name is required.",
    });
  }
  if (category_id !== undefined && String(category_id).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Category is required.",
    });
  }
  if (desc !== undefined && String(desc).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Sub Category description is required.",
    });
  }
  if (image_url !== undefined && String(image_url).trim() === "") {
    return res.status(400).json({
      success: false,
      status: 400,
      message: "Sub Category Image is required.",
    });
  }
  // Services are optional; empty array clears linked services
  if (service_ids !== undefined && service_ids !== null) {
    if (!Array.isArray(service_ids)) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Service ids must be an array.",
      });
    }
    if (
      service_ids.length > 0 &&
      !service_ids.every(
        (id) => id !== undefined && id !== null && String(id).trim() !== ""
      )
    ) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Each service id must be a non-empty value.",
      });
    }
  }
  next();
};

module.exports = {
  subcategoryCreateParser,
  subcategoryUpdateParser,
  createSubcategoryMiddleware,
  createSubcategoryRequestMiddleware,
  updateSubcategoryRequestMiddleware,
  updateSubcategoryMiddleware,
  prepareSubcategoryCreateBody,
  prepareSubcategoryUpdateBody,
};
