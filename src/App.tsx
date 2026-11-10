/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  FileText,
  Clock,
  CheckCircle2,
  QrCode,
  Coffee,
  Utensils,
  Store,
  Lock,
  Receipt,
  Tag,
  Award,
  Sparkles,
  Smartphone,
  Printer,
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  db,
  INITIAL_CATEGORIES,
  INITIAL_MENU_ITEMS,
  INITIAL_PROMO_CODES,
  ensureInitialDatabaseSeeded,
  createOrderInDb,
  updateOrderPaymentVerifiedInDb,
  createInvoiceInDb,
  incrementMenuItemsSoldCount,
  incrementPromoCodeUsageInDb,
  upsertLoyaltyMemberInDb,
} from './lib/firebase';
import {
  Category,
  MenuItem,
  CartItem,
  CupSizeCode,
  Order,
  OrderLineItem,
  Invoice,
  BackupRecord,
  PromoCode,
  LoyaltyMember,
  ExpenseRecord,
  CurrencyCode,
  BankCode,
  CAMBODIA_BANK_OPTIONS,
  EXCHANGE_RATE_KHR,
  formatUsd,
  formatKhr,
  getDiscountedPrice,
} from './types';
import { ProductImage } from './components/ProductImage';
import { KhqrPaymentModal } from './components/KhqrPaymentModal';
import { InvoiceModal } from './components/InvoiceModal';
import { DrinkCustomizationModal } from './components/DrinkCustomizationModal';
import { AdminDashboard } from './components/AdminDashboard';
import { playOrderNotificationSound } from './lib/soundAndExport';
import { generateClientSideAbaKhqrFallback } from './lib/clientKhqrFallback';

const ROMDOUL_LOGO_URL = '/src/assets/images/romdoul_caffee_logo_1794272922476.jpg';

const HERO_SLIDES = [
  {
    titleKh: 'កាហ្វេពិសេស រំដួលកាហ្វេ (Romdoul Caffee)',
    subtitleKh: 'ក្លិនឈ្ងុយ ផ្អែមល្មម ឆុងថ្មីៗប្រចាំថ្ងៃតាមស្តង់ដារវិជ្ជាជីវៈ',
    imageUrl: '/src/assets/images/coffee_hot_cappuccino_1794121755636.jpg',
  },
  {
    titleKh: 'តែបៃតង & ម៉ាត់ឆាឡាតេ រំដួលកាហ្វេ',
    subtitleKh: 'ក្លិនឈ្ងុយ ផ្អែមល្មម ត្រជាក់ស្រួល',
    imageUrl: '/src/assets/images/drink_matcha_latte_1794121757123.jpg',
  },
  {
    titleKh: 'កាហ្វេទឹកដោះគោទឹកកក រំដួលពិសេស',
    subtitleKh: 'រសជាតិដិតឈ្ងុយ លាយទឹកដោះគោស្រស់ និងស្ករត្នោតធម្មជាតិ',
    imageUrl: '/src/assets/images/coffee_iced_latte_1794121754785.jpg',
  },
  {
    titleKh: 'នំក្រូសង់ប៊ឺរដុតថ្មីៗប្រចាំថ្ងៃ',
    subtitleKh: 'សំបកស្រួយពណ៌មាស សាច់ក្នុងទន់ឈ្ងុយ ពិសាជាមួយកាហ្វេក្ដៅៗ',
    imageUrl: '/src/assets/images/pastry_croissant_1794121756948.jpg',
  },
];

export default function App() {
  const [activeView, setActiveView] = useState<'storefront' | 'orders' | 'invoices' | 'admin'>(
    'storefront'
  );

  // Persistent Admin session state across view tabs
  const [adminJwtToken, setAdminJwtToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<{
    username: string;
    passwordHashPreview: string;
  } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Real-time Firestore collections
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(INITIAL_MENU_ITEMS);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>(INITIAL_PROMO_CODES);
  const [loyaltyMembers, setLoyaltyMembers] = useState<LoyaltyMember[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loadingDb, setLoadingDb] = useState<boolean>(false);

  // Hero Carousel & Storefront Filters
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const [mainSectionTab, setMainSectionTab] = useState<'drinks' | 'food'>('drinks');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Drink Customization Modal State
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);

  // Shopping Cart, Promo, Loyalty & Table QR State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [tableOrType, setTableOrType] = useState<string>('ញ៉ាំក្នុងហាង · តុលេខ ០១');
  const [qrScannedTable, setQrScannedTable] = useState<string | null>(null);
  const [orderNote, setOrderNote] = useState<string>('');
  const [promoInput, setPromoInput] = useState<string>('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [promoFeedback, setPromoFeedback] = useState<string>('');
  const [redeemLoyaltyReward, setRedeemLoyaltyReward] = useState<boolean>(false);
  const [selectedCheckoutBank, setSelectedCheckoutBank] = useState<BankCode>('ABA');
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);

  // Active ABA / ACLEDA / Wing / Bakong KHQR Payment Session & Invoice Modal
  const [activeKhqrSession, setActiveKhqrSession] = useState<{
    order: Order;
    qrDataUrl: string;
    staticQrDataUrl?: string;
    dynamicQrDataUrl?: string;
    abaDeepLink?: string;
    bakongDeepLink?: string;
    abaPaywayLink?: string;
    autoTriggerAbaDeepLink?: boolean;
    initialBank?: BankCode;
    expiresAt: string;
    merchantName: string;
    merchantAccount: string;
    abaAccountUsd?: string;
    abaAccountKhr?: string;
    liveTokenConfigured: boolean;
  } | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [customerPaidNotification, setCustomerPaidNotification] = useState<{
    orderNumber: string;
    customerName: string;
    tableOrType: string;
    totalUsd: number;
    totalKhr: number;
    paymentMethod: string;
  } | null>(null);

  const seenInvoiceIdsRef = useRef<Set<string>>(new Set());
  const initialInvoicesLoadedRef = useRef<boolean>(false);
  const adminJwtTokenRef = useRef<string | null>(null);
  useEffect(() => {
    adminJwtTokenRef.current = adminJwtToken;
  }, [adminJwtToken]);

  const [publicOrderSearch, setPublicOrderSearch] = useState<string>('');
  const [publicInvoiceSearch, setPublicInvoiceSearch] = useState<string>('');

  // Detect ?table=XX QR Code parameter on boot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tbl = params.get('table');
    if (tbl) {
      const cleanTbl = tbl.padStart(2, '0').slice(0, 10);
      setQrScannedTable(cleanTbl);
      setTableOrType(`ញ៉ាំក្នុងហាង · តុលេខ ${cleanTbl}`);
    }
  }, []);

  // Live Clock & Hero Banner Auto-Rotation
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    const slideTimer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 5500);
    return () => {
      clearInterval(clockTimer);
      clearInterval(slideTimer);
    };
  }, []);

  // Seed initial database if empty & subscribe to real-time Firestore collections
  useEffect(() => {
    let unsubCategories: (() => void) | undefined;
    let unsubMenu: (() => void) | undefined;
    let unsubOrders: (() => void) | undefined;
    let unsubInvoices: (() => void) | undefined;
    let unsubBackups: (() => void) | undefined;
    let unsubPromos: (() => void) | undefined;
    let unsubLoyalty: (() => void) | undefined;
    let unsubExpenses: (() => void) | undefined;

    const init = async () => {
      await ensureInitialDatabaseSeeded();

      unsubCategories = onSnapshot(
        query(collection(db, 'categories'), orderBy('sortOrder', 'asc')),
        (snap) => {
          if (!snap.empty) {
            const list: Category[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Category, 'id'>),
            }));
            setCategories(list);
          }
        },
        (err) => {
          console.warn('Categories listener warning:', err);
        }
      );

      unsubMenu = onSnapshot(
        collection(db, 'menuItems'),
        (snap) => {
          if (!snap.empty) {
            const list: MenuItem[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<MenuItem, 'id'>),
            }));
            list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            setMenuItems(list);
          }
          setLoadingDb(false);
        },
        (err) => {
          console.warn('MenuItems listener warning:', err);
          setLoadingDb(false);
        }
      );

      unsubOrders = onSnapshot(
        collection(db, 'orders'),
        (snap) => {
          const list: Order[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Order, 'id'>),
          }));
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setOrders(list);
        },
        (err) => {
          console.warn('Orders listener warning:', err);
        }
      );

      unsubInvoices = onSnapshot(
        collection(db, 'invoices'),
        (snap) => {
          const list: Invoice[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Invoice, 'id'>),
          }));
          list.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
          setInvoices(list);

          if (!initialInvoicesLoadedRef.current) {
            list.forEach((inv) => seenInvoiceIdsRef.current.add(inv.id));
            initialInvoicesLoadedRef.current = true;
          } else {
            for (const inv of list) {
              if (!seenInvoiceIdsRef.current.has(inv.id)) {
                seenInvoiceIdsRef.current.add(inv.id);
                // Only pop up the receipt (បុង) automatically if Admin is logged in!
                if (adminJwtTokenRef.current) {
                  setSelectedInvoice(inv);
                }
              }
            }
          }
        },
        (err) => {
          console.warn('Invoices listener warning:', err);
        }
      );

      unsubBackups = onSnapshot(
        collection(db, 'backups'),
        (snap) => {
          const list: BackupRecord[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<BackupRecord, 'id'>),
          }));
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setBackups(list);
        },
        () => {}
      );

      unsubPromos = onSnapshot(
        collection(db, 'promoCodes'),
        (snap) => {
          if (!snap.empty) {
            const list: PromoCode[] = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<PromoCode, 'id'>),
            }));
            setPromoCodes(list);
          }
        },
        () => {}
      );

      unsubLoyalty = onSnapshot(
        collection(db, 'loyaltyMembers'),
        (snap) => {
          const list: LoyaltyMember[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<LoyaltyMember, 'id'>),
          }));
          list.sort((a, b) => b.points - a.points);
          setLoyaltyMembers(list);
        },
        () => {}
      );

      unsubExpenses = onSnapshot(
        collection(db, 'expenses'),
        (snap) => {
          const list: ExpenseRecord[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ExpenseRecord, 'id'>),
          }));
          list.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
          setExpenses(list);
        },
        () => {}
      );
    };

    init();

    return () => {
      if (unsubCategories) unsubCategories();
      if (unsubMenu) unsubMenu();
      if (unsubOrders) unsubOrders();
      if (unsubInvoices) unsubInvoices();
      if (unsubBackups) unsubBackups();
      if (unsubPromos) unsubPromos();
      if (unsubLoyalty) unsubLoyalty();
      if (unsubExpenses) unsubExpenses();
    };
  }, []);

  // Filtered storefront menu items
  const visibleMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (selectedCategoryId !== 'ALL' && item.categoryId !== selectedCategoryId) {
        return false;
      }
      if (selectedCategoryId === 'ALL') {
        const isBakeryItem = item.categoryId === 'cat_default_bakery';
        if (
          mainSectionTab === 'food' &&
          !isBakeryItem &&
          menuItems.some((m) => m.categoryId === 'cat_default_bakery')
        ) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchKh = item.nameKh.toLowerCase().includes(q);
        const matchEn = item.nameEn.toLowerCase().includes(q);
        const matchDesc = item.descriptionKh.toLowerCase().includes(q);
        if (!matchKh && !matchEn && !matchDesc) return false;
      }
      return true;
    });
  }, [menuItems, selectedCategoryId, mainSectionTab, searchQuery]);

  // Customer Loyalty lookup by phone number
  const activeLoyaltyMember = useMemo(() => {
    const clean = customerPhone.replace(/[^0-9+]/g, '');
    if (clean.length < 6) return null;
    return loyaltyMembers.find((m) => m.phone === clean) || null;
  }, [customerPhone, loyaltyMembers]);

  // Confirm adding customized drink or pastry to Cart
  const handleConfirmAddToCart = (params: {
    item: MenuItem;
    quantity: number;
    cupSize: CupSizeCode;
    sugarLevel: string;
    iceLevel: string;
    toppings: string[];
    extraPriceUsd: number;
  }) => {
    if (!params.item.isAvailable) return;
    setCart((prev) => {
      const toppingsKey = [...params.toppings].sort().join('|');
      const existingIndex = prev.findIndex(
        (c) =>
          c.menuItem.id === params.item.id &&
          c.cupSize === params.cupSize &&
          c.sugarLevel === params.sugarLevel &&
          c.iceLevel === params.iceLevel &&
          [...c.toppings].sort().join('|') === toppingsKey
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + params.quantity,
        };
        return updated;
      }
      return [
        ...prev,
        {
          menuItem: params.item,
          quantity: params.quantity,
          cupSize: params.cupSize,
          sugarLevel: params.sugarLevel,
          iceLevel: params.iceLevel,
          toppings: params.toppings,
          extraPriceUsd: params.extraPriceUsd,
        },
      ];
    });
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const nextQty = updated[index].quantity + delta;
      if (nextQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index] = { ...updated[index], quantity: nextQty };
      }
      return updated;
    });
  };

  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Automatic Cart Totals Calculation (including Cup Size, Toppings, Promo Code & Loyalty Reward)
  const cartSummary = useMemo(() => {
    let totalItemsCount = 0;
    let subtotalUsd = 0;
    let itemDiscountUsd = 0;
    let afterItemDiscountUsd = 0;

    for (const c of cart) {
      const rawUnit = c.menuItem.priceUsd + (c.extraPriceUsd || 0);
      const discountedBase = getDiscountedPrice(
        c.menuItem.priceUsd,
        c.menuItem.discountPercent
      );
      const finalUnit = discountedBase + (c.extraPriceUsd || 0);

      totalItemsCount += c.quantity;
      subtotalUsd += rawUnit * c.quantity;
      itemDiscountUsd += (rawUnit - finalUnit) * c.quantity;
      afterItemDiscountUsd += finalUnit * c.quantity;
    }

    // Promo Code discount
    let promoDiscountUsd = 0;
    if (appliedPromo && appliedPromo.isActive && afterItemDiscountUsd >= appliedPromo.minOrderUsd) {
      if (appliedPromo.discountPercent > 0) {
        promoDiscountUsd = afterItemDiscountUsd * (appliedPromo.discountPercent / 100);
      } else if (appliedPromo.discountFixedUsd > 0) {
        promoDiscountUsd = appliedPromo.discountFixedUsd;
      }
    }

    // Customer Loyalty Redemption (10 points = $2.50 off)
    let loyaltyDiscountUsd = 0;
    if (redeemLoyaltyReward && activeLoyaltyMember && activeLoyaltyMember.points >= 10) {
      loyaltyDiscountUsd = Math.min(2.5, Math.max(0, afterItemDiscountUsd - promoDiscountUsd));
    }

    const totalDiscountUsd = Number(
      (itemDiscountUsd + promoDiscountUsd + loyaltyDiscountUsd).toFixed(2)
    );
    subtotalUsd = Number(subtotalUsd.toFixed(2));
    const totalUsd = Number(
      Math.max(0.1, subtotalUsd - totalDiscountUsd).toFixed(2)
    );
    const totalKhr = Math.round(totalUsd * EXCHANGE_RATE_KHR);

    return {
      totalItemsCount,
      subtotalUsd,
      discountUsd: totalDiscountUsd,
      promoDiscountUsd: Number(promoDiscountUsd.toFixed(2)),
      loyaltyDiscountUsd: Number(loyaltyDiscountUsd.toFixed(2)),
      totalUsd: cart.length === 0 ? 0 : totalUsd,
      totalKhr: cart.length === 0 ? 0 : totalKhr,
    };
  }, [cart, appliedPromo, redeemLoyaltyReward, activeLoyaltyMember]);

  const handleApplyPromoCode = (codeToApply?: string) => {
    const target = (codeToApply ?? promoInput).trim().toUpperCase();
    if (!target) return;
    const found = promoCodes.find((p) => p.code.toUpperCase() === target && p.isActive);
    if (!found) {
      setPromoFeedback('កូដបញ្ចុះតម្លៃមិនត្រឹមត្រូវ ឬផុតកំណត់។');
      setAppliedPromo(null);
      return;
    }
    if (cartSummary.subtotalUsd < found.minOrderUsd) {
      setPromoFeedback(
        `កូដ ${found.code} តម្រូវឱ្យកម្មង់ចាប់ពី ${formatUsd(found.minOrderUsd)} ឡើងទៅ។`
      );
      setAppliedPromo(null);
      return;
    }
    setAppliedPromo(found);
    setPromoInput(found.code);
    setPromoFeedback(
      `បានអនុវត្តកូដ ${found.code} (${
        found.discountPercent > 0
          ? `បញ្ចុះ ${found.discountPercent}%`
          : `បញ្ចុះ ${formatUsd(found.discountFixedUsd)}`
      })!`
    );
  };

  const formatDisplayPrice = (usdAmount: number) => {
    return currency === 'USD' ? formatUsd(usdAmount) : formatKhr(usdAmount);
  };

  // Checkout & Generate Official KHQR + ABA Deep Link via Backend
  const handleInitiateKhqrPayment = async (
    e?: React.FormEvent,
    autoOpenAbaMobile: boolean = false
  ) => {
    if (e) e.preventDefault();
    if (cart.length === 0 || submittingOrder) return;

    setSubmittingOrder(true);
    try {
      const dateStamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `VMC-${dateStamp}-${randomSuffix}`;
      const invoiceNumber = `INV-${dateStamp}-${randomSuffix}`;

      let khqrData: any = null;
      try {
        const khqrRes = await fetch('/api/khqr/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNumber,
            amountUsd: cartSummary.totalUsd,
            amountKhr: cartSummary.totalKhr,
            currency,
            originUrl: window.location.origin,
          }),
        });
        if (khqrRes.ok) {
          khqrData = await khqrRes.json();
        }
      } catch {
        // Fallback below for static hosts (e.g. GitHub Pages)
      }

      if (!khqrData) {
        khqrData = await generateClientSideAbaKhqrFallback({
          orderNumber,
          amountUsd: cartSummary.totalUsd,
          amountKhr: cartSummary.totalKhr,
          currency,
        });
      }

      const lineItems: OrderLineItem[] = cart.map((c) => {
        const baseDiscounted = getDiscountedPrice(
          c.menuItem.priceUsd,
          c.menuItem.discountPercent
        );
        const discountedUnitPriceUsd = Number(
          (baseDiscounted + (c.extraPriceUsd || 0)).toFixed(2)
        );
        return {
          menuItemId: c.menuItem.id,
          nameKh: c.menuItem.nameKh,
          nameEn: c.menuItem.nameEn,
          quantity: c.quantity,
          unitPriceUsd: Number((c.menuItem.priceUsd + (c.extraPriceUsd || 0)).toFixed(2)),
          discountPercent: c.menuItem.discountPercent,
          discountedUnitPriceUsd,
          lineTotalUsd: Number((discountedUnitPriceUsd * c.quantity).toFixed(2)),
          cupSize: c.cupSize,
          sugarLevel: c.sugarLevel,
          iceLevel: c.iceLevel,
          toppings: c.toppings,
          extraPriceUsd: c.extraPriceUsd,
        };
      });

      const noteParts = [
        orderNote.trim(),
        `[Bank: ${selectedCheckoutBank}]`,
        appliedPromo ? `[Promo: ${appliedPromo.code}]` : '',
        redeemLoyaltyReward ? '[Loyalty -10 pts]' : '',
      ].filter(Boolean);

      const newOrder: Order = {
        id: `ord_${Date.now()}_${randomSuffix}`,
        orderNumber,
        invoiceNumber,
        customerName: customerName.trim() || 'អតិថិជនទូទៅ',
        customerPhone: customerPhone.trim(),
        tableOrType: tableOrType.trim() || 'ញ៉ាំក្នុងហាង',
        note: noteParts.join(' · '),
        itemsSummary: JSON.stringify(lineItems),
        totalItemsCount: cartSummary.totalItemsCount,
        subtotalUsd: cartSummary.subtotalUsd,
        discountUsd: cartSummary.discountUsd,
        totalUsd: cartSummary.totalUsd,
        totalKhr: cartSummary.totalKhr,
        currency,
        paymentMethod: selectedCheckoutBank === 'ABA' ? 'ABA_KHQR' : 'KHQR_BAKONG',
        paymentStatus: 'PENDING',
        orderStatus: 'WAITING_PAYMENT',
        khqrMd5: khqrData.md5,
        khqrString: khqrData.khqrString,
        bakongTransactionId: '',
        createdAt: new Date().toISOString(),
        paidAt: '',
      };

      await createOrderInDb(newOrder);

      setIsCartOpen(false);
      setActiveKhqrSession({
        order: newOrder,
        qrDataUrl: khqrData.qrDataUrl,
        staticQrDataUrl: khqrData.staticQrDataUrl,
        dynamicQrDataUrl: khqrData.dynamicQrDataUrl,
        abaDeepLink: khqrData.abaDeepLink,
        bakongDeepLink: khqrData.bakongDeepLink,
        abaPaywayLink: khqrData.abaPaywayLink,
        autoTriggerAbaDeepLink: autoOpenAbaMobile,
        initialBank: selectedCheckoutBank,
        expiresAt: khqrData.expiresAt,
        merchantName: khqrData.merchantName,
        merchantAccount: khqrData.merchantAccount,
        abaAccountUsd: khqrData.abaAccountUsd,
        abaAccountKhr: khqrData.abaAccountKhr,
        liveTokenConfigured: Boolean(khqrData.liveTokenConfigured),
      });
    } catch (error) {
      console.error('Failed to initiate KHQR checkout:', error);
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Callback when Backend verifies KHQR Bakong transaction
  const handlePaymentVerified = useCallback(
    async (bakongTransactionId: string, paidAt: string) => {
      if (!activeKhqrSession) return;
      const { order } = activeKhqrSession;

      if (soundEnabled) {
        playOrderNotificationSound();
      }

      await updateOrderPaymentVerifiedInDb({
        order,
        paymentStatus: 'PAID',
        orderStatus: 'PAID',
        bakongTransactionId,
        paidAt,
      });

      let parsedLines: OrderLineItem[] = [];
      try {
        parsedLines = JSON.parse(order.itemsSummary);
        await incrementMenuItemsSoldCount(
          parsedLines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity }))
        );
      } catch {
        // Non-fatal
      }

      // Update Promo Code usage count if applied
      if (appliedPromo) {
        await incrementPromoCodeUsageInDb(appliedPromo.id);
      }

      // Update Customer Loyalty Points if phone number provided
      if (order.customerPhone && order.customerPhone.trim().length >= 6) {
        const earnedPoints = order.totalItemsCount;
        const redeemedPoints = redeemLoyaltyReward ? -10 : 0;
        await upsertLoyaltyMemberInDb({
          phone: order.customerPhone,
          customerName: order.customerName,
          pointsDelta: earnedPoints + redeemedPoints,
          spentUsdDelta: order.totalUsd,
        });
      }

      // Dispatch Telegram Bot Notification automatically
      try {
        const itemsText = parsedLines
          .map(
            (l) =>
              `• ${l.nameKh}${l.cupSize ? ` (${l.cupSize})` : ''} x${l.quantity}${
                l.sugarLevel ? ` [ស្ករ ${l.sugarLevel}]` : ''
              }${l.toppings && l.toppings.length > 0 ? ` [+${l.toppings.join(', ')}]` : ''}`
          )
          .join('\n');

        fetch('/api/notifications/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNumber: order.orderNumber,
            invoiceNumber: order.invoiceNumber,
            customerName: order.customerName,
            tableOrType: order.tableOrType,
            totalUsd: order.totalUsd,
            totalKhr: order.totalKhr,
            itemsText,
            bakongTransactionId,
          }),
        }).catch(() => {});
      } catch {
        // Non-fatal
      }

      const resolvedPaymentMethodLabel = bakongTransactionId.startsWith('ACLEDA')
        ? 'ACLEDA Mobile (KHQR)'
        : bakongTransactionId.startsWith('WING')
        ? 'Wing Bank (KHQR)'
        : bakongTransactionId.startsWith('BAKONG')
        ? 'Bakong KHQR'
        : 'ABA PAY (ABA KHQR)';

      const generatedInvoice: Invoice = {
        id: `inv_${order.id}`,
        invoiceNumber: order.invoiceNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        itemsSummary: order.itemsSummary,
        subtotalUsd: order.subtotalUsd,
        discountUsd: order.discountUsd,
        totalUsd: order.totalUsd,
        totalKhr: order.totalKhr,
        paymentMethod: resolvedPaymentMethodLabel,
        paymentStatus: 'PAID',
        bakongTransactionId,
        issuedAt: paidAt || new Date().toISOString(),
      };
      seenInvoiceIdsRef.current.add(generatedInvoice.id);
      await createInvoiceInDb(generatedInvoice);

      setCart([]);
      setOrderNote('');
      setAppliedPromo(null);
      setPromoInput('');
      setPromoFeedback('');
      setRedeemLoyaltyReward(false);
      setActiveKhqrSession(null);

      // Do NOT pop up the receipt (បុង) for the customer!
      // Only pop up the receipt if Admin is authenticated.
      if (adminJwtToken) {
        setSelectedInvoice(generatedInvoice);
      } else {
        setCustomerPaidNotification({
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          tableOrType: order.tableOrType,
          totalUsd: order.totalUsd,
          totalKhr: order.totalKhr,
          paymentMethod: resolvedPaymentMethodLabel,
        });
      }
    },
    [activeKhqrSession, appliedPromo, redeemLoyaltyReward, soundEnabled, adminJwtToken]
  );

  const handleCancelActiveOrder = useCallback(async () => {
    if (!activeKhqrSession) return;
    await updateOrderPaymentVerifiedInDb({
      order: activeKhqrSession.order,
      paymentStatus: 'CANCELLED',
      orderStatus: 'CANCELLED',
      bakongTransactionId: '',
      paidAt: '',
    });
    setActiveKhqrSession(null);
  }, [activeKhqrSession]);

  const handleResumeKhqrForOrder = async (order: Order) => {
    let khqrData: any = null;
    try {
      const khqrRes = await fetch('/api/khqr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: order.orderNumber,
          amountUsd: order.totalUsd,
          amountKhr: order.totalKhr,
          currency: order.currency,
          originUrl: window.location.origin,
        }),
      });
      if (khqrRes.ok) {
        khqrData = await khqrRes.json();
      }
    } catch {
      // Fallback below for static hosts
    }
    if (!khqrData) {
      khqrData = await generateClientSideAbaKhqrFallback({
        orderNumber: order.orderNumber,
        amountUsd: order.totalUsd,
        amountKhr: order.totalKhr,
        currency: order.currency,
      });
    }
    setActiveKhqrSession({
      order: { ...order, khqrMd5: khqrData.md5, khqrString: khqrData.khqrString },
      qrDataUrl: khqrData.qrDataUrl,
      staticQrDataUrl: khqrData.staticQrDataUrl,
      dynamicQrDataUrl: khqrData.dynamicQrDataUrl,
      abaDeepLink: khqrData.abaDeepLink,
      bakongDeepLink: khqrData.bakongDeepLink,
      abaPaywayLink: khqrData.abaPaywayLink,
      autoTriggerAbaDeepLink: false,
      expiresAt: khqrData.expiresAt,
      merchantName: khqrData.merchantName,
      merchantAccount: khqrData.merchantAccount,
      abaAccountUsd: khqrData.abaAccountUsd,
      abaAccountKhr: khqrData.abaAccountKhr,
      liveTokenConfigured: Boolean(khqrData.liveTokenConfigured),
    });
  };

  const currentHero = HERO_SLIDES[activeSlide];
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const formattedDate = currentTime.toLocaleDateString('en-GB');

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14] text-[#F3F4F6]">
      {/* =====================================================================
          TOP NAVIGATION BAR (Romdoul Caffee + Full RGB Neon Lighting)
         ===================================================================== */}
      <header className="sticky top-0 z-30 bg-[#090C11]/95 backdrop-blur-md">
        <div className="rgb-line" />
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4 px-4 sm:px-8 py-3">
          {/* Left Brand Emblem & Name */}
          <a
            href="#storefront"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('storefront');
            }}
            className="flex items-center gap-3 shrink-0 group"
          >
            <div className="rgb-logo-ring rounded-full flex items-center justify-center shrink-0">
              <ProductImage
                src={ROMDOUL_LOGO_URL}
                alt="Romdoul Caffee Logo"
                className="w-11 h-11 rounded-full object-cover bg-[#0B0E14]"
              />
            </div>
            <div>
              <div className="text-lg sm:text-xl font-extrabold tracking-tight rgb-text leading-none">
                រំដួលកាហ្វេ
              </div>
              <div className="text-[10px] font-extrabold tracking-[0.18em] text-[#FACC15] uppercase mt-1">
                ROMDOUL CAFFEE
              </div>
            </div>
          </a>

          {/* Center Navigation Buttons with RGB Pills */}
          <nav className="hidden lg:flex items-center gap-3">
            <button
              onClick={() => setActiveView('storefront')}
              className={`px-4 py-2 text-xs font-bold rounded-full transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeView === 'storefront'
                  ? 'bg-[#FACC15] text-[#0B0E14] shadow-[0_0_20px_rgba(250,204,21,0.45)]'
                  : 'rgb-pill text-slate-200 hover:text-white'
              }`}
            >
              <Store
                className={`w-4 h-4 ${
                  activeView === 'storefront' ? 'text-[#0B0E14]' : 'text-[#FACC15]'
                }`}
              />
              <span>ហាងទំនិញ (POS)</span>
            </button>

            <button
              onClick={() => setActiveView('admin')}
              className={`px-4 py-2 text-xs font-bold rounded-full transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeView === 'admin'
                  ? 'bg-[#FACC15] text-[#0B0E14] shadow-[0_0_20px_rgba(250,204,21,0.45)]'
                  : 'rgb-pill text-[#FACC15] hover:text-white'
              }`}
            >
              <span>ប្រព័ន្ធគ្រប់គ្រង (Admin)</span>
              <Lock className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setActiveView('orders')}
              className={`px-4 py-2 text-xs font-bold rounded-full transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeView === 'orders'
                  ? 'bg-[#FACC15] text-[#0B0E14] shadow-[0_0_20px_rgba(250,204,21,0.45)]'
                  : 'rgb-pill text-[#FACC15] hover:text-white'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>ការកម្មង់ខ្ញុំ ({orders.length})</span>
            </button>

            {adminJwtToken && (
              <button
                onClick={() => setActiveView('invoices')}
                className={`px-4 py-2 text-xs font-bold rounded-full transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  activeView === 'invoices'
                    ? 'bg-[#FACC15] text-[#0B0E14] shadow-[0_0_20px_rgba(250,204,21,0.45)]'
                    : 'rgb-pill text-slate-200 hover:text-white'
                }`}
              >
                <Printer
                  className={`w-3.5 h-3.5 ${
                    activeView === 'invoices' ? 'text-[#0B0E14]' : 'text-[#FACC15]'
                  }`}
                />
                <span>ព្រីនបុង ({invoices.length})</span>
              </button>
            )}
          </nav>

          {/* Right Cart, Admin & Live Clock */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Cart Button with Flowing RGB Frame & Counter Badge */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative rgb-frame rounded-full hover:brightness-110 transition-all"
            >
              <div className="px-4 py-2 rounded-full bg-[#11151F] flex items-center gap-2 text-xs font-bold text-[#FACC15]">
                <ShoppingBag className="w-4 h-4 text-[#FACC15]" />
                <span>កន្ត្រក</span>
                {cartSummary.totalUsd > 0 && (
                  <span className="tabular-nums text-white">
                    · {formatDisplayPrice(cartSummary.totalUsd)}
                  </span>
                )}
              </div>
              <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-[#FACC15] text-[#0B0E14] text-[11px] font-extrabold flex items-center justify-center tabular-nums shadow-md">
                {cartSummary.totalItemsCount}
              </span>
            </button>

            <button
              onClick={() => setActiveView('admin')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 rgb-pill rounded-full hover:text-[#FACC15] transition-colors whitespace-nowrap"
            >
              <span>{adminJwtToken ? `Admin (${adminUser?.username})` : 'ចូលគណនី Admin'}</span>
            </button>

            {/* Live Clock & Date */}
            <div className="hidden xl:flex flex-col items-end pl-3 border-l border-[#222938] text-right">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-white tabular-nums">
                <Clock className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>{formattedTime}</span>
              </div>
              <div className="text-[11px] text-slate-400 tabular-nums">
                ថ្ងៃនេះ: {formattedDate}
              </div>
            </div>
          </div>
        </div>

        {/* Flowing Animated RGB Laser Strip */}
        <div className="rgb-line" />
      </header>

      {/* Mobile Navigation Bar with RGB Pills */}
      <div className="lg:hidden flex items-center justify-around bg-[#0E121A] px-2 py-2 text-xs font-bold">
        <button
          onClick={() => setActiveView('storefront')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
            activeView === 'storefront'
              ? 'bg-[#FACC15] text-[#0B0E14]'
              : 'rgb-pill text-slate-200'
          }`}
        >
          ហាងទំនិញ (POS)
        </button>
        <button
          onClick={() => setActiveView('orders')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
            activeView === 'orders'
              ? 'bg-[#FACC15] text-[#0B0E14]'
              : 'rgb-pill text-slate-200'
          }`}
        >
          ការកម្មង់ ({orders.length})
        </button>
        {adminJwtToken && (
          <button
            onClick={() => setActiveView('invoices')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
              activeView === 'invoices'
                ? 'bg-[#FACC15] text-[#0B0E14]'
                : 'rgb-pill text-slate-200'
            }`}
          >
            ព្រីនបុង
          </button>
        )}
        <button
          onClick={() => setActiveView('admin')}
          className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
            activeView === 'admin'
              ? 'bg-[#FACC15] text-[#0B0E14]'
              : 'rgb-pill text-slate-200'
          }`}
        >
          Admin
        </button>
      </div>
      <div className="lg:hidden rgb-line" />

      {/* =====================================================================
          MAIN WORKSPACE CONTENT
         ===================================================================== */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-8 py-6">
        {/* Customer Payment Completed Banner (No Receipt Popup for Customer) */}
        {customerPaidNotification && (
          <div className="mb-6 rgb-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm sm:text-base font-extrabold text-[#FACC15]">
                  ការបង់ប្រាក់ជោគជ័យ! សូមអរគុណសម្រាប់ការកម្មង់ពី «រំដួលកាហ្វេ»
                </div>
                <p className="text-xs text-slate-200 mt-1">
                  លេខកម្មង់៖ <strong className="text-white tabular-nums">{customerPaidNotification.orderNumber}</strong> ·{' '}
                  <span>{customerPaidNotification.customerName} ({customerPaidNotification.tableOrType})</span> ·{' '}
                  <strong className="text-emerald-400 tabular-nums">
                    {formatUsd(customerPaidNotification.totalUsd)} ({formatKhr(customerPaidNotification.totalKhr, true)})
                  </strong>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  ការកម្មង់របស់អ្នកត្រូវបានបញ្ជូនទៅកាន់ផ្នែកឆុងភេសជ្ជៈរួចរាល់ហើយ (ការបោះពុម្ពបុង/វិក្កយបត្រគឺសម្រាប់តែ Admin ប៉ុណ្ណោះ)។
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setActiveView('orders');
                  setCustomerPaidNotification(null);
                }}
                className="px-3.5 py-2 text-xs font-extrabold bg-[#FACC15] text-[#0B0E14] rounded-xl hover:brightness-105 transition-all whitespace-nowrap"
              >
                តាមដានស្ថានភាពភេសជ្ជៈ
              </button>
              <button
                onClick={() => setCustomerPaidNotification(null)}
                className="p-2 text-slate-400 hover:text-white rounded-lg"
                aria-label="បិទ"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: CUSTOMER STOREFRONT & ONLINE ORDERING */}
        {activeView === 'storefront' && (
          <div className="space-y-6">
            {/* Active QR Table Banner if scanned via ?table=XX */}
            {qrScannedTable && (
              <div className="rgb-card rounded-2xl px-5 py-3 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <QrCode className="w-5 h-5 text-[#FACC15] shrink-0" />
                  <div>
                    <span className="font-extrabold text-[#FACC15]">
                      ប្រព័ន្ធកម្មង់តាម QR ប្រចាំតុ៖ តុលេខ {qrScannedTable}
                    </span>
                    <span className="text-emerald-200 ml-2">
                      (ភេសជ្ជៈរបស់អ្នកនឹងត្រូវរៀបចំជូនទៅកាន់តុលេខ {qrScannedTable} ដោយស្វ័យប្រវត្តិ)
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setQrScannedTable(null)}
                  className="text-slate-300 hover:text-white underline"
                >
                  ប្ដូរតុ
                </button>
              </div>
            )}

            {/* 1. Flowing RGB Neon Border Hero Banner Carousel */}
            <section className="rgb-frame rounded-2xl">
              <div className="relative h-[230px] sm:h-[290px] w-full rounded-[14px] overflow-hidden bg-[#12161F]">
                <ProductImage
                  src={currentHero.imageUrl}
                  alt={currentHero.titleKh}
                  className="w-full h-full object-cover object-center brightness-75 transition-all duration-500"
                />
                {/* Measured Dark Gradient Scrim for Contrast */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/30 flex flex-col justify-center px-6 sm:px-12">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="rgb-logo-ring rounded-full shrink-0">
                      <ProductImage
                        src={ROMDOUL_LOGO_URL}
                        alt="Romdoul Caffee Logo"
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover bg-[#0B0E14]"
                      />
                    </div>
                    <span className="px-3 py-1 rounded-full rgb-pill text-[11px] font-extrabold text-[#FACC15] tracking-wider uppercase">
                      ROMDOUL CAFFEE · រំដួលកាហ្វេ
                    </span>
                  </div>
                  <h1 className="text-2xl sm:text-4xl font-extrabold text-[#FACC15] drop-shadow-md">
                    {currentHero.titleKh}
                  </h1>
                  <p className="text-sm sm:text-lg text-white/95 font-medium mt-2 max-w-xl drop-shadow-xs">
                    {currentHero.subtitleKh}
                  </p>
                </div>

                {/* Carousel Slide Dots */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                  {HERO_SLIDES.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSlide(idx)}
                      aria-label={`Slide ${idx + 1}`}
                      className={`h-2.5 rounded-full transition-all ${
                        activeSlide === idx
                          ? 'w-7 bg-[#FACC15]'
                          : 'w-2.5 bg-white/45 hover:bg-white/75'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </section>

            {/* 2. Two Large Segmented Action Tabs with RGB Borders (ភេសជ្ជៈ vs ម្ហូបអាហារ & នំដុត) */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setMainSectionTab('drinks');
                  setSelectedCategoryId('ALL');
                }}
                className={`py-4 px-6 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all ${
                  mainSectionTab === 'drinks'
                    ? 'bg-gradient-to-r from-[#FACC15] to-[#F59E0B] text-[#0B0E14] shadow-[0_0_25px_rgba(250,204,21,0.35)]'
                    : 'rgb-card text-[#FACC15]'
                }`}
              >
                <Coffee className="w-5 h-5" />
                <span>ភេសជ្ជៈ (Drinks & Coffee)</span>
              </button>

              <button
                onClick={() => {
                  setMainSectionTab('food');
                  const bakeryCat = categories.find((c) => c.id === 'cat_default_bakery');
                  setSelectedCategoryId(bakeryCat ? bakeryCat.id : 'ALL');
                }}
                className={`py-4 px-6 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all ${
                  mainSectionTab === 'food'
                    ? 'bg-gradient-to-r from-[#FACC15] to-[#F59E0B] text-[#0B0E14] shadow-[0_0_25px_rgba(250,204,21,0.35)]'
                    : 'rgb-card text-[#FACC15]'
                }`}
              >
                <Utensils className="w-5 h-5" />
                <span>ម្ហូបអាហារ & នំដុត (Bakery & Food)</span>
              </button>
            </section>

            {/* 3. Storefront Title Bar, Category Filter Pills & Search Box with RGB Frame */}
            <section className="rgb-card rounded-2xl px-5 py-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 text-lg sm:text-xl font-extrabold text-[#FACC15]">
                  <ProductImage
                    src={ROMDOUL_LOGO_URL}
                    alt="Romdoul Caffee"
                    className="w-7 h-7 rounded-full object-cover border border-[#FACC15]"
                  />
                  <span className="rgb-text">កម្មង់ទំនិញ រំដួលកាហ្វេ (Romdoul Caffee)</span>
                </div>
                <p className="text-xs text-slate-400">
                  ចុចលើភេសជ្ជៈដើម្បីជ្រើសរើសទំហំកែវ កម្រិតជាតិស្ករ ទឹកកក និង Toppings តាមចំណូលចិត្ត
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Category Filter Buttons */}
                <button
                  onClick={() => {
                    setMainSectionTab('drinks');
                    setSelectedCategoryId('ALL');
                  }}
                  className={`px-4 py-2 text-xs font-extrabold rounded-full transition-all whitespace-nowrap shrink-0 ${
                    selectedCategoryId === 'ALL'
                      ? 'bg-[#FACC15] text-[#0B0E14] shadow-[0_0_15px_rgba(250,204,21,0.35)]'
                      : 'rgb-pill text-slate-200 hover:text-white'
                  }`}
                >
                  ទាំងអស់
                </button>

                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-4 py-2 text-xs font-bold rounded-full transition-all whitespace-nowrap shrink-0 ${
                      selectedCategoryId === cat.id
                        ? 'bg-[#FACC15] text-[#0B0E14] shadow-[0_0_15px_rgba(250,204,21,0.35)]'
                        : 'rgb-pill text-slate-200 hover:text-white'
                    }`}
                  >
                    {cat.nameKh}
                  </button>
                ))}

                {/* Currency Switcher (USD / KHR) */}
                <div className="flex items-center rgb-pill rounded-full p-0.5">
                  <button
                    onClick={() => setCurrency('USD')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors tabular-nums ${
                      currency === 'USD' ? 'bg-[#FACC15] text-[#0B0E14]' : 'text-slate-300'
                    }`}
                  >
                    USD ($)
                  </button>
                  <button
                    onClick={() => setCurrency('KHR')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors tabular-nums ${
                      currency === 'KHR' ? 'bg-[#FACC15] text-[#0B0E14]' : 'text-slate-300'
                    }`}
                  >
                    KHR (៛)
                  </button>
                </div>

                {/* Dark Search Input with RGB Border */}
                <div className="relative flex-1 sm:w-52">
                  <Search className="w-4 h-4 text-[#FACC15] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ស្វែងរកមុខម្ហូប..."
                    className="w-full pl-9 pr-3 py-2 text-xs rgb-card-dark text-white rounded-lg focus:outline-none"
                  />
                </div>
              </div>
            </section>

            {/* 4. 4-Column Product Grid with Animated RGB Neon Borders on Every Card */}
            {loadingDb ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="rgb-card rounded-2xl h-80 animate-pulse"
                  />
                ))}
              </div>
            ) : visibleMenuItems.length === 0 ? (
              <div className="rgb-card rounded-2xl p-12 text-center space-y-2">
                <div className="text-base font-bold text-[#FACC15]">
                  រកមិនឃើញមុខម្ហូបដែលអ្នកកំពុងស្វែងរកនោះទេ
                </div>
                <p className="text-xs text-slate-400">
                  សូមសាកល្បងស្វែងរកពាក្យផ្សេង ឬជ្រើសរើសប្រភេទមុខម្ហូប «ទាំងអស់»។
                </p>
              </div>
            ) : (
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {visibleMenuItems.map((item) => {
                  const finalUsd = getDiscountedPrice(item.priceUsd, item.discountPercent);
                  const qtyInCart = cart
                    .filter((c) => c.menuItem.id === item.id)
                    .reduce((s, c) => s + c.quantity, 0);
                  const stockVal = item.stockCount !== undefined ? item.stockCount : 40;
                  const canOrder = item.isAvailable && stockVal > 0;

                  return (
                    <article
                      key={item.id}
                      onClick={() => {
                        if (canOrder) setCustomizingItem(item);
                      }}
                      className={`group rgb-card rounded-2xl p-3.5 flex flex-col justify-between transition-all duration-150 ${
                        canOrder
                          ? 'cursor-pointer hover:-translate-y-1'
                          : 'opacity-75 cursor-not-allowed'
                      }`}
                    >
                      <div>
                        {/* Product Photo */}
                        <div className="aspect-16/10 w-full rounded-xl overflow-hidden bg-[#0E121A] relative">
                          <ProductImage
                            src={item.imageUrl}
                            alt={item.nameKh}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>

                        {/* Title + Stock Status Row */}
                        <div className="mt-3.5 flex items-start justify-between gap-2">
                          <h3 className="text-sm font-bold text-white leading-snug">
                            {item.nameEn} ({item.nameKh})
                          </h3>

                          {canOrder ? (
                            <span
                              className={`px-2 py-0.5 text-[11px] font-bold rounded-md text-white whitespace-nowrap shrink-0 tabular-nums ${
                                stockVal <= 5 ? 'bg-amber-600/90' : 'bg-emerald-600/90'
                              }`}
                            >
                              ស្តុក: {stockVal}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-red-600/90 text-white whitespace-nowrap shrink-0">
                              អស់ស្តុក
                            </span>
                          )}
                        </div>

                        <p className="mt-1.5 text-xs text-slate-400 line-clamp-2">
                          {item.descriptionKh}
                        </p>
                      </div>

                      {/* Bottom Price & Customize/Order Button */}
                      <div className="mt-4 pt-3 border-t border-[#1F2634] flex items-center justify-between gap-2">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`text-lg font-extrabold tabular-nums ${
                                canOrder ? 'text-[#FACC15]' : 'text-[#FACC15]/60'
                              }`}
                            >
                              {formatDisplayPrice(finalUsd)}
                            </span>
                            {item.discountPercent > 0 && (
                              <span className="text-xs text-slate-500 line-through tabular-nums">
                                {formatDisplayPrice(item.priceUsd)}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            {currency === 'USD' ? formatKhr(finalUsd) : formatUsd(finalUsd)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canOrder) setCustomizingItem(item);
                          }}
                          disabled={!canOrder}
                          className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all whitespace-nowrap shrink-0 inline-flex items-center gap-1 ${
                            canOrder
                              ? 'bg-[#FACC15] text-[#0B0E14] hover:bg-[#F59E0B]'
                              : 'bg-[#1F2634] text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>
                            {qtyInCart > 0
                              ? `ក្នុងកន្ត្រក (${qtyInCart})`
                              : canOrder
                              ? 'ជ្រើសរើសរសជាតិ'
                              : 'អស់ស្តុក'}
                          </span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
        )}

        {/* VIEW 2: LIVE ORDER TRACKING */}
        {activeView === 'orders' && (
          <div className="space-y-6">
            <div className="rgb-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold rgb-text">
                  តាមដានស្ថានភាពការកម្មង់ ({orders.length})
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  ពិនិត្យស្ថានភាពភេសជ្ជៈដែលបានកម្មង់ និងការផ្ទៀងផ្ទាត់ការបង់ប្រាក់ KHQR
                </p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-[#FACC15] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={publicOrderSearch}
                  onChange={(e) => setPublicOrderSearch(e.target.value)}
                  placeholder="ស្វែងរកលេខការកម្មង់ ឬឈ្មោះ..."
                  className="pl-9 pr-4 py-2 text-xs rgb-card-dark text-white rounded-xl w-64"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {orders
                .filter((o) => {
                  if (!publicOrderSearch.trim()) return true;
                  const q = publicOrderSearch.toLowerCase();
                  return (
                    o.orderNumber.toLowerCase().includes(q) ||
                    o.invoiceNumber.toLowerCase().includes(q) ||
                    o.customerName.toLowerCase().includes(q)
                  );
                })
                .map((order) => {
                  let lines: OrderLineItem[] = [];
                  try {
                    lines = JSON.parse(order.itemsSummary);
                  } catch {
                    lines = [];
                  }
                  const linkedInvoice = invoices.find((inv) => inv.orderId === order.id);

                  return (
                    <div
                      key={order.id}
                      className="rgb-card rounded-2xl p-6 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-400 pb-3 border-b border-[#222938]">
                          <span className="font-bold text-[#FACC15] tabular-nums">
                            {order.orderNumber}
                          </span>
                          <span className="tabular-nums">
                            {new Date(order.createdAt).toLocaleString('km-KH')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="text-slate-400">អតិថិជន៖ </span>
                            <span className="font-semibold text-white">
                              {order.customerName} ({order.tableOrType})
                            </span>
                          </div>
                          <div className="font-semibold">
                            {order.paymentStatus === 'PAID' ? (
                              <span className="text-emerald-400 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                បានបង់ប្រាក់រួចរាល់
                              </span>
                            ) : order.paymentStatus === 'PENDING' ? (
                              <span className="text-amber-400 inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                កំពុងរង់ចាំការទូទាត់
                              </span>
                            ) : (
                              <span className="text-red-400">{order.paymentStatus}</span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          {lines.map((line, i) => (
                            <div
                              key={i}
                              className="flex items-start justify-between text-xs text-slate-200 gap-2"
                            >
                              <div>
                                <span>
                                  {line.nameKh} {line.cupSize ? `(${line.cupSize})` : ''}{' '}
                                  <strong className="tabular-nums text-[#FACC15]">
                                    x{line.quantity}
                                  </strong>
                                </span>
                                <div className="text-[11px] text-slate-400">
                                  {line.sugarLevel ? `ស្ករ ${line.sugarLevel}` : ''}
                                  {line.iceLevel ? ` · ${line.iceLevel}` : ''}
                                  {line.toppings && line.toppings.length > 0
                                    ? ` · +${line.toppings.join(', ')}`
                                    : ''}
                                </div>
                              </div>
                              <span className="tabular-nums font-medium shrink-0">
                                {formatUsd(line.lineTotalUsd)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-[#222938] flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-extrabold text-[#FACC15] tabular-nums">
                            សរុប៖ {formatUsd(order.totalUsd)} ({formatKhr(order.totalKhr, true)})
                          </div>
                          <div className="text-xs text-slate-400">
                            ស្ថានភាពភេសជ្ជៈ៖{' '}
                            <strong className="text-white">
                              {order.orderStatus === 'WAITING_PAYMENT' && 'រង់ចាំបង់ប្រាក់'}
                              {order.orderStatus === 'PAID' && 'បានបង់ប្រាក់រួច · រង់ចាំឆុង'}
                              {order.orderStatus === 'PREPARING' && 'កំពុងរៀបចំភេសជ្ជៈ'}
                              {order.orderStatus === 'COMPLETED' && 'រួចរាល់សម្រាប់ទទួល'}
                              {order.orderStatus === 'CANCELLED' && 'បានបោះបង់'}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {order.paymentStatus === 'PENDING' && (
                            <button
                              onClick={() => handleResumeKhqrForOrder(order)}
                              className="rgb-pill px-3.5 py-2 text-xs font-bold text-white rounded-xl hover:brightness-110 transition-colors inline-flex items-center gap-1.5"
                            >
                              <QrCode className="w-3.5 h-3.5 text-[#FACC15]" />
                              <span>បង្ហាញ ABA / ACLEDA KHQR</span>
                            </button>
                          )}
                          {/* Only Admin can pop up and print the receipt (បុង) */}
                          {adminJwtToken && linkedInvoice && (
                            <button
                              onClick={() => setSelectedInvoice(linkedInvoice)}
                              className="px-3.5 py-2 text-xs font-bold text-[#0B0E14] bg-[#FACC15] rounded-xl hover:brightness-105 transition-all inline-flex items-center gap-1.5"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>ព្រីនបុង (Admin)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* VIEW 3: INVOICES ARCHIVE (ADMIN ONLY) */}
        {activeView === 'invoices' && (
          adminJwtToken ? (
            <div className="rgb-card rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold rgb-text">
                    ប្រព័ន្ធព្រីនបុង និងវិក្កយបត្រផ្លូវការ · សម្រាប់តែ Admin ({invoices.length})
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    មានតែគណនី Admin ប៉ុណ្ណោះដែលអាចបើកមើល និងបោះពុម្ពបុង (វិក្កយបត្រ) ជូនអតិថិជនបាន
                  </p>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-[#FACC15] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={publicInvoiceSearch}
                    onChange={(e) => setPublicInvoiceSearch(e.target.value)}
                    placeholder="ស្វែងរកលេខវិក្កយបត្រ..."
                    className="pl-9 pr-4 py-2 text-xs rgb-card-dark text-white rounded-xl w-64"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {invoices
                  .filter((inv) => {
                    if (!publicInvoiceSearch.trim()) return true;
                    const q = publicInvoiceSearch.toLowerCase();
                    return (
                      inv.invoiceNumber.toLowerCase().includes(q) ||
                      inv.orderNumber.toLowerCase().includes(q) ||
                      inv.customerName.toLowerCase().includes(q)
                    );
                  })
                  .map((inv) => (
                    <div
                      key={inv.id}
                      className="rgb-card-dark rounded-xl p-5 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-1.5">
                        <div className="text-xs text-slate-400 tabular-nums">
                          {new Date(inv.issuedAt).toLocaleString('km-KH')}
                        </div>
                        <div className="text-base font-bold text-white tabular-nums">
                          {inv.invoiceNumber}
                        </div>
                        <div className="text-xs text-slate-400">
                          អតិថិជន៖ <strong className="text-white">{inv.customerName}</strong> ·
                          កម្មង់៖ <span className="tabular-nums">{inv.orderNumber}</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#222938] flex items-center justify-between">
                        <div>
                          <div className="text-sm font-extrabold text-[#FACC15] tabular-nums">
                            {formatUsd(inv.totalUsd)}
                          </div>
                          <div className="text-xs text-slate-400 tabular-nums">
                            {formatKhr(inv.totalKhr, true)}
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="px-3.5 py-2 text-xs font-bold text-[#0B0E14] bg-[#FACC15] rounded-xl hover:brightness-105 transition-all inline-flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>ព្រីនបុង / PDF</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <AdminDashboard
              categories={categories}
              menuItems={menuItems}
              orders={orders}
              invoices={invoices}
              backups={backups}
              promoCodes={promoCodes}
              loyaltyMembers={loyaltyMembers}
              expenses={expenses}
              onSelectInvoice={(inv) => setSelectedInvoice(inv)}
              jwtToken={adminJwtToken}
              setJwtToken={setAdminJwtToken}
              adminUser={adminUser}
              setAdminUser={setAdminUser}
              soundEnabled={soundEnabled}
              setSoundEnabled={setSoundEnabled}
            />
          )
        )}

        {/* VIEW 4: SECURE ADMIN MANAGEMENT PORTAL */}
        {activeView === 'admin' && (
          <AdminDashboard
            categories={categories}
            menuItems={menuItems}
            orders={orders}
            invoices={invoices}
            backups={backups}
            promoCodes={promoCodes}
            loyaltyMembers={loyaltyMembers}
            expenses={expenses}
            onSelectInvoice={(inv) => setSelectedInvoice(inv)}
            jwtToken={adminJwtToken}
            setJwtToken={setAdminJwtToken}
            adminUser={adminUser}
            setAdminUser={setAdminUser}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
          />
        )}
      </main>

      {/* =====================================================================
          DRINK CUSTOMIZATION MODAL (Cup Size, Sugar, Ice, Toppings)
         ===================================================================== */}
      <DrinkCustomizationModal
        item={customizingItem}
        currency={currency}
        onClose={() => setCustomizingItem(null)}
        onConfirmAddToCart={handleConfirmAddToCart}
      />

      {/* =====================================================================
          SLIDE-OVER SHOPPING CART, PROMO CODE, LOYALTY & KHQR CHECKOUT DRAWER
         ===================================================================== */}
      {isCartOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md rgb-modal text-white h-[100dvh] flex flex-col justify-between">
            {/* Cart Drawer Header */}
            <div className="shrink-0 px-4 py-3.5 bg-[#0B0E14] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ProductImage
                  src={ROMDOUL_LOGO_URL}
                  alt="Romdoul Caffee"
                  className="w-9 h-9 rounded-full object-cover border border-[#FACC15]"
                />
                <div>
                  <h2 className="text-base font-bold text-[#FACC15]">
                    កន្ត្រកកម្មង់ភេសជ្ជៈ ({cartSummary.totalItemsCount})
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    រំដួលកាហ្វេ (Romdoul Caffee) · គណនាតម្លៃសរុបស្វ័យប្រវត្តិ
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
                aria-label="បិទកន្ត្រក"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rgb-line shrink-0" />

            {/* Cart Items, Promo Code & Customer Loyalty Form */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <ShoppingBag className="w-10 h-10 text-[#FACC15] mx-auto opacity-85" />
                  <div className="text-sm font-bold text-white">កន្ត្រកកម្មង់របស់អ្នកនៅទំនេរ</div>
                  <p className="text-xs text-slate-400">
                    សូមជ្រើសរើសមុខម្ហូប ឬភេសជ្ជៈពីក្នុងបញ្ជីមុខម្ហូបជាមុនសិន។
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-[#222938]">
                    {cart.map((c, idx) => {
                      const baseDiscounted = getDiscountedPrice(
                        c.menuItem.priceUsd,
                        c.menuItem.discountPercent
                      );
                      const unitDiscounted = Number(
                        (baseDiscounted + (c.extraPriceUsd || 0)).toFixed(2)
                      );
                      return (
                        <div key={`${c.menuItem.id}-${idx}`} className="py-2.5 flex gap-3">
                          <ProductImage
                            src={c.menuItem.imageUrl}
                            alt={c.menuItem.nameKh}
                            className="w-14 h-14 rounded-lg object-cover shrink-0 border border-[#262E3D]"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-xs font-bold text-white truncate">
                                {c.menuItem.nameKh} {c.cupSize ? `(${c.cupSize})` : ''}
                              </h4>
                              <button
                                onClick={() => handleRemoveFromCart(idx)}
                                className="text-slate-400 hover:text-red-400 p-0.5"
                                title="លុបចេញពីកន្ត្រក"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                              ស្ករ៖ {c.sugarLevel} · {c.iceLevel}
                              {c.toppings && c.toppings.length > 0
                                ? ` · +${c.toppings.join(', ')}`
                                : ''}
                            </div>

                            <div className="mt-1.5 flex items-center justify-between">
                              <div className="inline-flex items-center border border-[#2A3241] rounded-lg bg-[#0B0E14]">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(idx, -1)}
                                  className="px-2 py-0.5 text-white hover:bg-[#1C2230]"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="px-2 text-xs font-bold tabular-nums text-[#FACC15]">
                                  {c.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQuantity(idx, 1)}
                                  className="px-2 py-0.5 text-white hover:bg-[#1C2230]"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              <div className="text-xs font-extrabold text-[#FACC15] tabular-nums">
                                {formatUsd(unitDiscounted * c.quantity)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Promo Code Box with RGB border */}
                  <div className="p-3 rounded-xl rgb-card-dark space-y-1.5">
                    <label className="block text-[11px] font-bold text-[#FACC15] flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      <span>កូដបញ្ចុះតម្លៃ (Promo Code)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                        placeholder="ឧ. ROMDOUL10"
                        className="flex-1 px-2.5 py-1.5 text-xs bg-[#131722] text-white border border-[#2A3241] rounded-lg uppercase font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyPromoCode()}
                        className="px-3 py-1.5 text-xs font-extrabold bg-[#FACC15] text-[#0B0E14] rounded-lg"
                      >
                        អនុវត្ត
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {promoCodes
                        .filter((p) => p.isActive)
                        .slice(0, 3)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleApplyPromoCode(p.code)}
                            className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#1A202E] text-[#FACC15] border border-[#FACC15]/30 hover:border-[#FACC15]"
                          >
                            {p.code} (
                            {p.discountPercent > 0
                              ? `-${p.discountPercent}%`
                              : `-$${p.discountFixedUsd.toFixed(2)}`}
                            )
                          </button>
                        ))}
                    </div>
                    {promoFeedback && (
                      <div className="text-[10px] text-emerald-400 font-medium">
                        {promoFeedback}
                      </div>
                    )}
                  </div>

                  <form
                    id="checkout-form"
                    onSubmit={handleInitiateKhqrPayment}
                    className="space-y-2.5 pt-2 border-t border-[#262E3D]"
                  >
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        ឈ្មោះអតិថិជន (Customer Name)
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="ឧ. សុខា (ឬទុកទំនេរសម្រាប់អតិថិជនទូទៅ)"
                        className="w-full px-3 py-1.5 text-xs bg-[#0B0E14] text-white border border-[#2A3241] rounded-xl"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          លេខទូរស័ព្ទ (សន្សំពិន្ទុ)
                        </label>
                        <input
                          type="text"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="012 888 999"
                          className="w-full px-3 py-1.5 text-xs bg-[#0B0E14] text-white border border-[#2A3241] rounded-xl tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          លេខតុ / ប្រភេទកម្មង់
                        </label>
                        <select
                          value={tableOrType}
                          onChange={(e) => setTableOrType(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-[#0B0E14] text-white border border-[#2A3241] rounded-xl"
                        >
                          {Array.from({ length: 15 }, (_, i) =>
                            String(i + 1).padStart(2, '0')
                          ).map((num) => (
                            <option key={num} value={`ញ៉ាំក្នុងហាង · តុលេខ ${num}`}>
                              ញ៉ាំក្នុងហាង · តុ {num}
                            </option>
                          ))}
                          <option value="វេចខ្ចប់ (Takeaway)">វេចខ្ចប់ (Takeaway)</option>
                          <option value="ដឹកជញ្ជូន (Delivery)">ដឹកជញ្ជូន (Delivery)</option>
                        </select>
                      </div>
                    </div>

                    {/* Customer Loyalty Points Card */}
                    {customerPhone.replace(/[^0-9+]/g, '').length >= 6 && (
                      <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-[#FACC15]" />
                            <span>
                              ពិន្ទុសន្សំ៖{' '}
                              <strong className="text-[#FACC15] tabular-nums">
                                {activeLoyaltyMember ? activeLoyaltyMember.points : 0} ពិន្ទុ
                              </strong>
                            </span>
                          </span>
                          <span className="text-[10px] text-emerald-200 tabular-nums">
                            +{cartSummary.totalItemsCount} ពិន្ទុថ្មី
                          </span>
                        </div>
                        {activeLoyaltyMember && activeLoyaltyMember.points >= 10 && (
                          <label className="flex items-center gap-2 text-[11px] font-bold text-[#FACC15] cursor-pointer pt-0.5">
                            <input
                              type="checkbox"
                              checked={redeemLoyaltyReward}
                              onChange={(e) => setRedeemLoyaltyReward(e.target.checked)}
                            />
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>ប្រើ ១០ ពិន្ទុ បញ្ចុះតម្លៃ $2.50 ភ្លាម!</span>
                          </label>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        ចំណាំសម្រាប់ការកម្មង់ (Order Note)
                      </label>
                      <input
                        type="text"
                        value={orderNote}
                        onChange={(e) => setOrderNote(e.target.value)}
                        placeholder="ឧ. ដាក់ថង់ដាច់ដោយឡែក..."
                        className="w-full px-3 py-1.5 text-xs bg-[#0B0E14] text-white border border-[#2A3241] rounded-xl"
                      />
                    </div>
                  </form>
                </>
              )}
            </div>

            {/* Compact Cart Footer Totals, Multi-Bank Selector & KHQR Checkout Buttons */}
            {cart.length > 0 && (
              <>
                <div className="rgb-line shrink-0" />
                <div className="shrink-0 p-3.5 bg-[#0B0E14] space-y-2.5">
                  <div className="space-y-1 text-xs">
                    {cartSummary.discountUsd > 0 && (
                      <div className="flex justify-between text-emerald-400 text-[11px] font-medium">
                        <span>ការបញ្ចុះតម្លៃសរុប (Discount)</span>
                        <span className="tabular-nums">-{formatUsd(cartSummary.discountUsd)}</span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-bold text-slate-300">តម្លៃសរុបត្រូវបង់៖</span>
                      <div className="text-right">
                        <span className="text-base font-black text-[#FACC15] tabular-nums">
                          {formatUsd(cartSummary.totalUsd)}
                        </span>
                        <span className="text-xs font-bold text-slate-400 tabular-nums ml-2">
                          ({formatKhr(cartSummary.totalKhr, true)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Bank Selector (ABA, ACLEDA, Wing, Bakong KHQR) */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 flex items-center justify-between">
                      <span>ជ្រើសរើសធនាគារទូទាត់ប្រាក់៖</span>
                      <span className="rgb-text font-extrabold">
                        {
                          CAMBODIA_BANK_OPTIONS.find((b) => b.code === selectedCheckoutBank)
                            ?.nameKh
                        }
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {CAMBODIA_BANK_OPTIONS.map((bank) => {
                        const isSelected = selectedCheckoutBank === bank.code;
                        return (
                          <button
                            key={bank.code}
                            type="button"
                            onClick={() => setSelectedCheckoutBank(bank.code)}
                            className={`py-1.5 px-1 rounded-lg text-[10px] font-black transition-all flex flex-col items-center justify-center gap-0.5 ${
                              isSelected
                                ? 'bg-[#FACC15] text-[#0B0E14] shadow-xs'
                                : 'rgb-pill text-slate-200'
                            }`}
                          >
                            <span className="leading-none">{bank.shortName}</span>
                            <span
                              className={`text-[8px] font-bold leading-none ${
                                isSelected ? 'text-[#002B5C]' : 'text-slate-400'
                              }`}
                            >
                              {bank.code === 'ABA'
                                ? 'ABA Pay'
                                : bank.code === 'ACLEDA'
                                ? 'អេស៊ីលីដា'
                                : bank.code === 'WING'
                                ? 'វីង'
                                : 'គ្រប់ធនាគារ'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    {/* Button 1: One-Tap Direct Alert into Selected Bank App with Pre-Set Amount */}
                    <button
                      type="button"
                      disabled={submittingOrder}
                      onClick={() => handleInitiateKhqrPayment(undefined, true)}
                      className="w-full py-2.5 px-3 text-xs font-black text-[#0B0E14] bg-gradient-to-r from-[#FACC15] via-[#FDE047] to-[#F59E0B] rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <span className="px-1.5 py-0.5 rounded bg-[#002B5C] text-white text-[10px] font-black tracking-tight shrink-0">
                        {selectedCheckoutBank}
                      </span>
                      <Smartphone className="w-3.5 h-3.5 text-[#0B0E14] shrink-0" />
                      <span className="truncate">
                        {submittingOrder
                          ? `កំពុងភ្ជាប់ទៅ ${selectedCheckoutBank}...`
                          : `ចុចបើក ${selectedCheckoutBank} ទូទាត់ភ្លាម (${formatDisplayPrice(
                              cartSummary.totalUsd
                            )})`}
                      </span>
                    </button>

                    {/* Button 2: Show KHQR Code for Scanning with Selected Bank */}
                    <button
                      type="submit"
                      form="checkout-form"
                      disabled={submittingOrder}
                      className="w-full py-2 px-3 text-xs font-extrabold text-white rgb-pill rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <QrCode className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
                      <span className="truncate">
                        បង្ហាញកូដ {selectedCheckoutBank} KHQR សម្រាប់ស្កេន (
                        {formatDisplayPrice(cartSummary.totalUsd)})
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          OFFICIAL MULTI-BANK (ABA, ACLEDA, WING, BAKONG) KHQR PAYMENT MODAL
         ===================================================================== */}
      {activeKhqrSession && (
        <KhqrPaymentModal
          order={activeKhqrSession.order}
          qrDataUrl={activeKhqrSession.qrDataUrl}
          staticQrDataUrl={activeKhqrSession.staticQrDataUrl}
          dynamicQrDataUrl={activeKhqrSession.dynamicQrDataUrl}
          abaDeepLink={activeKhqrSession.abaDeepLink}
          bakongDeepLink={activeKhqrSession.bakongDeepLink}
          abaPaywayLink={activeKhqrSession.abaPaywayLink}
          autoTriggerAbaDeepLink={activeKhqrSession.autoTriggerAbaDeepLink}
          initialBank={activeKhqrSession.initialBank || selectedCheckoutBank}
          expiresAt={activeKhqrSession.expiresAt}
          merchantName={activeKhqrSession.merchantName}
          merchantAccount={activeKhqrSession.merchantAccount}
          abaAccountUsd={activeKhqrSession.abaAccountUsd}
          abaAccountKhr={activeKhqrSession.abaAccountKhr}
          liveTokenConfigured={activeKhqrSession.liveTokenConfigured}
          onPaymentVerified={handlePaymentVerified}
          onCancelOrder={handleCancelActiveOrder}
          onClose={() => setActiveKhqrSession(null)}
        />
      )}

      {/* =====================================================================
          OFFICIAL TAX / POS INVOICE PRINT & PDF MODAL (ADMIN ONLY)
         ===================================================================== */}
      <InvoiceModal
        invoice={adminJwtToken ? selectedInvoice : null}
        onClose={() => setSelectedInvoice(null)}
      />

      {/* =====================================================================
          RGB NEON FOOTER (រំដួលកាហ្វេ · ROMDOUL CAFFEE)
         ===================================================================== */}
      <footer className="mt-16 bg-[#090C11]">
        <div className="rgb-line" />
        <div className="max-w-[1440px] mx-auto py-8 px-6 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <div className="rgb-logo-ring rounded-full shrink-0">
              <ProductImage
                src={ROMDOUL_LOGO_URL}
                alt="Romdoul Caffee Logo"
                className="w-9 h-9 rounded-full object-cover bg-[#0B0E14]"
              />
            </div>
            <div>
              <span className="font-extrabold rgb-text">រំដួលកាហ្វេ (ROMDOUL CAFFEE)</span> ·
              ប្រព័ន្ធគ្រប់គ្រងហាងកាហ្វេ និងលក់តាមអនឡាញ
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => setActiveView('storefront')} className="hover:text-[#FACC15]">
              ហាងទំនិញ (POS)
            </button>
            <button onClick={() => setActiveView('orders')} className="hover:text-[#FACC15]">
              ការកម្មង់ខ្ញុំ
            </button>
            {adminJwtToken && (
              <button onClick={() => setActiveView('invoices')} className="hover:text-[#FACC15]">
                ព្រីនបុង (Admin)
              </button>
            )}
            <button onClick={() => setActiveView('admin')} className="hover:text-[#FACC15]">
              Admin
            </button>
          </div>
        </div>
        <div className="rgb-line" />
      </footer>
    </div>
  );
}
