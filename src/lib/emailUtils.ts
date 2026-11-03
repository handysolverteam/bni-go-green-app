export const isValidEmail = (email?: string | null): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());

/** mailto: link that opens the user's mail app with the subject and body pre-filled. */
export const getMailtoUrl = (email: string, subject: string, body: string): string =>
  `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** Opens a mailto: link from a click handler without navigating the page away. */
export const openMailto = (url: string): void => {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
};
