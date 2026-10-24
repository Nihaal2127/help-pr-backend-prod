const mongoose = require('mongoose');
const Order = require('../../../models/order');
const OrderPayment = require('../../../models/order_payment');
const User = require('../../../models/user');
const Service = require('../../../models/service');
const Address = require('../../../models/address');
const { loadOrderDetailLean } = require('../../order_detail_service');
const { buildOrderInvoiceHtml } = require('../../../utils/order_invoice_html');
const { embedOrderDetailForeignKeys } = require('../../../utils/list_aggregation');
const { stripAdminDescriptionForPublicApi } = require('../../../utils/admin_description_access');
const { fail, ok } = require('../../../utils/mobile_service_result');
const { assertValidCallerObjectId, loadCustomerOrder } = require('../shared/order_access_helpers');
const { fieldLabel } = require('../../../utils/field_labels');
const { formatOrderForApi } = require('../../../utils/order_api_format');
const { OrderCreationError } = require('../../../errors/order_creation_error');
const { combineDateAndTime } = require('../../../utils/order_schedule');
const { resolveQuotePricing } = require('../../quote_pricing_service');
const {
  createOrderFromBody,
  persistOrderAndLinkQuote,
  ORDER_TYPE_DEFAULT,
} = require('../../order_creation_service');
const { validateRefsForCreate } = require('./quote_service');
const { syncOrderPaymentStatus } = require('../../order_payment_status_service');
const { syncAllPartnerOrderPaymentsForOrder } = require('../../partner_wallet_order_service');
const {
  loadCustomerProfile,
  initiateOnlineOrderPayment,
  syncPendingOrderPayment,
  RAZORPAY_LINK_RESUMABLE,
} = require('../../../src/modules/payments/services/orderOnlinePayment.service');
const { buildQuoteDepositSummary } = require('../../../src/modules/payments/services/quoteDepositPayment.service');
const { fetchPaymentLink } = require('../../../src/modules/payments/razorpay.client');
const GatewayPayment = require('../../../models/gateway_payment');
const {
  PAYMENT_PURPOSES,
  GATEWAY_PAYMENT_METHOD,
} = require('../../../src/modules/payments/constants/payment.constants');
const {
  safeNotifyOrderInvoiceDownloaded,
  safeNotifyOrderPaymentReceived,
} = require('../../../src/modules/notifications/services/domainHooks');
const {
  buildOrderListSearchRegex,
  applyOrderManagementStatusFilter,
  applyOrderDateAndPaidFilters,
  applyUserPaymentStatusFilter,
  applyObjectIdFilters,
  fetchPaginatedMobileOrderList,
  parseMobileOrderListPagination,
} = require('../shared/order_list_helpers');

const MOBILE_ORDER_LIST_SEARCH_FIELDS = [
  'unique_id',
  'user_unique_id',
  'address',
  'comments',
  'transaction_id',
  'payment_mode_id',
  'discount_code',
  'customer_description',
  'order_description',
  '_quote.quote_sequence_id',
  '_quote.quote_description',
  '_user.name',
  '_user.user_id',
  '_user.email',
  '_user.phone_number',
  '_partner.name',
  '_partner.user_id',
  '_partner.email',
  '_partner.phone_number',
  '_employee.name',
  '_employee.user_id',
  '_created_by.name',
  '_created_by.user_id',
  '_category.name',
  '_category.category_id',
  '_subcategory.name',
  '_subcategory.subcategory_id',
  '_service.name',
  '_service.service_id',
  '_city.name',
  '_franchise.name',
];

const CUSTOMER_OBJECT_ID_FILTER_KEYS = [
  'franchise_id',
  'partner_id',
  'category_id',
  'service_id',
  'city_id',
  'address_id',
];

const formatMobileOrderForApi = (order) =>
  stripAdminDescriptionForPublicApi(formatOrderForApi(order));

const isDirectOrderEnabled = (value) => value !== false;

const resolveDirectOrderDescription = (body) => {
  if (typeof body.order_description === 'string') {
    return body.order_description.trim();
  }
  if (typeof body.quote_description === 'string') {
    return body.quote_description.trim();
  }
  return '';
};

const listCustomerOrders = async (customerId, query = {}) => {
  try {
    const callerResult = assertValidCallerObjectId(customerId);
    if (!callerResult.ok) {
      return callerResult;
    }

    const { page, limit, skip } = parseMobileOrderListPagination(query);

    const filter = {
      deleted_at: null,
      user_id: callerResult.oid,
    };

    const statusResult = applyOrderManagementStatusFilter(filter, query);
    if (!statusResult.ok) {
      return statusResult;
    }

    const searchRegex = buildOrderListSearchRegex(query);

    const datePaidResult = applyOrderDateAndPaidFilters(filter, query);
    if (!datePaidResult.ok) {
      return datePaidResult;
    }

    const paymentResult = applyUserPaymentStatusFilter(filter, query);
    if (!paymentResult.ok) {
      return paymentResult;
    }

    const objectIdResult = applyObjectIdFilters(filter, query, CUSTOMER_OBJECT_ID_FILTER_KEYS);
    if (!objectIdResult.ok) {
      return objectIdResult;
    }

    const listData = await fetchPaginatedMobileOrderList({
      filter,
      searchRegex,
      skip,
      limit,
      page,
      searchFields: MOBILE_ORDER_LIST_SEARCH_FIELDS,
      includeCustomerReviews: true,
    });

    return ok(200, {
      message: 'Orders fetched successfully.',
      data: listData,
    });
  } catch (err) {
    console.error('mobile user list orders', err.message);
    return fail(500, 'Technical issue. Please try again..');
  }
};

const getCustomerOrderById = async (customerId, orderId) => {
  try {
    const callerResult = assertValidCallerObjectId(customerId);
    if (!callerResult.ok) {
      return callerResult;
    }
    if (!orderId || !mongoose.Types.ObjectId.isValid(String(orderId))) {
      return fail(400, 'Invalid order id.');
    }

    const order = await Order.findOne({
      _id: orderId,
      user_id: callerResult.oid,
      deleted_at: null,
    });

    if (!order) {
      return fail(404, 'Order not found.');
    }

    const record = await loadOrderDetailLean(order._id);
    if (!record) {
      return fail(404, 'Order not found.');
    }

    return ok(200, {
      message: 'Order details fetched successfully.',
      record: stripAdminDescriptionForPublicApi(embedOrderDetailForeignKeys(record)),
    });
  } catch (err) {
    console.error('mobile user get order details', err.message);
    return fail(500, 'Technical issue. Please try again..');
  }
};

const getCustomerOrderInvoice = async (customerId, orderId) => {
  try {
    const callerResult = assertValidCallerObjectId(customerId);
    if (!callerResult.ok) {
      return callerResult;
    }
    if (!orderId || !mongoose.Types.ObjectId.isValid(String(orderId))) {
      return fail(400, 'Invalid order id.');
    }

    const order = await Order.findOne({
      _id: orderId,
      user_id: callerResult.oid,
      deleted_at: null,
    });

    if (!order) {
      return fail(404, 'Order not found.');
    }

    const record = await loadOrderDetailLean(order._id);
    if (!record) {
      return fail(404, 'Order not found.');
    }

    const html = buildOrderInvoiceHtml(record, { audience: 'user' });
    const safeId = String(record.unique_id || order._id).replace(/[^\w-]/g, '_');

    void safeNotifyOrderInvoiceDownloaded({
      order,
      actorUserId: customerId,
    });

    return ok(200, {
      html,
      filename: `invoice-${safeId}.html`,
    });
  } catch (err) {
    console.error('mobile user get order invoice', err.message);
    return fail(500, 'Technical issue. Please try again..');
  }
};

const createDirectCustomerOrder = async (customerId, body) => {
  try {
    const refCheck = await validateRefsForCreate(customerId, body);
    if (!refCheck.ok) return refCheck;

    if (!body.partner_id || !mongoose.Types.ObjectId.isValid(String(body.partner_id))) {
      return fail(400, `Valid ${fieldLabel('partner_id')} is required.`);
    }

    const [serviceDoc, partnerDoc] = await Promise.all([
      Service.findOne({ _id: body.service_id, deleted_at: null })
        .select('direct_order')
        .lean(),
      User.findOne({ _id: body.partner_id, deleted_at: null })
        .select('direct_order')
        .lean(),
    ]);

    if (!isDirectOrderEnabled(serviceDoc?.direct_order) || !isDirectOrderEnabled(partnerDoc?.direct_order)) {
      return fail(409, 'Direct order is not allowed for this service and partner.');
    }

    let pricing;
    try {
      ({ pricing } = await resolveQuotePricing(body));
    } catch (pricingErr) {
      if (pricingErr instanceof OrderCreationError) {
        return fail(pricingErr.status, pricingErr.message);
      }
      throw pricingErr;
    }

    const minimumDeposit = Number(pricing.minimum_deposit_amount) || 0;
    const totalPrice = Number(pricing.total_price) || 0;
    const paidAmount = Number(body.amount);

    if (paidAmount < minimumDeposit) {
      return fail(
        409,
        `Minimum deposit is ${minimumDeposit}. Amount must be at least the minimum deposit.`
      );
    }
    if (totalPrice > 0 && paidAmount > totalPrice) {
      return fail(409, 'Amount cannot exceed the order total.');
    }

    const [customer, addressDoc] = await Promise.all([
      User.findById(customerId).select('user_id').lean(),
      Address.findById(body.address_id).lean(),
    ]);
    if (!customer) {
      return fail(404, 'Customer not found.');
    }
    if (!addressDoc) {
      return fail(400, 'Address not found.');
    }

    const service_from_time = combineDateAndTime(body.from_date, body.work_start_time);
    const service_to_time = combineDateAndTime(body.from_date, body.work_end_time);
    if (!service_from_time || !service_to_time) {
      return fail(
        409,
        'Could not build service times from from date, work start time, and work end time.'
      );
    }

    const charge = Number(pricing.total_service_charge) || 0;
    if (!(charge > 0)) {
      return fail(409, 'Service charge must be greater than 0 to create an order.');
    }

    const orderDescription = resolveDirectOrderDescription(body);
    const addressStr =
      addressDoc.address ||
      [addressDoc.landmark, addressDoc.area].filter(Boolean).join(', ') ||
      '';
    const paymentMethod = String(body.payment_method || '').trim().toLowerCase();
    const resolvedSubcategoryId =
      body.subcategory_id !== undefined &&
      body.subcategory_id !== null &&
      String(body.subcategory_id).trim() !== ''
        ? body.subcategory_id
        : null;

    const orderBody = {
      user_id: customerId,
      user_unique_id: customer.user_id || '',
      city_id: addressDoc.city_id,
      category_id: body.category_id,
      subcategory_id: resolvedSubcategoryId,
      is_paid: false,
      payment_mode_id: '',
      transaction_id: '',
      created_by_id: customerId,
      order_date: body.from_date,
      total_service_charge: charge,
      service_price: charge,
      address: addressStr,
      type: ORDER_TYPE_DEFAULT,
      partner_id: body.partner_id,
      employee_id: null,
      franchise_id: body.franchise_id,
      address_id: body.address_id,
      service_id: body.service_id,
      from_date: body.from_date,
      to_date: body.to_date,
      work_hours_per_day: body.work_hours_per_day,
      total_work_hours: body.total_work_hours,
      work_start_time: String(body.work_start_time).trim(),
      work_end_time: String(body.work_end_time).trim(),
      customer_description: orderDescription,
      order_description: orderDescription,
      quote_id: null,
      rejection_reason: '',
      discount_percent: null,
      discount_code: '',
      discount_reason: '',
      payment_schedule_type: 'single',
      customer_payment_method: paymentMethod,
      service_items: [
        {
          user_id: customerId,
          partner_id: body.partner_id,
          category_id: body.category_id,
          subcategory_id: resolvedSubcategoryId,
          service_id: body.service_id,
          service_date: body.from_date,
          service_from_time,
          service_to_time,
          total_service_charge: charge,
          service_price: charge,
          is_paid: false,
          rating: 0,
        },
      ],
    };

    let created;
    try {
      const draft = await createOrderFromBody(orderBody, {
        linkQuote: false,
        actorUserId: customerId,
      });
      created = await persistOrderAndLinkQuote(draft, {
        notifyPartners: true,
        requestBody: orderBody,
        actorUserId: customerId,
      });
    } catch (error) {
      if (error instanceof OrderCreationError) {
        return fail(error.status, error.message);
      }
      throw error;
    }

    if (paymentMethod === 'online') {
      const profile = await loadCustomerProfile(customerId);
      if (!profile.ok) {
        return fail(profile.status, profile.message);
      }

      const onlineResult = await initiateOnlineOrderPayment({
        order: created.order,
        customer: profile.user,
        amount: paidAmount,
        notes: body.notes
          ? String(body.notes).trim()
          : 'Order deposit — Razorpay online payment',
      });

      if (!onlineResult.ok) {
        return fail(onlineResult.status, onlineResult.message);
      }

      let paymentRow = onlineResult.payment;
      if (onlineResult.already_completed && paymentRow?._id) {
        paymentRow = await OrderPayment.findById(paymentRow._id).lean();
      }

      const latestOrder = await Order.findById(created.order._id).lean();
      const depositCollected =
        onlineResult.already_completed && paymentRow?.status === 'completed';

      return ok(onlineResult.status, {
        message: onlineResult.resumed
          ? 'Continue your pending payment to complete this order deposit.'
          : onlineResult.already_completed
            ? 'Order created and payment completed successfully.'
            : 'Order created. Complete payment to collect the deposit.',
        data: {
          order: formatMobileOrderForApi(latestOrder || created.order),
          payment: {
            ...paymentRow,
            payment_url: onlineResult.payment_url || null,
            resumed: Boolean(onlineResult.resumed),
          },
          deposit: buildQuoteDepositSummary(minimumDeposit, paidAmount, depositCollected),
        },
      });
    }

    const paymentStatus = body.payment_status ? String(body.payment_status).trim() : 'completed';
    const allowedPaymentStatuses = new Set(['pending', 'completed']);
    if (!allowedPaymentStatuses.has(paymentStatus)) {
      return fail(400, `${fieldLabel('payment_status')} must be either pending or completed.`);
    }

    const orderPayment = new OrderPayment({
      order_id: created.order._id,
      payer_type: 'customer',
      amount: paidAmount,
      payment_method: paymentMethod,
      status: paymentStatus,
      transaction_reference: body.transaction_reference
        ? String(body.transaction_reference).trim()
        : '',
      paid_at:
        body.paid_at !== undefined && body.paid_at !== null && body.paid_at !== ''
          ? new Date(body.paid_at)
          : paymentStatus === 'completed'
            ? new Date()
            : null,
      notes: body.notes ? String(body.notes).trim() : '',
    });
    await orderPayment.save();

    await syncOrderPaymentStatus(created.order._id);
    await syncAllPartnerOrderPaymentsForOrder(created.order._id);

    const refreshedOrder = await Order.findById(created.order._id).lean();

    if (paymentStatus === 'completed') {
      void safeNotifyOrderPaymentReceived({
        order: refreshedOrder || created.order,
        payment: orderPayment.toObject(),
        actorUserId: customerId,
      });
    }

    return ok(200, {
      message: 'Order created successfully.',
      data: {
        order: formatMobileOrderForApi(refreshedOrder || created.order),
        payment: orderPayment.toObject(),
        deposit: buildQuoteDepositSummary(
          minimumDeposit,
          paidAmount,
          paymentStatus === 'completed'
        ),
      },
    });
  } catch (err) {
    console.error('mobile user create direct order', err.message);
    return fail(500, 'Technical issue. Please try again..');
  }
};

const previewDirectCustomerOrder = async (customerId, query = {}) => {
  try {
    const refCheck = await validateRefsForCreate(customerId, query);
    if (!refCheck.ok) return refCheck;

    if (!query.partner_id || !mongoose.Types.ObjectId.isValid(String(query.partner_id))) {
      return fail(400, `Valid ${fieldLabel('partner_id')} is required.`);
    }

    const [serviceDoc, partnerDoc] = await Promise.all([
      Service.findOne({ _id: query.service_id, deleted_at: null })
        .select('name service_id desc image_url payment_type direct_order')
        .lean(),
      User.findOne({ _id: query.partner_id, deleted_at: null })
        .select('name user_id profile_url direct_order')
        .lean(),
    ]);

    if (!serviceDoc) {
      return fail(404, 'Service not found.');
    }
    if (!partnerDoc) {
      return fail(404, 'Partner not found.');
    }

    if (!isDirectOrderEnabled(serviceDoc.direct_order) || !isDirectOrderEnabled(partnerDoc.direct_order)) {
      return fail(409, 'Direct order is not allowed for this service and partner.');
    }

    let pricing;
    try {
      ({ pricing } = await resolveQuotePricing(query));
    } catch (pricingErr) {
      if (pricingErr instanceof OrderCreationError) {
        return fail(pricingErr.status, pricingErr.message);
      }
      throw pricingErr;
    }

    const charge = Number(pricing.total_service_charge) || 0;
    if (!(charge > 0)) {
      return fail(409, 'Service charge must be greater than 0 to create an order.');
    }

    const addressDoc = await Address.findById(query.address_id)
      .select('address landmark area city_id pincode contact_name contact_number')
      .lean();
    if (!addressDoc) {
      return fail(400, 'Address not found.');
    }

    const minimumDeposit = Number(pricing.minimum_deposit_amount) || 0;
    const franchise = refCheck.franchise;

    return ok(200, {
      message: 'Direct order preview fetched successfully.',
      data: {
        direct_order: true,
        franchise_id: query.franchise_id,
        category_id: query.category_id,
        subcategory_id: query.subcategory_id || null,
        service_id: query.service_id,
        partner_id: query.partner_id,
        address_id: query.address_id,
        franchise: franchise
          ? { _id: franchise._id, name: franchise.name }
          : null,
        service: {
          _id: serviceDoc._id,
          name: serviceDoc.name,
          service_id: serviceDoc.service_id,
          desc: serviceDoc.desc,
          image_url: serviceDoc.image_url,
          payment_type: serviceDoc.payment_type,
          direct_order: isDirectOrderEnabled(serviceDoc.direct_order),
        },
        partner: {
          _id: partnerDoc._id,
          name: partnerDoc.name,
          user_id: partnerDoc.user_id,
          profile_url: partnerDoc.profile_url,
          direct_order: isDirectOrderEnabled(partnerDoc.direct_order),
        },
        address: addressDoc,
        pricing: {
          total_service_charge: pricing.total_service_charge,
          commission_percent: pricing.commission_percent,
          commission_amount: pricing.commission_amount,
          tax_percent: pricing.tax_percent,
          tax_amount: pricing.tax_amount,
          sub_total: pricing.sub_total,
          total_price: pricing.total_price,
          minimum_deposit_percent: pricing.minimum_deposit_percent,
          minimum_deposit_amount: pricing.minimum_deposit_amount,
        },
        deposit: buildQuoteDepositSummary(minimumDeposit, 0, false),
      },
    });
  } catch (err) {
    console.error('mobile user preview direct order', err.message);
    return fail(500, 'Technical issue. Please try again..');
  }
};

const getDirectOrderDepositPaymentStatus = async (customerId, orderId, paymentId) => {
  try {
    if (!paymentId || !mongoose.Types.ObjectId.isValid(String(paymentId))) {
      return fail(400, 'Invalid payment id.');
    }

    const access = await loadCustomerOrder(customerId, orderId);
    if (!access.ok) return access;

    const order = access.data.order;
    if (order.quote_id) {
      return fail(404, 'Direct order not found.');
    }

    const payment = await OrderPayment.findOne({
      _id: paymentId,
      order_id: order._id,
      payer_type: 'customer',
      deleted_at: null,
      $or: [{ quote_id: null }, { quote_id: { $exists: false } }],
    }).lean();

    if (!payment) {
      return fail(404, 'Direct order deposit payment not found.');
    }

    let syncResult = null;
    if (
      payment.status === 'pending' &&
      payment.payment_method === GATEWAY_PAYMENT_METHOD &&
      payment.transaction_reference
    ) {
      syncResult = await syncPendingOrderPayment(payment._id);
    }

    let latestPayment = payment;
    if (syncResult?.synced) {
      latestPayment = await OrderPayment.findById(payment._id).lean();
    }

    let paymentUrl = null;
    if (latestPayment.status === 'pending' && latestPayment.transaction_reference) {
      try {
        const link = await fetchPaymentLink(latestPayment.transaction_reference);
        if (RAZORPAY_LINK_RESUMABLE.has(link.status) && link.short_url) {
          paymentUrl = link.short_url;
        }
      } catch (err) {
        console.error(
          'getDirectOrderDepositPaymentStatus fetchPaymentLink',
          err?.response?.data || err.message
        );
      }
    }

    let gatewayPayment = null;
    if (latestPayment.status === 'completed') {
      gatewayPayment = await GatewayPayment.findOne({
        purpose: PAYMENT_PURPOSES.ORDER,
        reference_id: latestPayment._id,
        deleted_at: null,
      })
        .select(
          'amount currency status payment_method gateway_payment_link_id gateway_payment_id instrument_type paid_at created_at'
        )
        .lean();
    }

    let latestOrder = order;
    if (syncResult?.synced) {
      latestOrder = syncResult.syncResult?.order || (await Order.findById(order._id).lean());
    } else if (typeof latestOrder.toObject === 'function') {
      latestOrder = latestOrder.toObject();
    }

    const minimumDeposit = Number(latestOrder.minimum_deposit_amount) || 0;
    const depositAmount = Number(latestPayment.amount) || 0;
    const depositCollected = latestPayment.status === 'completed';

    return ok(200, {
      message: syncResult?.synced
        ? 'Payment verified with Razorpay and order deposit applied.'
        : 'Direct order deposit payment status fetched successfully.',
      data: {
        payment_id: latestPayment._id,
        order_id: latestPayment.order_id,
        status: latestPayment.status,
        amount: latestPayment.amount,
        payment_method: latestPayment.payment_method,
        transaction_reference: latestPayment.transaction_reference,
        payment_url: paymentUrl,
        paid_at: latestPayment.paid_at,
        gateway_payment: gatewayPayment,
        order: formatMobileOrderForApi(latestOrder),
        deposit: buildQuoteDepositSummary(minimumDeposit, depositAmount, depositCollected),
        ...(syncResult
          ? {
              sync: {
                attempted: payment.status === 'pending',
                synced: syncResult.synced,
                reason: syncResult.reason || null,
                razorpay_status: syncResult.razorpay_status || null,
              },
            }
          : {}),
      },
    });
  } catch (err) {
    console.error('mobile user get direct order deposit payment status', err.message);
    return fail(500, 'Technical issue. Please try again..');
  }
};

module.exports = {
  listCustomerOrders,
  getCustomerOrderById,
  getCustomerOrderInvoice,
  createDirectCustomerOrder,
  previewDirectCustomerOrder,
  getDirectOrderDepositPaymentStatus,
};
