export interface CurrencyDef {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

/** Default currency catalogue; admins can enable/disable and override rates. */
export const DEFAULT_CURRENCIES: CurrencyDef[] = [
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "Rs", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "AED", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", decimals: 2 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimals: 0 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
];

export const BASE_CURRENCY = "USD";
