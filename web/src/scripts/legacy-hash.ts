// Home page only. Old single-page anchors (#pricing, #contact, ...) now live on other pages. A hash never reaches
// the server, so the redirect happens here. All mapping logic is in lib/legacy-hash (unit tested).
import { resolveLegacyHash } from '../lib/legacy-hash';

function redirect(): void {
  const t = resolveLegacyHash(location.hash, location.pathname);
  if (t) location.replace(t);
}

redirect();
addEventListener('hashchange', redirect);
