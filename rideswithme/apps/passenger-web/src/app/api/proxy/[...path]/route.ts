import { bff } from '@/server/bff';

type Ctx = { params: Promise<{ path: string[] }> };

/** Forwards allow-listed API calls with the passenger's token from the session cookie. */
async function handle(req: Request, ctx: Ctx) {
  return bff.proxy(req, (await ctx.params).path.join('/'));
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
