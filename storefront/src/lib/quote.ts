// Quote-only products (big freight: roof-top tents, awnings, large batteries...). They cannot be ordered at the
// standard checkout because courier prices are not weight-banded for them. Flag: product.metadata.freight_quote.
export const quoteLines = <T extends { product_handle?: string | null }>(items: readonly T[], handles: Iterable<string>): T[] => {
  const set = new Set(handles);
  return items.filter((i) => !!i.product_handle && set.has(i.product_handle));
};

/** Contact-form link prefilled for a quote request. `contactPath` is the shop URL of the contact page. */
export const quoteHref = (contactPath: string, titles: readonly string[]): string =>
  `${contactPath}?topic=quote&product=${encodeURIComponent(titles.join(' | ').slice(0, 200))}`;

export const quoteMessage = (product: string): string =>
  `Hi, I would like a quote, including delivery, for: ${product}`;
