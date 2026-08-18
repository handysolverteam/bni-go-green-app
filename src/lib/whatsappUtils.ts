/**
 * Normalizes phone numbers for comparison (returns last 10 digits for universal matching).
 * Strips all country codes (+91, +1, 0, etc.) and non-digit characters.
 */
export const getNormalized10DigitPhone = (phone?: string | null): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
};

/**
 * Checks if two phone numbers match regardless of country code prefix (+91, +1, etc.)
 * Strictly requires both numbers to contain at least 5 valid digits.
 */
export const arePhoneNumbersMatching = (phone1?: string | null, phone2?: string | null): boolean => {
  if (!phone1 || !phone2) return false;
  const p1 = getNormalized10DigitPhone(phone1);
  const p2 = getNormalized10DigitPhone(phone2);
  if (!p1 || !p2 || p1.length < 5 || p2.length < 5) return false;
  return p1 === p2;
};

/**
 * Formats a phone number cleanly with default country code (+91 by default).
 * Guaranteed to never duplicate country codes (+91 +91) or break existing codes.
 */
export const formatPhoneWithCountryCode = (phone?: string | null, defaultCc: string = '+91'): string => {
  if (!phone || !phone.trim()) return '';
  
  const cleanCc = defaultCc.trim().startsWith('+') ? defaultCc.trim() : `+${defaultCc.trim()}`;
  const ccDigits = cleanCc.replace(/\D/g, '');

  let rawDigits = phone.replace(/\D/g, '');
  if (!rawDigits) return '';

  // Strip leading zero if present (e.g. 09876543210 -> 9876543210)
  while (rawDigits.startsWith('0') && rawDigits.length > 10) {
    rawDigits = rawDigits.slice(1);
  }

  // If rawDigits already starts with ccDigits (e.g. 919876543210), strip ccDigits prefix
  if (ccDigits && rawDigits.startsWith(ccDigits) && rawDigits.length > 10) {
    rawDigits = rawDigits.slice(ccDigits.length);
  }

  return `${cleanCc} ${rawDigits}`;
};

/**
 * Generates the appropriate WhatsApp URL based on platform device type.
 * On Mobile (iOS / Android), uses `whatsapp://send` deep link to open native WhatsApp app directly if installed.
 * On Desktop / PC, uses `https://web.whatsapp.com/send` to open WhatsApp Web.
 */
export const getWhatsAppUrl = (phone: string, text: string, countryCode: string = '91'): string => {
  let cleanPhone = (phone || '').replace(/\D/g, '');
  const ccDigits = (countryCode || '91').replace(/\D/g, '') || '91';

  while (cleanPhone.startsWith('0') && cleanPhone.length > 10) {
    cleanPhone = cleanPhone.slice(1);
  }

  if (cleanPhone.length === 10) {
    cleanPhone = ccDigits + cleanPhone;
  }
  const encoded = encodeURIComponent(text);

  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    return cleanPhone
      ? `whatsapp://send?phone=${cleanPhone}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
  }

  return cleanPhone
    ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
    : `https://web.whatsapp.com/send?text=${encoded}`;
};
