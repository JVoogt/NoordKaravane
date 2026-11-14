// Kampi brand assets for Base.astro (server). Base imports `@brand` after global.css, so these styles come later in
// the bundle and win over NK's equal-specificity rules (DESIGN.md 5.4: load order is load-bearing).
import './fonts.css';
import './utilities.css';
import './tokens.css';
import m800 from '@fontsource/montserrat/files/montserrat-latin-800-normal.woff2?url';
import m400 from '@fontsource/montserrat/files/montserrat-latin-400-normal.woff2?url';

/** The heads (Kampi Display 400 = Montserrat 800) and body faces: the two the first paint needs. */
export const fontPreloads: string[] = [m800, m400];
