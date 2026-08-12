/**
 * Generates the appropriate WhatsApp URL based on platform device type.
 * On Mobile (iOS / Android), uses `https://api.whatsapp.com/send` deep-link to open native WhatsApp app directly.
 * On Desktop / PC, uses `https://web.whatsapp.com/send` to open WhatsApp Web.
 */
export const getWhatsAppUrl = (phone: string, text: string): string => {
  let cleanPhone = (phone || '').replace(/\D/g, '');
  if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
  const encoded = encodeURIComponent(text);

  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    return cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
  }

  return cleanPhone
    ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
    : `https://web.whatsapp.com/send?text=${encoded}`;
};
