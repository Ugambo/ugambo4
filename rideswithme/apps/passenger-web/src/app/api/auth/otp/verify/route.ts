import { bff } from '@/server/bff';

/** Signs in with the SMS code. Tokens go into the encrypted cookie; the browser only gets the user. */
export const POST = (req: Request) => bff.otpVerify(req);
