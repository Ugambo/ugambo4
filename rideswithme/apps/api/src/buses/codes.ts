import { randomInt } from 'node:crypto';

/** Letters and digits that cannot be mistaken for each other when read aloud or typed (no 0/O, 1/I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function code(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** A booking reference passengers quote to staff and operators (8 characters). */
export const bookingReference = () => code(8);
/** A ticket code (10 characters, about 50 bits): shown under the QR code and checked at boarding. */
export const ticketCode = () => code(10);
export const qrPayload = (ticket: string) => `RWMBUS:${ticket}`;
