export type CurrencyCode = 'USD' | 'KHR';

export type BankCode = 'ABA' | 'ACLEDA' | 'WING' | 'BAKONG';

export interface CambodiaBankOption {
  code: BankCode;
  shortName: string;
  nameKh: string;
  nameEn: string;
  badgeBg: string;
  badgeText: string;
  headerGradient: string;
  accentBorder: string;
  androidPackage: string;
  iosScheme: string;
  playStoreUrl: string;
}

export const CAMBODIA_BANK_OPTIONS: CambodiaBankOption[] = [
  {
    code: 'ABA',
    shortName: 'ABA',
    nameKh: 'ធនាគារ ABA (ABA Mobile)',
    nameEn: 'ABA PAY',
    badgeBg: 'bg-[#003D6B]',
    badgeText: 'text-white',
    headerGradient: 'from-[#003D6B] via-[#005187] to-[#003D6B]',
    accentBorder: 'border-[#E1232E]',
    androidPackage: 'com.paygo24.ibank',
    iosScheme: 'abamobilebank://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.paygo24.ibank',
  },
  {
    code: 'ACLEDA',
    shortName: 'ACLEDA',
    nameKh: 'ធនាគារ អេស៊ីលីដា (ACLEDA Mobile)',
    nameEn: 'ACLEDA Mobile',
    badgeBg: 'bg-[#002B5C]',
    badgeText: 'text-[#FACC15]',
    headerGradient: 'from-[#00224B] via-[#00356B] to-[#001B3A]',
    accentBorder: 'border-[#FACC15]',
    androidPackage: 'com.domain.acledabankqr',
    iosScheme: 'acledamobile://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.domain.acledabankqr',
  },
  {
    code: 'WING',
    shortName: 'WING',
    nameKh: 'ធនាគារ វីង (Wing Bank)',
    nameEn: 'Wing Bank',
    badgeBg: 'bg-[#5B9BD5]',
    badgeText: 'text-white',
    headerGradient: 'from-[#004B8D] via-[#1B6CA8] to-[#3A8E2E]',
    accentBorder: 'border-[#8DC63F]',
    androidPackage: 'com.wingmoney.wingpay',
    iosScheme: 'wingmoney://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.wingmoney.wingpay',
  },
  {
    code: 'BAKONG',
    shortName: 'KHQR',
    nameKh: 'បាគង / គ្រប់ធនាគារ (Canadia, Sathapana...)',
    nameEn: 'Bakong KHQR',
    badgeBg: 'bg-[#E1232E]',
    badgeText: 'text-white',
    headerGradient: 'from-[#8B1118] via-[#B91C24] to-[#6E0D13]',
    accentBorder: 'border-[#FACC15]',
    androidPackage: 'kh.gov.nbc.bakong',
    iosScheme: 'bakong://',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=kh.gov.nbc.bakong',
  },
];

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export type OrderStatus =
  | 'NEW'
  | 'WAITING_PAYMENT'
  | 'PAID'
  | 'PREPARING'
  | 'COMPLETED'
  | 'CANCELLED';

export type CupSizeCode = 'S' | 'M' | 'L';

export interface Category {
  id: string;
  nameKh: string;
  nameEn: string;
  slug: string;
  sortOrder: number;
  createdAt: string;
}

export interface MenuItem {
  id: string;
  nameKh: string;
  nameEn: string;
  categoryId: string;
  priceUsd: number;
  discountPercent: number;
  descriptionKh: string;
  imageUrl: string;
  isAvailable: boolean;
  soldCount: number;
  stockCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  cupSize: CupSizeCode;
  sugarLevel: string;
  iceLevel: string;
  toppings: string[];
  extraPriceUsd: number;
}

export interface OrderLineItem {
  menuItemId: string;
  nameKh: string;
  nameEn: string;
  quantity: number;
  unitPriceUsd: number;
  discountPercent: number;
  discountedUnitPriceUsd: number;
  lineTotalUsd: number;
  cupSize?: CupSizeCode;
  sugarLevel?: string;
  iceLevel?: string;
  toppings?: string[];
  extraPriceUsd?: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  tableOrType: string;
  note: string;
  itemsSummary: string; // JSON-encoded OrderLineItem[]
  totalItemsCount: number;
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  totalKhr: number;
  currency: CurrencyCode;
  paymentMethod: 'ABA_KHQR' | 'KHQR_BAKONG' | 'CASH';
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  khqrMd5: string;
  khqrString: string;
  bakongTransactionId: string;
  createdAt: string;
  paidAt: string;
}

export interface AbaMerchantConfig {
  accountName: string;
  accountNumberUsd: string;
  accountNumberKhr: string;
  bakongAccountId: string;
  customQrImageUrl: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  itemsSummary: string; // JSON-encoded OrderLineItem[]
  subtotalUsd: number;
  discountUsd: number;
  totalUsd: number;
  totalKhr: number;
  paymentMethod: string;
  paymentStatus: string;
  bakongTransactionId: string;
  issuedAt: string;
}

export interface BackupRecord {
  id: string;
  label: string;
  categoriesCount: number;
  menuItemsCount: number;
  ordersCount: number;
  snapshotData: string;
  createdByEmail: string;
  createdAt: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discountPercent: number;
  discountFixedUsd: number;
  minOrderUsd: number;
  descriptionKh: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
}

export interface LoyaltyMember {
  id: string;
  phone: string;
  customerName: string;
  points: number;
  totalSpentUsd: number;
  ordersCount: number;
  updatedAt: string;
}

export interface ExpenseRecord {
  id: string;
  titleKh: string;
  category: string;
  amountUsd: number;
  amountKhr: number;
  expenseDate: string;
  note: string;
  createdAt: string;
}

export const CUP_SIZE_OPTIONS: { code: CupSizeCode; labelKh: string; extraUsd: number }[] = [
  { code: 'S', labelKh: 'កែវតូច (S)', extraUsd: 0 },
  { code: 'M', labelKh: 'កែវកណ្ដាល (M)', extraUsd: 0.35 },
  { code: 'L', labelKh: 'កែវធំ (L)', extraUsd: 0.65 },
];

export const SUGAR_LEVEL_OPTIONS = ['0%', '25%', '50%', '75%', '100%', '120%'];

export const ICE_LEVEL_OPTIONS = [
  'ទឹកកកធម្មតា',
  'ទឹកកកតិច',
  'ទឹកកកដាច់ដោយឡែក',
  'អត់ទឹកកក / ក្ដៅ',
];

export const TOPPING_OPTIONS: { id: string; labelKh: string; priceUsd: number }[] = [
  { id: 'boba', labelKh: 'គុជខ្មៅ (Black Pearl)', priceUsd: 0.4 },
  { id: 'coffee_jelly', labelKh: 'ចាហួយកាហ្វេ (Coffee Jelly)', priceUsd: 0.4 },
  { id: 'cream_cheese', labelKh: 'គ្រីមឈីស (Cream Cheese)', priceUsd: 0.6 },
  { id: 'extra_shot', labelKh: 'បន្ថែមកាហ្វេ ១ ឆត (Extra Shot)', priceUsd: 0.5 },
  { id: 'fresh_milk', labelKh: 'បន្ថែមទឹកដោះគោស្រស់', priceUsd: 0.35 },
];

export const EXCHANGE_RATE_KHR = 4100;

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatKhr(amountUsdOrKhr: number, isAlreadyKhr = false): string {
  const khr = isAlreadyKhr
    ? Math.round(amountUsdOrKhr)
    : Math.round(amountUsdOrKhr * EXCHANGE_RATE_KHR);
  return `${khr.toLocaleString('en-US')} ៛`;
}

export function getDiscountedPrice(priceUsd: number, discountPercent: number): number {
  const validDiscount = Math.max(0, Math.min(100, discountPercent || 0));
  return Number((priceUsd * (1 - validDiscount / 100)).toFixed(2));
}
