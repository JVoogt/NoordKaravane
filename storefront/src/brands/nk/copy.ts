// Brand strings for islands and client scripts, reached only through the `@brand-copy` alias (plan DD7), so a build
// bundles one brand's strings and never the other's. Pure strings, no imports.
export interface ClientCopy {
  consentIntro: string;
  consentMarketing: string;
  checkoutCollectLine: string;
}

export const clientCopy: ClientCopy = {
  consentIntro: 'We use a few essential cookies to run the shop (your cart, your checkout). With your OK we also use analytics and marketing cookies to see what is working and to show our tees to people who might love them. Your call, and you can change it any time.',
  consentMarketing: 'Meta Pixel lets us measure our Facebook ads and show our products to people who visited. Also used for ad measurement through Google.',
  checkoutCollectLine: 'Noord Karavane, Pretoria North.',
};
