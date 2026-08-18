/**
 * Utility to format numbers cleanly to 1 decimal place max (e.g. 1.31232 -> 1.3, 5 -> 5).
 */
export const formatDecimal = (val: any, decimals: number = 1): string => {
  if (val === undefined || val === null || val === '') return '0';
  const num = Number(val);
  if (isNaN(num)) return '0';
  // Round to specified decimal places and convert to clean string without unneeded trailing zeros
  const rounded = Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return rounded.toString();
};

/**
 * Formats currency values cleanly (e.g. 150000 -> ₹1,50,000 or ₹1.5L)
 */
export const formatCurrency = (val: any): string => {
  if (val === undefined || val === null || val === '') return '₹0';
  const num = Number(val);
  if (isNaN(num)) return '₹0';
  return `₹${num.toLocaleString('en-IN')}`;
};
