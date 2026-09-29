const roundMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

/**
 * Intra-state GST split: CGST and SGST are each half of the tax.
 * Orders include tax on additional charges (same total as the invoice GST rows).
 */
const attachGstSplit = (record, { includeAdditionalChargesTax = false } = {}) => {
  if (!record || typeof record !== 'object') return record;
  const taxPercent = Number(record.tax_percent) || 0;
  const baseTax = Number(record.tax_amount ?? record.tax) || 0;
  const chargesTax = includeAdditionalChargesTax
    ? Number(record.additional_charges_tax) || 0
    : 0;
  const totalTax = roundMoney(baseTax + chargesTax);
  const halfPercent = roundMoney(taxPercent / 2);
  const cgstAmount = roundMoney(totalTax / 2);

  record.cgst_percent = halfPercent;
  record.sgst_percent = halfPercent;
  record.cgst_amount = cgstAmount;
  record.sgst_amount = roundMoney(totalTax - cgstAmount);
  return record;
};

const attachQuoteGstSplit = (quote) => attachGstSplit(quote);

const attachOrderGstSplit = (order) =>
  attachGstSplit(order, { includeAdditionalChargesTax: true });

module.exports = {
  attachGstSplit,
  attachQuoteGstSplit,
  attachOrderGstSplit,
};
