import { Controller, Get, Headers, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode } from '@rideswithme/shared-types';
import { Public } from '../auth/principal';
import { AppException } from '../common/app-exception';
import { Inject } from '@nestjs/common';
import { FakePaymentProvider, type FakeCard } from './fake.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.provider';
import { WebhooksService } from './webhooks.service';

/** Paystack calls this (set it as the webhook URL in the Paystack dashboard). */
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Public()
  @Post('paystack')
  @HttpCode(200)
  async paystack(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-paystack-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.webhooks.receive(req.rawBody, signature, req.ip ?? '');
    return { received: true };
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The fake provider's checkout page, for development and browser tests only.
 * Every route answers 404 unless PAYMENT_PROVIDER=fake (refused in production).
 */
@Controller('v1/dev/fake-checkout')
export class FakeCheckoutController {
  constructor(@Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}

  private fake(): FakePaymentProvider {
    if (!(this.provider instanceof FakePaymentProvider))
      throw new AppException(ErrorCode.NOT_FOUND, 'Not found');
    return this.provider;
  }

  @Public()
  @Get(':reference')
  async page(@Param('reference') reference: string, @Res() res: Response) {
    const tx = await this.fake().checkout(reference);
    if (!tx) throw new AppException(ErrorCode.NOT_FOUND, 'Checkout not found');
    const naira = `₦${(tx.amountKobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const ref = encodeURIComponent(reference);
    // The forms finish by sending the payer back to the website or app.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http: https: rideswithme: rideswithme-driver:",
    );
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Test checkout</title>
<style>body{font-family:system-ui,sans-serif;background:#0F2A43;margin:0;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border-radius:16px;padding:32px;max-width:380px;width:calc(100% - 32px)}
h1{font-size:20px;margin:0 0 4px}p{color:#555}.amount{font-size:32px;font-weight:800;color:#0F2A43;margin:16px 0}
button{display:block;width:100%;min-height:48px;margin:8px 0;border-radius:10px;border:2px solid #0F2A43;font:600 16px system-ui;cursor:pointer;background:#fff;color:#0F2A43}
button.pay{background:#F5A623;border-color:#F5A623;color:#1a1a1a}.note{font-size:13px;color:#b00}</style></head>
<body><main><h1>Test checkout</h1><p class="note">Development only: no real money moves.</p>
<div class="amount">${escape(naira)}</div><p>Reference ${escape(reference)}</p>
${
  tx.status !== 'pending'
    ? `<p>This checkout is ${escape(tx.status)}.</p>`
    : `
<form method="post" action="${ref}/pay"><button class="pay">Pay with test card 4081</button></form>
<form method="post" action="${ref}/pay-declining"><button>Pay with a card that declines later charges (4084)</button></form>
<form method="post" action="${ref}/decline"><button>Card declined</button></form>
<form method="post" action="${ref}/cancel"><button>Cancel</button></form>`
}
</main></body></html>`);
  }

  private async finish(
    reference: string,
    outcome: 'pay' | 'decline' | 'cancel',
    card: FakeCard,
    res: Response,
  ) {
    const back = await this.fake().completeCheckout(reference, outcome, card);
    if (!back) throw new AppException(ErrorCode.NOT_FOUND, 'Checkout not found');
    res.redirect(303, back);
  }

  @Public()
  @Post(':reference/pay')
  pay(@Param('reference') reference: string, @Res() res: Response) {
    return this.finish(reference, 'pay', 'good', res);
  }

  @Public()
  @Post(':reference/pay-declining')
  payDeclining(@Param('reference') reference: string, @Res() res: Response) {
    return this.finish(reference, 'pay', 'declines_later', res);
  }

  @Public()
  @Post(':reference/decline')
  decline(@Param('reference') reference: string, @Res() res: Response) {
    return this.finish(reference, 'decline', 'good', res);
  }

  @Public()
  @Post(':reference/cancel')
  cancel(@Param('reference') reference: string, @Res() res: Response) {
    return this.finish(reference, 'cancel', 'good', res);
  }
}
