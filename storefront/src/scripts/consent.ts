import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';
import { clientEnv } from './env';
import { u } from '../lib/url';

const env = clientEnv();
type Item = { item_id: string; item_name: string; item_variant?: string; price?: number; quantity?: number };
type Queued = [string, Record<string, unknown>];

let gaLoaded = false;
let pixelLoaded = false;
const queue: Queued[] = [];

const PIXEL_MAP: Record<string, string> = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase' };

function loadScript(src: string) {
  const s = document.createElement('script');
  s.async = true; s.src = src; document.head.appendChild(s);
}

function loadGA() {
  if (gaLoaded || !env.ga4) return;
  gaLoaded = true;
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(env.ga4)}`);
  window.gtag('js', new Date());
  window.gtag('config', env.ga4, { anonymize_ip: true });
}

function loadPixel() {
  if (pixelLoaded || !env.pixel) return;
  pixelLoaded = true;
  /* eslint-disable */
  (function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement; t.async = true; t.src = v; b.head.appendChild(t);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', env.pixel);
  window.fbq('track', 'PageView');
}

function send(event: string, data: Record<string, unknown>) {
  if (window.nkConsent.analytics && env.ga4) window.gtag('event', event, data);
  if (window.nkConsent.marketing && env.pixel && PIXEL_MAP[event]) {
    const items = (data.items as Item[] | undefined) ?? [];
    const params: Record<string, unknown> = {
      content_type: 'product_group', content_ids: items.map((i) => i.item_id), currency: data.currency ?? 'ZAR',
      value: data.value, contents: items.map((i) => ({ id: i.item_id, quantity: i.quantity ?? 1, item_price: i.price })), num_items: items.reduce((n, i) => n + (i.quantity ?? 1), 0),
    };
    const eventID = data.meta_event_id as string | undefined;
    window.fbq('track', PIXEL_MAP[event], params, eventID ? { eventID } : undefined);
  }
}

window.nkTrack = (event, data = {}) => {
  if (window.nkConsent.analytics || window.nkConsent.marketing) send(event, data);
  else if (queue.length < 20) queue.push([event, data]); // held until (and only if) the visitor consents
};

function apply() {
  const analytics = CookieConsent.acceptedCategory('analytics');
  const marketing = CookieConsent.acceptedCategory('marketing');
  window.nkConsent = { analytics, marketing };
  window.gtag('consent', 'update', {
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_storage: marketing ? 'granted' : 'denied',
    ad_user_data: marketing ? 'granted' : 'denied',
    ad_personalization: marketing ? 'granted' : 'denied',
  });
  if (analytics) loadGA();
  if (marketing) loadPixel();
  if (analytics || marketing) { while (queue.length) { const [e, d] = queue.shift()!; send(e, d); } }
  else queue.length = 0;
  document.dispatchEvent(new CustomEvent('nk:consent', { detail: window.nkConsent }));
}

/** Meta browser identifiers for the cart metadata. Only call when marketing consent is on. */
export function metaIds(): { fbp?: string; fbc?: string } {
  const get = (n: string) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.split('=')[1];
  const fbp = get('_fbp');
  let fbc = get('_fbc');
  if (!fbc) {
    const id = new URLSearchParams(location.search).get('fbclid');
    if (id) fbc = `fb.1.${Date.now()}.${id}`;
  }
  return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) };
}
(window as unknown as { nkMetaIds: typeof metaIds }).nkMetaIds = metaIds;

window.srOpenCookieSettings = () => CookieConsent.showPreferences();
document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest('[data-cookie-settings]')) { e.preventDefault(); CookieConsent.showPreferences(); }
});

CookieConsent.run({
  hideFromBots: false,
  disablePageInteraction: false,
  guiOptions: {
    consentModal: { layout: 'box inline', position: 'bottom left', equalWeightButtons: true, flipButtons: false },
    preferencesModal: { layout: 'box', equalWeightButtons: true },
  },
  categories: {
    necessary: { enabled: true, readOnly: true },
    analytics: { autoClear: { cookies: [{ name: /^_ga/ }, { name: '_gid' }] } },
    marketing: { autoClear: { cookies: [{ name: '_fbp' }, { name: '_fbc' }, { name: /^_gcl/ }] } },
  },
  onConsent: apply,
  onChange: apply,
  language: {
    default: 'en',
    translations: {
      en: {
        consentModal: {
          title: 'A quick word about cookies',
          description: 'We use a few essential cookies to run the shop (your cart, your checkout). With your OK we also use analytics and marketing cookies to see what is working and to show our tees to people who might love them. Your call, and you can change it any time.',
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Essential only',
          showPreferencesBtn: 'Choose',
          footer: `<a href="${u('/legal/cookies')}">Cookie policy</a> &middot; <a href="${u('/legal/privacy')}">Privacy policy</a>`,
        },
        preferencesModal: {
          title: 'Cookie settings',
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Essential only',
          savePreferencesBtn: 'Save my choices',
          closeIconLabel: 'Close',
          sections: [
            { title: 'Your privacy', description: `Pick what you are comfortable with. Essential cookies cannot be switched off because the shop does not work without them. Details are in our <a href="${u('/legal/cookies')}">cookie policy</a>.` },
            { title: 'Essential', description: 'Keeps your cart and checkout working and remembers this choice.', linkedCategory: 'necessary' },
            { title: 'Analytics', description: 'Google Analytics 4 tells us which pages and products people look at, so we can improve the shop. Anonymous and aggregated.', linkedCategory: 'analytics' },
            { title: 'Marketing', description: 'Meta Pixel lets us measure our Facebook ads and show our products to people who visited. Also used for ad measurement through Google.', linkedCategory: 'marketing' },
          ],
        },
      },
    },
  },
});
