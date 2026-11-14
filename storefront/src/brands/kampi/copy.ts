import type { ClientCopy } from '../nk/copy';

// Kampi Store strings (brand-copy.md sections 4, 5, 7 and 8; approved by JP 2026-11-14). Pure strings, no imports.
export const clientCopy: ClientCopy = {
  consentIntro: 'We use a few essential cookies to run the store: your cart and your checkout. With your OK we also use analytics cookies to see which gear people look at, and marketing cookies to measure our ads. Your call, and you can change it any time.',
  // "Would": no marketing tag is loaded at launch (KAMPI_PUBLIC_META_PIXEL_ID is empty), so no tool is named.
  consentMarketing: 'Marketing cookies would let us measure our ads and show Kampi Store products to people who visited. They stay off unless you switch them on.',
  checkoutCollectLine: 'Sold and shipped by Noord Karavane, Pretoria North.',
  buyDeliveryLine: { beforePrice: 'Free delivery over ', afterPrice: ', or ', strong: 'collect free', after: ' in Pretoria North.' },
  quoteLine: { before: 'This is a large item, so we quote delivery for you. Or ', strong: 'collect free', after: ' in Pretoria North. Reply usually within two working days.' },
  cartEmptyTitle: 'Your cart is empty.',
  cartEmptyBody: 'Start with the camping gear, or search for what you need.',
  cartEmptyAction: 'Shop the gear',
  checkoutOptIn: false,
  ui: { well: ' kampi-well', panel: ' kampi-panel', nocaps: ' kampi-nocaps' },
};
