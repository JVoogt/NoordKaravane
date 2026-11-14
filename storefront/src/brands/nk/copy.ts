// Brand strings for islands and client scripts, reached only through the `@brand-copy` alias (plan DD7), so a build
// bundles one brand's strings and never the other's. Pure strings, no imports. NK values are today's literals.
export interface ClientCopy {
  /** Cookie banner description (consent.ts). */
  consentIntro: string;
  /** Cookie settings, Marketing section (consent.ts). It must not name a tool the build does not load. */
  consentMarketing: string;
  /** Checkout aside, before "Edit cart". On Kampi it names the seller and renders inside data-seller. */
  checkoutCollectLine: string;
  /** Under Add to cart: `${beforePrice}${threshold}${afterPrice}<strong>${strong}</strong>${after}`. */
  buyDeliveryLine: { beforePrice: string; afterPrice: string; strong: string; after: string };
  /** Under Request a quote: `${before}<strong>${strong}</strong>${after}`. */
  quoteLine: { before: string; strong: string; after: string };
  /** Empty cart: head, an optional line ('' renders nothing) and the action (also the empty checkout's action). */
  cartEmptyTitle: string;
  cartEmptyBody: string;
  cartEmptyAction: string;
  /** The "Send me emails about new drops and offers" box at checkout (hidden on Kampi: no newsletter, RD2). */
  checkoutOptIn: boolean;
  /** Extra classes for the Kampi look (DESIGN.md 13: P4 dropped). Each is '' on NK, so NK markup is unchanged. */
  ui: { well: string; panel: string; nocaps: string };
}

export const clientCopy: ClientCopy = {
  consentIntro: 'We use a few essential cookies to run the shop (your cart, your checkout). With your OK we also use analytics and marketing cookies to see what is working and to show our tees to people who might love them. Your call, and you can change it any time.',
  consentMarketing: 'Meta Pixel lets us measure our Facebook ads and show our products to people who visited. Also used for ad measurement through Google.',
  checkoutCollectLine: 'Noord Karavane, Pretoria North.',
  buyDeliveryLine: { beforePrice: 'Free delivery over ', afterPrice: ', or ', strong: 'collect free', after: ' from the workshop.' },
  quoteLine: { before: 'This is a large item, so we quote delivery for you. Or ', strong: 'collect free', after: ' from the workshop. Reply usually within two working days.' },
  cartEmptyTitle: 'Your cart is empty. Nothing to edit yet.',
  cartEmptyBody: '',
  cartEmptyAction: 'Browse the shop',
  checkoutOptIn: true,
  ui: { well: '', panel: '', nocaps: '' },
};
