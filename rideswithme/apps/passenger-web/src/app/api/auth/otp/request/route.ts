import { bff } from '@/server/bff';

export const POST = (req: Request) => bff.otpRequest(req);
