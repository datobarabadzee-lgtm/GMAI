/**
 * Direct contact channel.
 *
 * The number is read from the environment so it can be changed without a code
 * change, with the clinic's published number as the default. It is a business
 * contact shown to patients, so it is deliberately public — never treat it as a
 * secret.
 */
const RAW = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '995599412143';

/** wa.me requires digits only: no +, spaces or dashes. */
export const WHATSAPP_NUMBER = RAW.replace(/\D/g, '');

export const WHATSAPP_DISPLAY = `+${WHATSAPP_NUMBER.replace(/^(\d{3})(\d{3})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5')}`;

/**
 * Builds a wa.me link. WhatsApp caps the prefilled text, so a long question is
 * trimmed at a word boundary rather than cut mid-word.
 */
export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  if (!message?.trim()) return base;
  let text = message.trim().replace(/\s+/g, ' ');
  if (text.length > 700) text = `${text.slice(0, 700).replace(/\s\S*$/, '')}…`;
  return `${base}?text=${encodeURIComponent(text)}`;
}

export const CONTACT_INTRO_KA = 'გამარჯობა, კითხვა მაქვს:';
