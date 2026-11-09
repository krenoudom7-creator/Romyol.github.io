import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  collection,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Category,
  MenuItem,
  Order,
  Invoice,
  BackupRecord,
  PromoCode,
  LoyaltyMember,
  ExpenseRecord,
} from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on application boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat_default_signature',
    nameKh: 'កាហ្វេពិសេសប្រចាំហាង',
    nameEn: 'Signature Coffee',
    slug: 'signature-coffee',
    sortOrder: 1,
    createdAt: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'cat_default_espresso',
    nameKh: 'កាហ្វេក្ដៅ និងអេសប្រេសូ',
    nameEn: 'Hot Espresso & Classics',
    slug: 'espresso-classics',
    sortOrder: 2,
    createdAt: '2026-01-01T08:01:00.000Z',
  },
  {
    id: 'cat_default_tea',
    nameKh: 'ម៉ាត់ឆា និងភេសជ្ជៈមិនមែនកាហ្វេ',
    nameEn: 'Matcha & Artisanal Tea',
    slug: 'matcha-tea',
    sortOrder: 3,
    createdAt: '2026-01-01T08:02:00.000Z',
  },
  {
    id: 'cat_default_bakery',
    nameKh: 'នំដុតថ្មីៗ និងបង្អែម',
    nameEn: 'Artisanal Pastries',
    slug: 'bakery-pastries',
    sortOrder: 4,
    createdAt: '2026-01-01T08:03:00.000Z',
  },
];

export const INITIAL_MENU_ITEMS: MenuItem[] = [
  {
    id: 'item_default_vomyol_iced_latte',
    nameKh: 'កាហ្វេទឹកដោះគោទឹកកក វំយោលពិសេស',
    nameEn: 'Vomyol Signature Iced Condensed Latte',
    categoryId: 'cat_default_signature',
    priceUsd: 2.75,
    discountPercent: 0,
    descriptionKh:
      'កាហ្វេអារ៉ាប៊ីកាលីងថ្មីៗ លាយជាមួយទឹកដោះគោខាប់បែបខ្មែរ និងទឹកដោះគោស្រស់ មានក្លិនឈ្ងុយឆ្ងាញ់ប្លែក។',
    imageUrl: '/src/assets/images/coffee_iced_latte_1794121754785.jpg',
    isAvailable: true,
    soldCount: 48,
    stockCount: 45,
    createdAt: '2026-01-01T08:10:00.000Z',
    updatedAt: '2026-01-01T08:10:00.000Z',
  },
  {
    id: 'item_default_palm_sugar_macchiato',
    nameKh: 'កាហ្វេស្ករត្នោតទឹកកក វំយោល',
    nameEn: 'Kampong Speu Palm Sugar Macchiato',
    categoryId: 'cat_default_signature',
    priceUsd: 3.0,
    discountPercent: 10,
    descriptionKh:
      'រសជាតិផ្អែមស្រទន់នៃស្ករត្នោតធម្មជាតិកំពង់ស្ពឺ គួបផ្សំជាមួយ Double Ristretto និងពពុះទឹកដោះគោទន់ល្មើយ។',
    imageUrl: '/src/assets/images/coffee_iced_latte_1794121754785.jpg',
    isAvailable: true,
    soldCount: 39,
    stockCount: 32,
    createdAt: '2026-01-01T08:11:00.000Z',
    updatedAt: '2026-01-01T08:11:00.000Z',
  },
  {
    id: 'item_default_hot_cappuccino',
    nameKh: 'កាពូឈីណូក្ដៅ (Artisan Cappuccino)',
    nameEn: 'Artisanal Hot Cappuccino',
    categoryId: 'cat_default_espresso',
    priceUsd: 2.5,
    discountPercent: 0,
    descriptionKh:
      'កាហ្វេអេសប្រេសូឆុងក្ដៅៗ ជាមួយពពុះទឹកដោះគោ Microfoam ដ៏ទន់រលោង និងក្បាច់ Latte Art ដ៏ប្រណីត។',
    imageUrl: '/src/assets/images/coffee_hot_cappuccino_1794121755636.jpg',
    isAvailable: true,
    soldCount: 31,
    stockCount: 38,
    createdAt: '2026-01-01T08:12:00.000Z',
    updatedAt: '2026-01-01T08:12:00.000Z',
  },
  {
    id: 'item_default_double_espresso',
    nameKh: 'អេសប្រេសូ ២ ឆត (Double Espresso)',
    nameEn: 'Single-Origin Double Espresso',
    categoryId: 'cat_default_espresso',
    priceUsd: 2.0,
    discountPercent: 0,
    descriptionKh:
      'គ្រាប់កាហ្វេមណ្ឌលគិរី និងអារ៉ាប៊ីកា លីងកម្រិតមធ្យម ផ្ដល់រសជាតិដិត និងស្រទាប់ Crema ពណ៌មាស។',
    imageUrl: '/src/assets/images/hero_vomyol_coffee_1794121753546.jpg',
    isAvailable: true,
    soldCount: 22,
    stockCount: 50,
    createdAt: '2026-01-01T08:13:00.000Z',
    updatedAt: '2026-01-01T08:13:00.000Z',
  },
  {
    id: 'item_default_matcha_latte',
    nameKh: 'ម៉ាត់ឆាឡាតេទឹកកក (Uji Matcha Latte)',
    nameEn: 'Ceremonial Uji Iced Matcha Latte',
    categoryId: 'cat_default_tea',
    priceUsd: 3.25,
    discountPercent: 0,
    descriptionKh:
      'ម្សៅតែបៃតងម៉ាត់ឆាកម្រិត Ceremonial នាំចូលពីជប៉ុន កូរដោយដៃជាមួយទឹកដោះគោស្រស់ត្រជាក់។',
    imageUrl: '/src/assets/images/drink_matcha_latte_1794121757123.jpg',
    isAvailable: true,
    soldCount: 35,
    stockCount: 25,
    createdAt: '2026-01-01T08:14:00.000Z',
    updatedAt: '2026-01-01T08:14:00.000Z',
  },
  {
    id: 'item_default_butter_croissant',
    nameKh: 'នំក្រូសង់ប៊ឺរស្រួយ (French Butter Croissant)',
    nameEn: 'Artisanal French Butter Croissant',
    categoryId: 'cat_default_bakery',
    priceUsd: 2.25,
    discountPercent: 0,
    descriptionKh:
      'នំក្រូសង់ដុតថ្មីៗរៀងរាល់ព្រឹក ប្រើប៊ឺរសុទ្ធពីបារាំង សំបកស្រួយពណ៌មាស និងសាច់ក្នុងទន់ឈ្ងុយ។',
    imageUrl: '/src/assets/images/pastry_croissant_1794121756948.jpg',
    isAvailable: true,
    soldCount: 27,
    stockCount: 18,
    createdAt: '2026-01-01T08:15:00.000Z',
    updatedAt: '2026-01-01T08:15:00.000Z',
  },
];

export const INITIAL_PROMO_CODES: PromoCode[] = [
  {
    id: 'promo_vomyol10',
    code: 'VOMYOL10',
    discountPercent: 10,
    discountFixedUsd: 0,
    minOrderUsd: 2.0,
    descriptionKh: 'បញ្ចុះតម្លៃ 10% សម្រាប់រាល់ការកម្មង់ចាប់ពី $2.00 ឡើងទៅ',
    isActive: true,
    usageCount: 12,
    createdAt: '2026-01-01T08:20:00.000Z',
  },
  {
    id: 'promo_welcome20',
    code: 'WELCOME20',
    discountPercent: 20,
    discountFixedUsd: 0,
    minOrderUsd: 5.0,
    descriptionKh: 'បញ្ចុះតម្លៃ 20% សម្រាប់អតិថិជនកម្មង់ចាប់ពី $5.00',
    isActive: true,
    usageCount: 5,
    createdAt: '2026-01-01T08:21:00.000Z',
  },
  {
    id: 'promo_coffee50',
    code: 'COFFEE50',
    discountPercent: 0,
    discountFixedUsd: 0.5,
    minOrderUsd: 2.5,
    descriptionKh: 'បញ្ចុះតម្លៃ $0.50 ភ្លាមៗសម្រាប់ការកម្មង់ភេសជ្ជៈចាប់ពី $2.50',
    isActive: true,
    usageCount: 8,
    createdAt: '2026-01-01T08:22:00.000Z',
  },
];

let seedingPromise: Promise<void> | null = null;

/**
 * Ensures initial categories, menu items, and promo codes are stored in Firestore if database is empty.
 */
export async function ensureInitialDatabaseSeeded(): Promise<void> {
  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    try {
      const catSnap = await getDocs(collection(db, 'categories'));
      if (catSnap.empty) {
        for (const cat of INITIAL_CATEGORIES) {
          const { id, ...data } = cat;
          await setDoc(doc(db, 'categories', id), data);
        }
      }

      const menuSnap = await getDocs(collection(db, 'menuItems'));
      if (menuSnap.empty) {
        for (const item of INITIAL_MENU_ITEMS) {
          const { id, ...data } = item;
          await setDoc(doc(db, 'menuItems', id), data);
        }
      }

      const promoSnap = await getDocs(collection(db, 'promoCodes'));
      if (promoSnap.empty) {
        for (const promo of INITIAL_PROMO_CODES) {
          const { id, ...data } = promo;
          await setDoc(doc(db, 'promoCodes', id), data);
        }
      }
    } catch (error) {
      console.warn('Initial database check completed or skipped:', error);
    }
  })();

  return seedingPromise;
}

// ============================================================================
// CRUD Operations for Categories, MenuItems, Orders, Invoices, Backups,
// PromoCodes, LoyaltyMembers, and Expenses
// ============================================================================

export async function saveCategoryToDb(category: Category, isUpdate = false): Promise<void> {
  const path = `categories/${category.id}`;
  try {
    const payload = {
      nameKh: category.nameKh.trim().slice(0, 100),
      nameEn: category.nameEn.trim().slice(0, 100),
      slug: category.slug.trim().slice(0, 60),
      sortOrder: Number(category.sortOrder) || 0,
      createdAt: category.createdAt,
    };
    await setDoc(doc(db, 'categories', category.id), payload);
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCategoryFromDb(categoryId: string): Promise<void> {
  const path = `categories/${categoryId}`;
  try {
    await deleteDoc(doc(db, 'categories', categoryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveMenuItemToDb(item: MenuItem, isUpdate = false): Promise<void> {
  const path = `menuItems/${item.id}`;
  try {
    const stockVal =
      item.stockCount !== undefined ? Math.max(0, Number(item.stockCount)) : 40;
    const payload = {
      nameKh: item.nameKh.trim().slice(0, 120),
      nameEn: item.nameEn.trim().slice(0, 120),
      categoryId: item.categoryId.trim().slice(0, 64),
      priceUsd: Math.max(0, Number(item.priceUsd) || 0),
      discountPercent: Math.max(0, Math.min(100, Number(item.discountPercent) || 0)),
      descriptionKh: (item.descriptionKh || '').trim().slice(0, 500),
      imageUrl: (item.imageUrl || '').trim().slice(0, 800000),
      isAvailable: Boolean(item.isAvailable) && stockVal > 0,
      soldCount: Math.max(0, Number(item.soldCount) || 0),
      stockCount: stockVal,
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'menuItems', item.id), payload);
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteMenuItemFromDb(itemId: string): Promise<void> {
  const path = `menuItems/${itemId}`;
  try {
    await deleteDoc(doc(db, 'menuItems', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createOrderInDb(order: Order): Promise<void> {
  const path = `orders/${order.id}`;
  try {
    const { id, ...payload } = order;
    await setDoc(doc(db, 'orders', id), {
      ...payload,
      orderNumber: payload.orderNumber.slice(0, 40),
      invoiceNumber: payload.invoiceNumber.slice(0, 40),
      customerName: payload.customerName.slice(0, 100),
      customerPhone: payload.customerPhone.slice(0, 40),
      tableOrType: payload.tableOrType.slice(0, 60),
      note: payload.note.slice(0, 400),
      itemsSummary: payload.itemsSummary.slice(0, 4000),
      khqrMd5: payload.khqrMd5.slice(0, 64),
      khqrString: payload.khqrString.slice(0, 600),
      bakongTransactionId: payload.bakongTransactionId.slice(0, 100),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateOrderPaymentVerifiedInDb(params: {
  order: Order;
  paymentStatus: Order['paymentStatus'];
  orderStatus: Order['orderStatus'];
  bakongTransactionId: string;
  paidAt: string;
}): Promise<void> {
  const path = `orders/${params.order.id}`;
  try {
    await updateDoc(doc(db, 'orders', params.order.id), {
      paymentStatus: params.paymentStatus,
      orderStatus: params.orderStatus,
      bakongTransactionId: params.bakongTransactionId.slice(0, 100),
      paidAt: params.paidAt.slice(0, 60),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateOrderStatusByAdminInDb(
  order: Order,
  newOrderStatus: Order['orderStatus'],
  newPaymentStatus?: Order['paymentStatus']
): Promise<void> {
  const path = `orders/${order.id}`;
  try {
    const { id, ...rest } = order;
    await setDoc(doc(db, 'orders', id), {
      ...rest,
      orderStatus: newOrderStatus,
      paymentStatus: newPaymentStatus || order.paymentStatus,
      paidAt:
        newPaymentStatus === 'PAID' && !order.paidAt ? new Date().toISOString() : order.paidAt,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createInvoiceInDb(invoice: Invoice): Promise<void> {
  const path = `invoices/${invoice.id}`;
  try {
    const { id, ...payload } = invoice;
    await setDoc(doc(db, 'invoices', id), {
      ...payload,
      invoiceNumber: payload.invoiceNumber.slice(0, 40),
      orderId: payload.orderId.slice(0, 64),
      orderNumber: payload.orderNumber.slice(0, 40),
      customerName: payload.customerName.slice(0, 100),
      itemsSummary: payload.itemsSummary.slice(0, 4000),
      paymentMethod: payload.paymentMethod.slice(0, 40),
      paymentStatus: payload.paymentStatus.slice(0, 40),
      bakongTransactionId: payload.bakongTransactionId.slice(0, 100),
      issuedAt: payload.issuedAt.slice(0, 60),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function incrementMenuItemsSoldCount(
  items: { menuItemId: string; quantity: number }[]
): Promise<void> {
  for (const line of items) {
    try {
      const ref = doc(db, 'menuItems', line.menuItemId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as Omit<MenuItem, 'id'>;
        const currentStock = data.stockCount !== undefined ? data.stockCount : 40;
        const nextStock = Math.max(0, currentStock - line.quantity);
        await updateDoc(ref, {
          soldCount: increment(line.quantity),
          stockCount: nextStock,
          isAvailable: nextStock > 0 ? data.isAvailable : false,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Non-fatal if item was deleted
    }
  }
}

export async function savePromoCodeToDb(promo: PromoCode, isUpdate = false): Promise<void> {
  const path = `promoCodes/${promo.id}`;
  try {
    const payload = {
      code: promo.code.trim().toUpperCase().slice(0, 40),
      discountPercent: Math.max(0, Math.min(100, Number(promo.discountPercent) || 0)),
      discountFixedUsd: Math.max(0, Number(promo.discountFixedUsd) || 0),
      minOrderUsd: Math.max(0, Number(promo.minOrderUsd) || 0),
      descriptionKh: (promo.descriptionKh || '').trim().slice(0, 200),
      isActive: Boolean(promo.isActive),
      usageCount: Math.max(0, Number(promo.usageCount) || 0),
      createdAt: promo.createdAt,
    };
    await setDoc(doc(db, 'promoCodes', promo.id), payload);
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deletePromoCodeFromDb(promoId: string): Promise<void> {
  const path = `promoCodes/${promoId}`;
  try {
    await deleteDoc(doc(db, 'promoCodes', promoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function incrementPromoCodeUsageInDb(promoId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'promoCodes', promoId), {
      usageCount: increment(1),
    });
  } catch {
    // Non-fatal
  }
}

export async function upsertLoyaltyMemberInDb(params: {
  phone: string;
  customerName: string;
  pointsDelta: number;
  spentUsdDelta: number;
}): Promise<void> {
  const cleanPhone = params.phone.replace(/[^0-9+]/g, '').slice(0, 30);
  if (cleanPhone.length < 6) return;
  const docId = `mem_${cleanPhone.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const path = `loyaltyMembers/${docId}`;
  try {
    const ref = doc(db, 'loyaltyMembers', docId);
    const snap = await getDoc(ref);
    const now = new Date().toISOString();
    if (snap.exists()) {
      const existing = snap.data() as Omit<LoyaltyMember, 'id'>;
      const nextPoints = Math.max(0, (existing.points || 0) + params.pointsDelta);
      await setDoc(ref, {
        phone: cleanPhone,
        customerName: (params.customerName || existing.customerName || 'អតិថិជន').slice(0, 100),
        points: nextPoints,
        totalSpentUsd: Number(((existing.totalSpentUsd || 0) + params.spentUsdDelta).toFixed(2)),
        ordersCount: (existing.ordersCount || 0) + (params.spentUsdDelta > 0 ? 1 : 0),
        updatedAt: now,
      });
    } else {
      await setDoc(ref, {
        phone: cleanPhone,
        customerName: (params.customerName || 'អតិថិជន').slice(0, 100),
        points: Math.max(0, params.pointsDelta),
        totalSpentUsd: Number(Math.max(0, params.spentUsdDelta).toFixed(2)),
        ordersCount: params.spentUsdDelta > 0 ? 1 : 0,
        updatedAt: now,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveExpenseToDb(expense: ExpenseRecord, isUpdate = false): Promise<void> {
  const path = `expenses/${expense.id}`;
  try {
    const payload = {
      titleKh: expense.titleKh.trim().slice(0, 140),
      category: expense.category.trim().slice(0, 60),
      amountUsd: Math.max(0, Number(expense.amountUsd) || 0),
      amountKhr: Math.max(0, Math.round(Number(expense.amountKhr) || 0)),
      expenseDate: expense.expenseDate.slice(0, 30),
      note: (expense.note || '').trim().slice(0, 300),
      createdAt: expense.createdAt,
    };
    await setDoc(doc(db, 'expenses', expense.id), payload);
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteExpenseFromDb(expenseId: string): Promise<void> {
  const path = `expenses/${expenseId}`;
  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createBackupSnapshotInDb(params: {
  label: string;
  categories: Category[];
  menuItems: MenuItem[];
  orders: Order[];
  invoices: Invoice[];
  createdByEmail: string;
}): Promise<BackupRecord> {
  const backupId = `bkp_${Date.now()}`;
  const path = `backups/${backupId}`;
  const snapshotObj = {
    version: '1.1',
    exportedAt: new Date().toISOString(),
    categories: params.categories,
    menuItems: params.menuItems,
    orders: params.orders.slice(0, 100),
    invoices: params.invoices.slice(0, 100),
  };
  const snapshotData = JSON.stringify(snapshotObj).slice(0, 490000);
  const record: BackupRecord = {
    id: backupId,
    label: params.label.trim().slice(0, 120),
    categoriesCount: params.categories.length,
    menuItemsCount: params.menuItems.length,
    ordersCount: params.orders.length,
    snapshotData,
    createdByEmail: params.createdByEmail.slice(0, 120),
    createdAt: new Date().toISOString(),
  };

  try {
    const { id, ...payload } = record;
    await setDoc(doc(db, 'backups', id), payload);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function restoreDatabaseFromSnapshot(snapshotJson: string): Promise<{
  categoriesRestored: number;
  menuItemsRestored: number;
}> {
  const parsed = JSON.parse(snapshotJson);
  const categories: Category[] = Array.isArray(parsed.categories) ? parsed.categories : [];
  const menuItems: MenuItem[] = Array.isArray(parsed.menuItems) ? parsed.menuItems : [];

  for (const cat of categories) {
    if (cat && cat.id && cat.nameKh) {
      await saveCategoryToDb(cat, true);
    }
  }
  for (const item of menuItems) {
    if (item && item.id && item.nameKh) {
      await saveMenuItemToDb(item, true);
    }
  }

  return {
    categoriesRestored: categories.length,
    menuItemsRestored: menuItems.length,
  };
}
