const franchiseSubcategoryService = require('../services/franchise_subcategory_service');

const sendServiceResult = (res, result) => {
    if (!result.ok) {
        return res.status(result.status).json({
            success: false,
            status: result.status,
            message: result.message,
            ...(result.error !== undefined && { error: result.error }),
        });
    }
    return res.status(result.status).json({
        success: true,
        status: result.status,
        ...result.data,
    });
};

const getAll = async (req, res) => {
    const result = await franchiseSubcategoryService.list(req.query, req.user?.id);
    return sendServiceResult(res, result);
};

module.exports = {
    getAll,
};
