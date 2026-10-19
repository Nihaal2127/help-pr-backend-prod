const mongoose = require("mongoose");
const Subcategory = require("../models/subcategory");
const Category = require("../models/category");
const Service = require("../models/service");
const User = require("../models/user");
const { applyPagination, applyDropDownFilter } = require("../utils/pagination");
const { parseBoolean } = require("../utils/parser");
const { checkObjectIdExists } = require("../validator/id_validator");
const { getSubcategoryId } = require("../helper/id_generator");
const { sanitizeInput } = require("../validator/search_keyword_validator");
const { applyCatalogRequestScopeForCaller } = require("../utils/franchise_catalog_request_scope");
const {
  USER_TYPE_SUPER_ADMIN,
  USER_TYPE_STAFF,
} = require("../middleware/role_middleware");
const {
  normalizeCatalogName,
  subcategoryNameExistsQuery,
} = require("../utils/catalog_name_uniqueness");

const asBodyBool = (value, defaultValue) => {
  if (value === undefined) return defaultValue;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return defaultValue;
};

const asApprovalStatus = (value, defaultValue = "approve") => {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "approved") return "approve";
  if (["approve", "pending", "rejected"].includes(normalized)) return normalized;
  return defaultValue;
};

const dedupeServiceIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const s = String(id);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(id);
    }
  }
  return out;
};

const getIdValidationStatus = (message = "") => {
  if (message.includes("Invalid")) return 400;
  if (message.includes("not found")) return 404;
  return 400;
};

const getSubcategoryStatusConfig = (statusFilter = "") => {
  const value = String(statusFilter || "").trim().toLowerCase();
  if (value === "active") return { is_active: true, is_request: false };
  if (value === "inactive") return { is_active: false, is_request: false };
  if (value === "requested" || value === "requested_subcategories") {
    return { is_request: true };
  }
  return {};
};

const attachRequestedByUser = async (records) => {
  if (!Array.isArray(records) || records.length === 0) return records;

  const requestedByIds = [
    ...new Set(
      records
        .map((record) => record?.requested_by)
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => String(id))
    ),
  ];

  if (requestedByIds.length === 0) return records;

  const users = await User.find({
    _id: { $in: requestedByIds },
    deleted_at: null,
  }).select("name");

  const userMap = new Map(users.map((user) => [String(user._id), user]));

  return records.map((record) => {
    const plainRecord =
      record && typeof record.toObject === "function"
        ? record.toObject()
        : record;
    const requestedById = plainRecord?.requested_by
      ? String(plainRecord.requested_by)
      : null;
    const requestedByUser = requestedById ? userMap.get(requestedById) : null;
    return {
      ...plainRecord,
      requested_by:
        requestedById && requestedByUser
          ? {
              id: String(requestedByUser._id),
              name: requestedByUser.name || null,
            }
          : plainRecord.requested_by,
    };
  });
};

const attachServiceNames = async (records) => {
  if (!Array.isArray(records) || records.length === 0) return records;

  const serviceIds = [
    ...new Set(
      records
        .flatMap((record) =>
          Array.isArray(record?.services) ? record.services : []
        )
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => String(id))
    ),
  ];

  if (serviceIds.length === 0) {
    return records.map((record) => {
      const plainRecord =
        record && typeof record.toObject === "function"
          ? record.toObject()
          : record;
      return { ...plainRecord, services: [] };
    });
  }

  const services = await Service.find({
    _id: { $in: serviceIds },
    deleted_at: null,
  }).select("name");

  const serviceMap = new Map(
    services.map((service) => [String(service._id), service.name])
  );

  return records.map((record) => {
    const plainRecord =
      record && typeof record.toObject === "function"
        ? record.toObject()
        : record;
    const servicesWithNames = (
      Array.isArray(plainRecord.services) ? plainRecord.services : []
    ).map((id) => ({
      _id: String(id),
      name: serviceMap.get(String(id)) || null,
    }));
    return { ...plainRecord, services: servicesWithNames };
  });
};

const attachCategoryNames = async (records) => {
  if (!Array.isArray(records) || records.length === 0) return records;

  const categoryIds = [
    ...new Set(
      records
        .map((record) => {
          const cid = record?.category_id;
          if (cid && typeof cid === "object" && cid._id) return cid._id;
          return cid;
        })
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => String(id))
    ),
  ];

  if (categoryIds.length === 0) return records;

  const categories = await Category.find({
    _id: { $in: categoryIds },
    deleted_at: null,
  }).select("name");

  const categoryMap = new Map(
    categories.map((category) => [String(category._id), category.name])
  );

  return records.map((record) => {
    const plainRecord =
      record && typeof record.toObject === "function"
        ? record.toObject()
        : record;
    const rawCategoryId = plainRecord?.category_id;
    const categoryId =
      rawCategoryId && typeof rawCategoryId === "object" && rawCategoryId._id
        ? String(rawCategoryId._id)
        : rawCategoryId
          ? String(rawCategoryId)
          : null;
    return {
      ...plainRecord,
      category_id: categoryId
        ? {
            _id: categoryId,
            name: categoryMap.get(categoryId) || null,
          }
        : plainRecord.category_id,
    };
  });
};

const getAll = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        status: 401,
        message: "Unauthorized",
      });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const statusFilter =
      req.query.status !== undefined && req.query.status !== null
        ? String(req.query.status).trim().toLowerCase()
        : "";
    const is_active =
      req.query.is_active !== undefined
        ? parseBoolean(req.query.is_active)
        : null;
    const is_request =
      req.query.is_request !== undefined
        ? parseBoolean(req.query.is_request)
        : null;
    const approval_status =
      req.query.approval_status !== undefined &&
      req.query.approval_status !== null
        ? String(req.query.approval_status).trim().toLowerCase()
        : "";

    const keyword =
      req.query.search !== undefined ? req.query.search : req.query.keyword;
    let regex;
    let serviceIdsFromKeyword = [];
    if (keyword) {
      const sanitizedKeyword = sanitizeInput(keyword);
      regex = new RegExp(sanitizedKeyword, "i");
      const matchedServices = await Service.find({
        deleted_at: null,
        name: regex,
      }).select("_id");
      serviceIdsFromKeyword = matchedServices.map((service) => service._id);
    }

    let subcategoryNameRegex;
    if (req.query.subcategory_name || req.query.name) {
      const sanitizedName = sanitizeInput(
        req.query.subcategory_name || req.query.name
      );
      subcategoryNameRegex = new RegExp(sanitizedName, "i");
    }

    const filter = {
      deleted_at: null,
      ...(is_active !== null && { is_active }),
      ...(is_request !== null && { is_request }),
      ...(approval_status && { approval_status }),
      ...(keyword && {
        $or: [
          { name: regex },
          { desc: regex },
          ...(serviceIdsFromKeyword.length > 0
            ? [{ services: { $in: serviceIdsFromKeyword } }]
            : []),
        ],
      }),
      ...((req.query.subcategory_name || req.query.name) && {
        name: subcategoryNameRegex,
      }),
    };

    const statusConfig = getSubcategoryStatusConfig(statusFilter);
    Object.assign(filter, statusConfig);

    if (req.query.category_id) {
      const categoryResult = await checkObjectIdExists(
        Category,
        req.query.category_id,
        "category"
      );
      if (categoryResult.exists === false) {
        const statusCode = getIdValidationStatus(categoryResult.message);
        return res.status(statusCode).json({
          success: false,
          status: statusCode,
          message: categoryResult.message,
        });
      }
      filter.category_id = new mongoose.Types.ObjectId(req.query.category_id);
    }

    const caller = await User.findOne({
      _id: req.user.id,
      deleted_at: null,
    }).select("type franchise_id");
    if (!caller) {
      return res.status(401).json({
        success: false,
        status: 401,
        message: "User not found.",
      });
    }

    const isRequestListing =
      filter.is_request === true || statusConfig.is_request === true;
    const scopeResult = await applyCatalogRequestScopeForCaller(
      filter,
      caller,
      req.query,
      isRequestListing
    );
    if (!scopeResult.ok) {
      return res.status(scopeResult.status).json({
        success: false,
        status: scopeResult.status,
        message: scopeResult.message,
      });
    }

    if (
      (caller.type === USER_TYPE_SUPER_ADMIN ||
        caller.type === USER_TYPE_STAFF) &&
      is_request === null &&
      filter.is_request === undefined
    ) {
      filter.is_request = false;
    }

    const sort = { created_at: -1 };
    const pageResult = await applyPagination(
      Subcategory,
      filter,
      page,
      limit,
      sort
    );

    const withRequestedBy = await attachRequestedByUser(pageResult.data);
    const withServices = await attachServiceNames(withRequestedBy);
    const enriched = await attachCategoryNames(withServices);

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Sub Category list fetched successfully.",
      totalItems: pageResult.totalCount,
      totalPages: pageResult.totalPages,
      currentPage: pageResult.currentPage,
      records: enriched,
    });
  } catch (err) {
    console.log("Error is ", err.message);
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Technical issue. Please try again..",
    });
  }
};

const create = async (req, res) => {
  try {
    const {
      name,
      desc,
      category_id,
      image_url,
      service_ids: rawServiceIds = [],
    } = req.body;

    const service_ids = dedupeServiceIds(rawServiceIds);
    const trimmedName = normalizeCatalogName(name);

    const categoryResult = await checkObjectIdExists(
      Category,
      category_id,
      "category"
    );
    if (categoryResult.exists === false) {
      const statusCode = getIdValidationStatus(categoryResult.message);
      return res.status(statusCode).json({
        success: false,
        status: statusCode,
        message: categoryResult.message,
      });
    }

    const existingSubcategory = await Subcategory.findOne(
      subcategoryNameExistsQuery(trimmedName, category_id)
    );
    if (existingSubcategory) {
      return res.status(409).json({
        success: false,
        status: 409,
        message: "Sub Category name already exists for this category.",
      });
    }

    const serviceResult = await checkObjectIdExists(
      Service,
      service_ids,
      "service"
    );
    if (serviceResult.exists === false) {
      const statusCode = getIdValidationStatus(serviceResult.message);
      return res.status(statusCode).json({
        success: false,
        status: statusCode,
        message: serviceResult.message,
      });
    }

    const isRequest = Boolean(
      (typeof req.path === "string" && req.path.includes("/create-request")) ||
        asBodyBool(req.body.is_request, false)
    );
    const nextIsActive = isRequest
      ? asBodyBool(req.body.is_active, false)
      : true;

    const subcategory_id = await getSubcategoryId();
    const services = dedupeServiceIds(service_ids);
    const newSubcategory = new Subcategory({
      name: trimmedName,
      desc,
      subcategory_id,
      category_id,
      services,
      image_url,
      is_active: nextIsActive,
      is_request: isRequest,
      approval_status: isRequest ? "pending" : "approve",
      rejection_reason: null,
      requested_by: isRequest ? req.user.id : null,
    });

    const savedSubcategory = await newSubcategory.save();
    return res.status(200).json({
      success: true,
      status: 200,
      message: "Sub Category created successfully.",
      record: savedSubcategory,
    });
  } catch (error) {
    console.error("Error creating Sub Category:", error.message);
    if (error?.name === "CastError") {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid id format.",
      });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        status: 400,
        message: error.message || "Invalid input.",
      });
    }
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Technical issue. Please try again..",
    });
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid sub category id.",
      });
    }

    const subcategory = await Subcategory.findById(id);
    if (!subcategory || subcategory.deleted_at) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "No record found",
      });
    }

    const nextCategoryId =
      updateData.category_id !== undefined
        ? updateData.category_id
        : subcategory.category_id;

    if (updateData.category_id !== undefined) {
      const categoryResult = await checkObjectIdExists(
        Category,
        updateData.category_id,
        "category"
      );
      if (categoryResult.exists === false) {
        const statusCode = getIdValidationStatus(categoryResult.message);
        return res.status(statusCode).json({
          success: false,
          status: statusCode,
          message: categoryResult.message,
        });
      }
    }

    if (updateData.name !== undefined) {
      const trimmedName = normalizeCatalogName(updateData.name);
      const existingSubcategory = await Subcategory.findOne(
        subcategoryNameExistsQuery(trimmedName, nextCategoryId, id)
      );
      if (existingSubcategory) {
        return res.status(409).json({
          success: false,
          status: 409,
          message: "Sub Category name already exists for this category.",
        });
      }
      updateData.name = trimmedName;
    } else if (updateData.category_id !== undefined) {
      const existingSubcategory = await Subcategory.findOne(
        subcategoryNameExistsQuery(subcategory.name, nextCategoryId, id)
      );
      if (existingSubcategory) {
        return res.status(409).json({
          success: false,
          status: 409,
          message: "Sub Category name already exists for this category.",
        });
      }
    }

    let builtServices;
    if (updateData.service_ids !== undefined) {
      const uniqueIds = dedupeServiceIds(updateData.service_ids);
      const serviceResult = await checkObjectIdExists(
        Service,
        uniqueIds,
        "service"
      );
      if (serviceResult.exists === false) {
        return res.status(409).json({
          success: false,
          status: 409,
          message: serviceResult.message,
        });
      }
      builtServices = uniqueIds;
    }

    if (builtServices !== undefined) {
      subcategory.services = builtServices;
    }

    delete updateData.service_ids;
    delete updateData.services;
    delete updateData.subcategory_id;
    delete updateData.requested_by;

    if (updateData.approval_status !== undefined) {
      updateData.approval_status = asApprovalStatus(
        updateData.approval_status,
        subcategory.approval_status
      );
    }
    if (updateData.is_rejected !== undefined) {
      const nextRejectedState = asBodyBool(updateData.is_rejected, null);
      if (nextRejectedState === true) updateData.approval_status = "rejected";
      else if (nextRejectedState === false) updateData.approval_status = "approve";
      delete updateData.is_rejected;
    }

    if (updateData.approval_status !== undefined) {
      if (updateData.approval_status === "rejected") {
        const reason = updateData.rejection_reason;
        if (
          reason === undefined ||
          reason === null ||
          String(reason).trim() === ""
        ) {
          return res.status(400).json({
            success: false,
            status: 400,
            message: "Rejection reason is required when rejecting.",
          });
        }
        updateData.is_request = true;
        updateData.rejection_reason = String(reason).trim();
      } else if (updateData.approval_status === "approve") {
        updateData.is_request = false;
        updateData.rejection_reason = null;
      } else if (updateData.approval_status === "pending") {
        updateData.is_request = true;
        updateData.rejection_reason = null;
      }
    } else if (updateData.rejection_reason !== undefined) {
      updateData.rejection_reason =
        subcategory.approval_status === "rejected"
          ? updateData.rejection_reason === undefined ||
            updateData.rejection_reason === null ||
            updateData.rejection_reason === ""
            ? null
            : String(updateData.rejection_reason)
          : null;
    }

    if (
      typeof req.path === "string" &&
      req.path.includes("/update-request")
    ) {
      updateData.is_request = true;
      if (updateData.approval_status === undefined) {
        updateData.approval_status = "pending";
      }
    }

    Object.keys(updateData).forEach((key) => {
      if (key === "is_active") {
        subcategory[key] = asBodyBool(updateData[key], subcategory[key]);
        return;
      }
      if (key === "is_request") {
        subcategory[key] = asBodyBool(updateData[key], subcategory[key]);
        return;
      }
      if (key === "rejection_reason") {
        const v = updateData[key];
        subcategory[key] =
          v === undefined || v === null || v === "" ? null : String(v);
        return;
      }
      subcategory[key] = updateData[key];
    });

    subcategory.updated_at = Date.now();
    const updatedSubcategory = await subcategory.save();

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Sub Category updated successfully",
      record: updatedSubcategory,
    });
  } catch (error) {
    console.error("Error updating Sub Category:", error.message);
    if (error?.name === "CastError") {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid id format.",
      });
    }
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Technical issue. Please try again..",
    });
  }
};

const getById = async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid sub category id.",
      });
    }

    const subcategory = await Subcategory.findOne({
      _id: id,
      deleted_at: null,
    });

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "No record found",
      });
    }

    const [withRequestedBy] = await attachRequestedByUser([subcategory]);
    const [withServices] = await attachServiceNames([withRequestedBy]);
    const [enriched] = await attachCategoryNames([withServices]);

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Sub Category fetched successfully",
      record: enriched,
    });
  } catch (error) {
    console.error("Error fetching Sub Category:", error);
    if (error?.name === "CastError") {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid id format.",
      });
    }
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Technical issue. Please try again..",
    });
  }
};

const deleteSubcategory = async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Invalid sub category id.",
      });
    }

    const subcategory = await Subcategory.findById(id);

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "No record found",
      });
    }

    if (subcategory.deleted_at) {
      return res.status(400).json({
        success: false,
        status: 400,
        message: "Sub Category is already deleted",
      });
    }

    subcategory.deleted_at = new Date();
    subcategory.updated_at = Date.now();
    await subcategory.save();

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Sub Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting Sub Category:", error);
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Technical issue. Please try again..",
    });
  }
};

const getDropDown = async (req, res) => {
  try {
    const filter = {
      deleted_at: null,
      is_active: true,
      is_request: false,
    };
    const sort = { created_at: -1 };

    if (req.query.category_id) {
      const categoryResult = await checkObjectIdExists(
        Category,
        req.query.category_id,
        "category"
      );
      if (categoryResult.exists === false) {
        return res.status(409).json({
          success: false,
          status: 409,
          message: categoryResult.message,
        });
      }
      filter.category_id = new mongoose.Types.ObjectId(req.query.category_id);
    }

    const { data: subcategories } = await applyDropDownFilter(
      Subcategory,
      filter,
      sort
    );

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Sub Category list fetched successfully.",
      records: subcategories,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: 500,
      message: "Technical issue. Please try again..",
    });
  }
};

module.exports = {
  getAll,
  create,
  update,
  getById,
  deleteSubcategory,
  getDropDown,
};
