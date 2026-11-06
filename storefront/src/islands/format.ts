export const zar = (n: number | null | undefined) =>
  n == null ? '' : 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: Math.abs(n % 1) < 0.005 ? 0 : 2, maximumFractionDigits: 2 }).replace(/ /g, ' ');
