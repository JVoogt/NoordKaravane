import { resolveBrandKey, STORE_BRANDS, type BrandKey, type StoreBrand } from './brands';

/** The brand this build was made for (BRAND at build time, inlined by Vite as __BRAND__; plan DD6). Server only. */
export const BRAND: BrandKey = resolveBrandKey(__BRAND__);
export const brand: StoreBrand = STORE_BRANDS[BRAND];
