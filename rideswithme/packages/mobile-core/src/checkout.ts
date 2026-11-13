import * as WebBrowser from 'expo-web-browser';
import type { CheckoutView, PaymentView } from '@rideswithme/shared-types';
import { waitForPayment } from './payment-wait';

/**
 * Opens the provider's payment page in the system browser and, once the payer
 * returns (to returnUrl, the app's deep link) or closes it, asks the server
 * how the payment went. The app never decides a payment succeeded by itself.
 */
export async function runCheckout(
  start: () => Promise<CheckoutView>,
  check: (id: string) => Promise<PaymentView>,
  returnUrl: string,
): Promise<PaymentView> {
  const checkout = await start();
  await WebBrowser.openAuthSessionAsync(checkout.checkoutUrl, returnUrl);
  return waitForPayment(check, checkout.payment.id);
}
