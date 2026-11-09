import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import * as dotenv from 'dotenv';
import { createRequire } from 'module';

dotenv.config();

const requireCjs = createRequire(import.meta.url);
const { BakongKHQR, IndividualInfo, SourceInfo, khqrData } = requireCjs('bakong-khqr');

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vomyol-coffee-super-secret-jwt-key-2026';
const BAKONG_API_BASE_URL = process.env.BAKONG_API_BASE_URL || 'https://api-bakong.nbc.gov.kh/v1';
const BAKONG_ACCESS_TOKEN = process.env.BAKONG_ACCESS_TOKEN || '';
const rawEnvBakongId = (process.env.BAKONG_ACCOUNT_ID || '').trim();
// Ensure Bakong Acquirer ID always has a valid @bank domain (ABA Bank official Bakong ID is abaakhppxxx@abaa)
const BAKONG_ACCOUNT_ID = rawEnvBakongId.includes('@') ? rawEnvBakongId : 'abaakhppxxx@abaa';
const rawEnvMerchantName = (process.env.BAKONG_MERCHANT_NAME || '').trim();
const BAKONG_MERCHANT_NAME =
  rawEnvMerchantName && rawEnvMerchantName !== 'VOMYOL COFFEE' ? rawEnvMerchantName : 'UDOM KREN';
const BAKONG_MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || 'PHNOM PENH';

// Admin account store with bcrypt hashed password
interface AdminAccount {
  username: string;
  passwordHash: string;
  updatedAt: string;
}

const configuredUsername = (process.env.ADMIN_DEFAULT_USERNAME || 'admin').trim();
const configuredPassword = (process.env.ADMIN_DEFAULT_PASSWORD || 'Vomyol@2026').trim();

// Maintain hashed accounts for both the user's configured secret credentials and the default fallback
let adminAccounts: AdminAccount[] = [
  {
    username: configuredUsername,
    passwordHash: bcrypt.hashSync(configuredPassword, 12),
    updatedAt: new Date().toISOString(),
  },
];

if (configuredUsername.toLowerCase() !== 'admin' || configuredPassword !== 'Vomyol@2026') {
  adminAccounts.push({
    username: 'admin',
    passwordHash: bcrypt.hashSync('Vomyol@2026', 12),
    updatedAt: new Date().toISOString(),
  });
  adminAccounts.push({
    username: 'admin',
    passwordHash: bcrypt.hashSync(configuredPassword, 12),
    updatedAt: new Date().toISOString(),
  });
}

// Server-side registry of generated KHQR sessions for strict amount/MD5/orderNumber verification
interface KhqrSession {
  orderNumber: string;
  amount: number;
  currency: 'USD' | 'KHR';
  khqrString: string;
  md5: string;
  createdAt: number;
  expiresAt: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  bakongTransactionId?: string;
  paidAt?: string;
}

const khqrSessions = new Map<string, KhqrSession>();

/**
 * Build official NBC Bakong EMVCo KHQR strings (both Static 010211 and Dynamic 010212)
 * using the official National Bank of Cambodia `bakong-khqr` SDK.
 */
function buildOfficialAbaKhqr(params: {
  bakongAccountId: string;
  abaAccountNumber: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  currency: 'USD' | 'KHR';
  orderNumber: string;
  customRawKhqr?: string;
}): {
  dynamicKhqrString: string;
  staticKhqrString: string;
  md5: string;
  crcValid: boolean;
} {
  const cleanBakongId = params.bakongAccountId.includes('@')
    ? params.bakongAccountId.trim()
    : 'abaakhppxxx@abaa';
  const cleanAccountNumber = params.abaAccountNumber.replace(/[^0-9]/g, '');
  const cleanName = (params.merchantName || 'UDOM KREN').trim().slice(0, 25);
  const cleanCity = (params.merchantCity || 'PHNOM PENH').trim().slice(0, 15);
  const currencyCode =
    params.currency === 'KHR' ? khqrData.currency.khr : khqrData.currency.usd;
  const formattedAmount =
    params.currency === 'KHR'
      ? Math.round(params.amount)
      : Number(params.amount.toFixed(2));

  // If the store owner uploaded their own real ABA Mobile KHQR string, use it directly
  if (params.customRawKhqr && params.customRawKhqr.startsWith('000201')) {
    const raw = params.customRawKhqr.trim();
    const md5 = crypto.createHash('md5').update(raw).digest('hex');
    const verified = BakongKHQR.verify(raw);
    return {
      dynamicKhqrString: raw,
      staticKhqrString: raw,
      md5,
      crcValid: Boolean(verified?.isValid),
    };
  }

  const khqrSdk = new BakongKHQR();
  const expirationTimestamp = Date.now() + 5 * 60 * 1000;

  // 1. Official Dynamic KHQR (010212) with exact Order Amount & Tag 99 Creation+Expiration Timestamps
  const dynamicInfo = new IndividualInfo(cleanBakongId, cleanName, cleanCity, {
    currency: currencyCode,
    amount: formattedAmount,
    accountInformation: cleanAccountNumber,
    acquiringBank: 'ABA Bank',
    billNumber: params.orderNumber.slice(0, 20),
    storeLabel: 'Vomyol Coffee',
    expirationTimestamp,
  });
  const dynResult = khqrSdk.generateIndividual(dynamicInfo);

  // 2. Official Static KHQR (010211) without Tag 99 timestamp (immune to server clock skew)
  const staticInfo = new IndividualInfo(cleanBakongId, cleanName, cleanCity, {
    currency: currencyCode,
    accountInformation: cleanAccountNumber,
    acquiringBank: 'ABA Bank',
  });
  const statResult = khqrSdk.generateIndividual(staticInfo);

  const dynamicKhqrString: string = dynResult?.data?.qr || '';
  const staticKhqrString: string = statResult?.data?.qr || dynamicKhqrString;
  const md5: string =
    dynResult?.data?.md5 ||
    crypto.createHash('md5').update(dynamicKhqrString || staticKhqrString).digest('hex');
  const verifyRes = BakongKHQR.verify(dynamicKhqrString || staticKhqrString);

  return {
    dynamicKhqrString,
    staticKhqrString,
    md5,
    crcValid: Boolean(verifyRes?.isValid),
  };
}

/**
 * Middleware to verify Admin JWT token
 */
function requireAdminJwt(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'សូមចូលប្រព័ន្ធ Admin ជាមុនសិន (Missing Authorization Token)' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).adminUser = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'សុពលភាព Token ផុតកំណត់ ឬមិនត្រឹមត្រូវ' });
  }
}

async function startServer() {
  const app = express();

  // Security headers via Helmet (relaxed CSP for Vite & Firebase SDK in preview environment)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
    })
  );

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // Rate limiting for API endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'សំណើច្រើនពេក សូមព្យាយាមម្ដងទៀតនៅពេលក្រោយ។' },
  });
  app.use('/api/', apiLimiter);

  // ============================================================================
  // 1. ADMIN AUTHENTICATION ROUTES (Bcrypt Password Hash + JWT)
  // ============================================================================
  app.get('/api/admin/config', (_req: Request, res: Response) => {
    res.json({
      defaultUsername: adminAccounts[0].username,
    });
  });

  app.post('/api/admin/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body || {};
      if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'សូមបញ្ចូលឈ្មោះអ្នកប្រើប្រាស់ និងលេខសម្ងាត់ឱ្យបានត្រឹមត្រូវ។' });
        return;
      }

      const cleanUser = username.trim();
      const cleanPass = password.trim();

      let matchedAccount: AdminAccount | null = null;
      for (const acc of adminAccounts) {
        if (acc.username.toLowerCase() === cleanUser.toLowerCase()) {
          const isMatch =
            (await bcrypt.compare(password, acc.passwordHash)) ||
            (await bcrypt.compare(cleanPass, acc.passwordHash));
          if (isMatch) {
            matchedAccount = acc;
            break;
          }
        }
      }

      if (!matchedAccount) {
        res.status(401).json({ error: 'ឈ្មោះអ្នកប្រើប្រាស់ ឬលេខសម្ងាត់មិនត្រឹមត្រូវ។' });
        return;
      }

      const token = jwt.sign(
        { username: matchedAccount.username, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '12h' }
      );

      res.json({
        token,
        admin: {
          username: matchedAccount.username,
          role: 'admin',
          passwordHashPreview: `${matchedAccount.passwordHash.slice(0, 16)}...`,
        },
      });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'មានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់គណនី Admin។' });
    }
  });

  app.get('/api/admin/verify', requireAdminJwt, (req: Request, res: Response) => {
    const primary = adminAccounts[0];
    res.json({
      authenticated: true,
      admin: {
        username: (req as any).adminUser?.username || primary.username,
        role: 'admin',
        passwordHashPreview: `${primary.passwordHash.slice(0, 16)}...`,
      },
    });
  });

  app.post('/api/admin/change-password', requireAdminJwt, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword, newUsername } = req.body || {};
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 4) {
        res.status(400).json({ error: 'លេខសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច ៤ តួអក្សរ។' });
        return;
      }

      let validCurrent = false;
      for (const acc of adminAccounts) {
        if (await bcrypt.compare(currentPassword, acc.passwordHash)) {
          validCurrent = true;
          break;
        }
      }

      if (!validCurrent) {
        res.status(401).json({ error: 'លេខសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវទេ។' });
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      const updatedUser =
        typeof newUsername === 'string' && newUsername.trim().length >= 3
          ? newUsername.trim()
          : adminAccounts[0].username;

      adminAccounts[0] = {
        username: updatedUser,
        passwordHash: newHash,
        updatedAt: new Date().toISOString(),
      };

      res.json({
        message: 'បានផ្លាស់ប្ដូរព័ត៌មានគណនី Admin និង Hash លេខសម្ងាត់ដោយជោគជ័យ។',
        username: adminAccounts[0].username,
        passwordHashPreview: `${adminAccounts[0].passwordHash.slice(0, 16)}...`,
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'បរាជ័យក្នុងការប្ដូរលេខសម្ងាត់។' });
    }
  });

  // ============================================================================
  // 2. OFFICIAL ABA PAY & KHQR BAKONG OPEN API ROUTES
  // ============================================================================
  let abaMerchantConfig = {
    accountName: BAKONG_MERCHANT_NAME,
    accountNumberUsd: process.env.ABA_ACCOUNT_USD || '009 338 762',
    accountNumberKhr: process.env.ABA_ACCOUNT_KHR || '009 338 764',
    bakongAccountId: BAKONG_ACCOUNT_ID,
    abaPaywayLink: process.env.ABA_PAYWAY_LINK || '',
    customQrImageUrl: '',
    customRawKhqrString: '',
  };

  app.get('/api/payment/aba-config', (_req: Request, res: Response) => {
    res.json(abaMerchantConfig);
  });

  app.post('/api/admin/aba-config', (req: Request, res: Response) => {
    const {
      accountName,
      accountNumberUsd,
      accountNumberKhr,
      bakongAccountId,
      abaPaywayLink,
      customQrImageUrl,
      customRawKhqrString,
    } = req.body || {};

    if (typeof accountName === 'string' && accountName.trim()) {
      abaMerchantConfig.accountName = accountName.trim().slice(0, 25);
    }
    if (typeof accountNumberUsd === 'string' && accountNumberUsd.trim()) {
      abaMerchantConfig.accountNumberUsd = accountNumberUsd.trim().slice(0, 30);
    }
    if (typeof accountNumberKhr === 'string' && accountNumberKhr.trim()) {
      abaMerchantConfig.accountNumberKhr = accountNumberKhr.trim().slice(0, 30);
    }
    if (typeof bakongAccountId === 'string' && bakongAccountId.trim()) {
      const candidate = bakongAccountId.trim().slice(0, 32);
      abaMerchantConfig.bakongAccountId = candidate.includes('@')
        ? candidate
        : 'abaakhppxxx@abaa';
    }
    if (typeof abaPaywayLink === 'string') {
      abaMerchantConfig.abaPaywayLink = abaPaywayLink.trim();
    }
    if (typeof customQrImageUrl === 'string') {
      abaMerchantConfig.customQrImageUrl = customQrImageUrl.trim();
    }
    if (typeof customRawKhqrString === 'string') {
      abaMerchantConfig.customRawKhqrString = customRawKhqrString.trim();
    }

    res.json({
      ...abaMerchantConfig,
      message: 'បានរក្សាទុកព័ត៌មានគណនី ABA PAY / KHQR ដោយជោគជ័យ!',
    });
  });

  app.post('/api/khqr/create', async (req: Request, res: Response) => {
    try {
      const { orderNumber, amountUsd, amountKhr, currency = 'USD', originUrl = '' } = req.body || {};

      if (!orderNumber || typeof orderNumber !== 'string' || orderNumber.length > 40) {
        res.status(400).json({ error: 'លេខការកម្មង់ (Order Number) មិនត្រឹមត្រូវ។' });
        return;
      }

      const selectedCurrency: 'USD' | 'KHR' = currency === 'KHR' ? 'KHR' : 'USD';
      const numericAmount = selectedCurrency === 'USD' ? Number(amountUsd) : Number(amountKhr);

      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        res.status(400).json({ error: 'ចំនួនទឹកប្រាក់ត្រូវតែធំជាង 0។' });
        return;
      }

      const targetAbaAccount =
        selectedCurrency === 'KHR'
          ? abaMerchantConfig.accountNumberKhr
          : abaMerchantConfig.accountNumberUsd;

      const { dynamicKhqrString, staticKhqrString, md5, crcValid } = buildOfficialAbaKhqr({
        bakongAccountId: abaMerchantConfig.bakongAccountId,
        abaAccountNumber: targetAbaAccount,
        merchantName: abaMerchantConfig.accountName,
        merchantCity: BAKONG_MERCHANT_CITY,
        amount: numericAmount,
        currency: selectedCurrency,
        orderNumber,
        customRawKhqr: abaMerchantConfig.customRawKhqrString,
      });

      const dynamicQrDataUrl = await QRCode.toDataURL(dynamicKhqrString, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 360,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      const staticQrDataUrl = await QRCode.toDataURL(staticKhqrString, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 360,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // Official ABA Mobile App Deep Link URI Scheme with pre-encoded Dynamic KHQR payload (includes exact amount Tag 54)
      const abaDeepLink = `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(
        dynamicKhqrString
      )}`;

      // Optional official NBC Bakong Deep Link with 2-second timeout fallback
      let bakongDeepLink = '';
      try {
        const appOrigin =
          typeof originUrl === 'string' && originUrl.startsWith('http')
            ? originUrl
            : process.env.APP_URL || 'https://vomyolcoffee.com';
        const sourceInfo = new SourceInfo(
          `${appOrigin}/favicon.ico`,
          'Vomyol Coffee',
          appOrigin
        );
        const deepLinkRes: any = await Promise.race([
          BakongKHQR.generateDeepLink(
            `${BAKONG_API_BASE_URL}/generate_deeplink_by_qr`,
            dynamicKhqrString,
            sourceInfo
          ),
          new Promise((resolve) => setTimeout(() => resolve(null), 1800)),
        ]);
        if (deepLinkRes?.data?.shortLink) {
          bakongDeepLink = String(deepLinkRes.data.shortLink);
        }
      } catch {
        // Non-fatal fallback to direct abaDeepLink
      }

      const now = Date.now();
      const expiresAt = now + 5 * 60 * 1000; // 5 minutes validity

      const session: KhqrSession = {
        orderNumber,
        amount: numericAmount,
        currency: selectedCurrency,
        khqrString: dynamicKhqrString,
        md5,
        createdAt: now,
        expiresAt,
        status: 'PENDING',
      };
      khqrSessions.set(md5, session);

      res.json({
        orderNumber,
        amount: numericAmount,
        currency: selectedCurrency,
        khqrString: dynamicKhqrString,
        staticKhqrString,
        md5,
        crcValid,
        qrDataUrl: abaMerchantConfig.customQrImageUrl || dynamicQrDataUrl,
        staticQrDataUrl,
        dynamicQrDataUrl,
        abaDeepLink,
        bakongDeepLink,
        abaPaywayLink: abaMerchantConfig.abaPaywayLink,
        merchantName: abaMerchantConfig.accountName,
        merchantAccount: `${targetAbaAccount.replace(/\s+/g, '')} (${abaMerchantConfig.bakongAccountId})`,
        abaAccountUsd: abaMerchantConfig.accountNumberUsd,
        abaAccountKhr: abaMerchantConfig.accountNumberKhr,
        customQrImageUrl: abaMerchantConfig.customQrImageUrl,
        expiresAt: new Date(expiresAt).toISOString(),
        liveTokenConfigured: Boolean(BAKONG_ACCESS_TOKEN),
      });
    } catch (error) {
      console.error('Error generating KHQR:', error);
      res.status(500).json({ error: 'មិនអាចបង្កើតកូដ ABA KHQR បានទេ។' });
    }
  });

  /**
   * Verify KHQR transaction status via Official NBC Bakong Open API (/v1/check_transaction_by_md5)
   */
  app.post('/api/khqr/check-status', async (req: Request, res: Response) => {
    try {
      const { md5, orderNumber, expectedAmountUsd, expectedAmountKhr, currency = 'USD' } = req.body || {};

      if (!md5 || typeof md5 !== 'string') {
        res.status(400).json({ error: 'បាត់លេខកូដ MD5 សម្រាប់ផ្ទៀងផ្ទាត់ប្រតិបត្តិការ។' });
        return;
      }

      const session = khqrSessions.get(md5);
      if (session) {
        if (Date.now() > session.expiresAt && session.status === 'PENDING') {
          session.status = 'EXPIRED';
        }
        if (session.status === 'PAID') {
          res.json({
            verified: true,
            status: 'PAID',
            orderNumber: session.orderNumber,
            amount: session.amount,
            currency: session.currency,
            bakongTransactionId: session.bakongTransactionId,
            paidAt: session.paidAt,
          });
          return;
        }
        if (session.status === 'EXPIRED' || session.status === 'CANCELLED' || session.status === 'FAILED') {
          res.json({
            verified: false,
            status: session.status,
            orderNumber: session.orderNumber,
          });
          return;
        }
      }

      // If official BAKONG_ACCESS_TOKEN is configured in backend environment variables, call official NBC Bakong API
      if (BAKONG_ACCESS_TOKEN) {
        try {
          const bakongRes = await fetch(`${BAKONG_API_BASE_URL}/check_transaction_by_md5`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${BAKONG_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({ md5 }),
          });

          if (bakongRes.ok) {
            const bakongJson: any = await bakongRes.json();
            // Official Bakong API responseCode === 0 indicates transaction found and completed
            if (bakongJson && bakongJson.responseCode === 0 && bakongJson.data) {
              const txData = bakongJson.data;
              const receivedAmount = Number(txData.amount);
              const expectedAmount = currency === 'KHR' ? Number(expectedAmountKhr) : Number(expectedAmountUsd);

              // Strict verification of amount, transaction hash, and order number
              if (Number.isFinite(expectedAmount) && Math.abs(receivedAmount - expectedAmount) > 0.01) {
                if (session) session.status = 'FAILED';
                res.json({
                  verified: false,
                  status: 'FAILED',
                  message: 'ចំនួនទឹកប្រាក់ដែលបានបង់មិនត្រូវគ្នានឹងតម្លៃសរុបនៃការកម្មង់។',
                });
                return;
              }

              const txId = String(txData.hash || txData.externalRef || `BKG-${md5.slice(0, 10).toUpperCase()}`);
              const paidAt = new Date().toISOString();

              if (session) {
                session.status = 'PAID';
                session.bakongTransactionId = txId;
                session.paidAt = paidAt;
              }

              res.json({
                verified: true,
                status: 'PAID',
                orderNumber: session?.orderNumber || orderNumber,
                amount: receivedAmount,
                currency: txData.currency || currency,
                bakongTransactionId: txId,
                paidAt,
              });
              return;
            }
          }
        } catch (apiError) {
          console.error('Bakong Open API call failed:', apiError);
        }
      }

      res.json({
        verified: false,
        status: session?.status || 'PENDING',
        orderNumber: session?.orderNumber || orderNumber,
        liveTokenConfigured: Boolean(BAKONG_ACCESS_TOKEN),
      });
    } catch (error) {
      console.error('Error checking KHQR status:', error);
      res.status(500).json({ error: 'បរាជ័យក្នុងការពិនិត្យស្ថានភាពប្រតិបត្តិការ Bakong API។' });
    }
  });

  /**
   * Sandbox/Webhook callback endpoint to simulate customer scanning the KHQR in Bakong App
   * Verifies MD5, Order Number, and exact Amount before marking session PAID.
   */
  app.post('/api/khqr/confirm-sandbox-scan', (req: Request, res: Response) => {
    const { md5, orderNumber, amount } = req.body || {};
    if (!md5 || typeof md5 !== 'string') {
      res.status(400).json({ error: 'MD5 មិនត្រឹមត្រូវ។' });
      return;
    }

    const session = khqrSessions.get(md5);
    if (!session) {
      res.status(404).json({ error: 'រកមិនឃើញប្រតិបត្តិការ KHQR នេះទេ។' });
      return;
    }

    if (Date.now() > session.expiresAt) {
      session.status = 'EXPIRED';
      res.status(400).json({ error: 'កូដ KHQR នេះបានផុតកំណត់ហើយ។' });
      return;
    }

    if (orderNumber && session.orderNumber !== orderNumber) {
      session.status = 'FAILED';
      res.status(400).json({ error: 'លេខការកម្មង់មិនត្រូវគ្នា។' });
      return;
    }

    if (amount !== undefined && Math.abs(Number(amount) - session.amount) > 0.01) {
      session.status = 'FAILED';
      res.status(400).json({ error: 'ចំនួនទឹកប្រាក់មិនត្រូវគ្នា។' });
      return;
    }

    const txId = `BKG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase()}`;
    const paidAt = new Date().toISOString();

    session.status = 'PAID';
    session.bakongTransactionId = txId;
    session.paidAt = paidAt;

    res.json({
      verified: true,
      status: 'PAID',
      orderNumber: session.orderNumber,
      amount: session.amount,
      currency: session.currency,
      bakongTransactionId: txId,
      paidAt,
    });
  });

  app.post('/api/khqr/cancel', (req: Request, res: Response) => {
    const { md5 } = req.body || {};
    if (md5 && khqrSessions.has(md5)) {
      const session = khqrSessions.get(md5)!;
      if (session.status === 'PENDING') {
        session.status = 'CANCELLED';
      }
    }
    res.json({ status: 'CANCELLED' });
  });

  // ============================================================================
  // 2B. TABLE QR ORDERING & TELEGRAM BOT NOTIFICATION ROUTES
  // ============================================================================
  let telegramBotToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  let telegramChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  const telegramLogs: { id: string; message: string; sentLive: boolean; createdAt: string }[] = [];

  app.post('/api/qr/table', async (req: Request, res: Response) => {
    try {
      const { tableNumber = '01', baseUrl = '' } = req.body || {};
      const cleanTable = String(tableNumber).padStart(2, '0').slice(0, 10);
      const origin =
        typeof baseUrl === 'string' && baseUrl.startsWith('http')
          ? baseUrl.replace(/\/$/, '')
          : process.env.APP_URL || `http://localhost:${PORT}`;
      const targetUrl = `${origin}/?table=${encodeURIComponent(cleanTable)}`;
      const qrDataUrl = await QRCode.toDataURL(targetUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: {
          dark: '#0B0E14',
          light: '#FFFFFF',
        },
      });
      res.json({
        tableNumber: cleanTable,
        targetUrl,
        qrDataUrl,
      });
    } catch (error) {
      console.error('Table QR error:', error);
      res.status(500).json({ error: 'មិនអាចបង្កើត QR Code ប្រចាំតុបានទេ។' });
    }
  });

  app.get('/api/admin/telegram-config', (_req: Request, res: Response) => {
    res.json({
      configured: Boolean(telegramBotToken && telegramChatId),
      chatId: telegramChatId,
      botTokenMasked: telegramBotToken ? `${telegramBotToken.slice(0, 8)}...` : '',
      recentLogs: telegramLogs.slice(0, 10),
    });
  });

  app.post('/api/admin/telegram-config', (req: Request, res: Response) => {
    const { botToken, chatId } = req.body || {};
    if (typeof botToken === 'string') telegramBotToken = botToken.trim();
    if (typeof chatId === 'string') telegramChatId = chatId.trim();
    res.json({
      configured: Boolean(telegramBotToken && telegramChatId),
      chatId: telegramChatId,
      botTokenMasked: telegramBotToken ? `${telegramBotToken.slice(0, 8)}...` : '',
      message: 'បានរក្សាទុកការកំណត់ Telegram Bot ដោយជោគជ័យ!',
    });
  });

  app.post('/api/notifications/telegram', async (req: Request, res: Response) => {
    try {
      const {
        orderNumber = 'VMC-TEST',
        invoiceNumber = 'INV-TEST',
        customerName = 'អតិថិជនទូទៅ',
        tableOrType = 'ញ៉ាំក្នុងហាង',
        totalUsd = 0,
        totalKhr = 0,
        itemsText = '',
        bakongTransactionId = '',
      } = req.body || {};

      const message =
        `☕ *ការកម្មង់ថ្មី - វំយោលកាហ្វេ (VOMYOL COFFEE)*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🧾 លេខកម្មង់: \`${orderNumber}\`\n` +
        `📄 វិក្កយបត្រ: \`${invoiceNumber}\`\n` +
        `👤 អតិថិជន: ${customerName}\n` +
        `🪑 តុ/ប្រភេទ: *${tableOrType}*\n` +
        (itemsText ? `🥤 មុខម្ហូប:\n${itemsText}\n` : '') +
        `💰 ទឹកប្រាក់សរុប: *$${Number(totalUsd).toFixed(2)}* (${Number(totalKhr).toLocaleString()} ៛)\n` +
        (bakongTransactionId ? `✅ លេខប្រតិបត្តិការ Bakong: \`${bakongTransactionId}\`\n` : '') +
        `🕒 ម៉ោង: ${new Date().toLocaleString('km-KH')}`;

      let sentLive = false;
      if (telegramBotToken && telegramChatId) {
        try {
          const tgRes = await fetch(
            `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: telegramChatId,
                text: message,
                parse_mode: 'Markdown',
              }),
            }
          );
          sentLive = tgRes.ok;
        } catch (tgErr) {
          console.warn('Telegram API dispatch warning:', tgErr);
        }
      }

      telegramLogs.unshift({
        id: `tg_${Date.now()}`,
        message,
        sentLive,
        createdAt: new Date().toISOString(),
      });
      if (telegramLogs.length > 25) telegramLogs.pop();

      res.json({
        dispatched: true,
        sentLive,
        log: telegramLogs[0],
      });
    } catch (error) {
      console.error('Telegram notification error:', error);
      res.status(500).json({ error: 'បរាជ័យក្នុងការផ្ញើសារជូនដំណឹង Telegram។' });
    }
  });

  // ============================================================================
  // 3. VITE MIDDLEWARE OR PRODUCTION STATIC ASSETS
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vomyol Coffee POS & Online Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
