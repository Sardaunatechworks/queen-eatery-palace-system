/**
 * Formats a number as Nigerian Naira (₦)
 * @param amount The amount to format
 * @returns Formatted currency string
 */
export const formatNaira = (amount: number): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('NGN', '₦');
};

/**
 * Generates a sequential-ready order ID format
 * Note: Actual sequence should be handled by the database
 * @param sequence The current sequence number
 */
export const formatOrderId = (sequence: number): string => {
  return `QEP-${String(sequence).padStart(5, '0')}`;
};
