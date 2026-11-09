import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  X,
  Copy,
  Check,
  Smartphone,
  Upload,
  ExternalLink,
  Download,
  Share2,
} from 'lucide-react';
import jsQR from 'jsqr';
import { Order, PaymentStatus, formatUsd, formatKhr } from '../types';

interface KhqrPaymentModalProps {
  order: Order;
  qrDataUrl: string;
  staticQrDataUrl?: string;
  dynamicQrDataUrl?: string;
  abaDeepLink?: string;
  bakongDeepLink?: string;
  abaPaywayLink?: string;
  autoTriggerAbaDeepLink?: boolean;
  expiresAt: string;
  merchantName: string;
  merchantAccount: string;
  abaAccountUsd?: string;
  abaAccountKhr?: string;
  liveTokenConfigured: boolean;
  onPaymentVerified: (bakongTransactionId: string, paidAt: string) => Promise<void>;
  onCancelOrder: () => Promise<void>;
  onClose: () => void;
}

export const KhqrPaymentModal: React.FC<KhqrPaymentModalProps> = ({
  order,
  qrDataUrl,
  staticQrDataUrl,
  dynamicQrDataUrl,
  abaDeepLink,
  bakongDeepLink,
  abaPaywayLink,
  autoTriggerAbaDeepLink = false,
  expiresAt,
  merchantName,
  abaAccountUsd = '009 338 762',
  abaAccountKhr = '009 338 764',
  onPaymentVerified,
  onCancelOrder,
  onClose,
}) => {
  const [status, setStatus] = useState<PaymentStatus>(order.paymentStatus);
  const [secondsLeft, setSecondsLeft] = useState<number>(300);
  const [checking, setChecking] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copiedCurrency, setCopiedCurrency] = useState<'USD' | 'KHR' | null>(null);
  const [qrMode, setQrMode] = useState<'static' | 'dynamic' | 'custom'>('dynamic');
  const [uploadedQrDataUrl, setUploadedQrDataUrl] = useState<string>('');
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string>('');
  const [abaLaunchAlertShown, setAbaLaunchAlertShown] = useState<boolean>(false);

  const isAndroidDevice =
    typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  const formattedOrderAmount =
    order.currency === 'KHR'
      ? formatKhr(order.totalKhr, true)
      : formatUsd(order.totalUsd);

  const secondaryOrderAmount =
    order.currency === 'KHR'
      ? formatUsd(order.totalUsd)
      : formatKhr(order.totalKhr, true);

  const targetAccountNumber =
    order.currency === 'KHR' ? abaAccountKhr : abaAccountUsd;

  const displayedQrUrl =
    qrMode === 'custom' && uploadedQrDataUrl
      ? uploadedQrDataUrl
      : qrMode === 'dynamic' && dynamicQrDataUrl
      ? dynamicQrDataUrl
      : staticQrDataUrl || qrDataUrl;

  const rawKhqrPayload = order.khqrString || '';

  // Standard ABA custom scheme (works on iOS & most Android browsers)
  const computedAbaSchemeUri =
    abaDeepLink ||
    `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(rawKhqrPayload)}`;

  // Official Android Chrome Intent URI for ABA Mobile (com.paygo24.ibank)
  const computedAndroidIntentUri = `intent://ababank.com?type=payway&qrcode=${encodeURIComponent(
    rawKhqrPayload
  )}#Intent;scheme=abamobilebank;package=com.paygo24.ibank;S.browser_fallback_url=${encodeURIComponent(
    'https://play.google.com/store/apps/details?id=com.paygo24.ibank'
  )};end`;

  // Launch ABA Mobile app on Android or iOS with pre-set amount
  const handleOpenAbaMobileApp = useCallback(
    (preferAndroidIntent: boolean = isAndroidDevice) => {
      setQrMode('dynamic');
      setAbaLaunchAlertShown(true);

      // Copy target account number to clipboard automatically
      const cleanAcc = targetAccountNumber.replace(/\s+/g, '');
      navigator.clipboard.writeText(cleanAcc).catch(() => {});

      let targetUri = computedAbaSchemeUri;
      if (abaPaywayLink && abaPaywayLink.startsWith('http')) {
        targetUri = abaPaywayLink;
      } else if (preferAndroidIntent) {
        targetUri = computedAndroidIntentUri;
      } else if (bakongDeepLink && bakongDeepLink.startsWith('http')) {
        targetUri = bakongDeepLink;
      }

      const link = document.createElement('a');
      link.href = targetUri;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [
      isAndroidDevice,
      targetAccountNumber,
      computedAbaSchemeUri,
      abaPaywayLink,
      computedAndroidIntentUri,
      bakongDeepLink,
    ]
  );

  // Auto-trigger ABA Mobile Deep Link if customer clicked the "Open ABA Mobile" button in Cart
  useEffect(() => {
    if (autoTriggerAbaDeepLink && status === 'PENDING') {
      const timer = setTimeout(() => {
        handleOpenAbaMobileApp(isAndroidDevice);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoTriggerAbaDeepLink, status, isAndroidDevice, handleOpenAbaMobileApp]);

  // Download or Share Dynamic KHQR Image (with pre-set amount encoded in Tag 54)
  const handleSaveOrSharePreFilledQr = async (mode: 'share' | 'download') => {
    const qrSource = dynamicQrDataUrl || displayedQrUrl;
    if (!qrSource) return;

    if (mode === 'share') {
      try {
        const res = await fetch(qrSource);
        const blob = await res.blob();
        const fileName = `ABA-KHQR-${order.orderNumber}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `ABA KHQR · ${merchantName} (${formattedOrderAmount})`,
            text: `ទូទាត់ប្រាក់ចំនួន ${formattedOrderAmount} ទៅកាន់គណនី ABA ${merchantName} (${targetAccountNumber})`,
            files: [file],
          });
          return;
        }
      } catch {
        // Fallback to download if share cancelled or unsupported
      }
    }

    const a = document.createElement('a');
    a.href = qrSource;
    a.download = `ABA-KHQR-${order.orderNumber}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Countdown timer
  useEffect(() => {
    const expiryMs = new Date(expiresAt).getTime();
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff <= 0 && status === 'PENDING') {
        setStatus('EXPIRED');
      }
    };
    updateTimer();
    const timerId = setInterval(updateTimer, 1000);
    return () => clearInterval(timerId);
  }, [expiresAt, status]);

  // Automatic polling against Backend ABA KHQR / Bakong Open API check-status endpoint
  useEffect(() => {
    if (status !== 'PENDING') return;

    const checkTransaction = async () => {
      try {
        setChecking(true);
        const res = await fetch('/api/khqr/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            md5: order.khqrMd5,
            orderNumber: order.orderNumber,
            expectedAmountUsd: order.totalUsd,
            expectedAmountKhr: order.totalKhr,
            currency: order.currency,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.verified && data.status === 'PAID') {
          setStatus('PAID');
          await onPaymentVerified(data.bakongTransactionId, data.paidAt);
        } else if (
          data.status === 'EXPIRED' ||
          data.status === 'FAILED' ||
          data.status === 'CANCELLED'
        ) {
          setStatus(data.status);
        }
      } catch {
        // Silent retry on next interval
      } finally {
        setChecking(false);
      }
    };

    const pollId = setInterval(checkTransaction, 3000);
    return () => clearInterval(pollId);
  }, [order, status, onPaymentVerified]);

  const handleCopyAccount = (accNum: string, curr: 'USD' | 'KHR') => {
    navigator.clipboard.writeText(accNum.replace(/\s+/g, '')).catch(() => {});
    setCopiedCurrency(curr);
    setTimeout(() => setCopiedCurrency(null), 2000);
  };

  // Allow owner to upload their real ABA Mobile QR screenshot directly here and decode EMVCo payload via jsQR
  const handleDirectAbaQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxDim = 700;
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const decodedQr = jsQR(imageData.data, imageData.width, imageData.height);
        const dataUrl = canvas.toDataURL('image/png', 0.92);

        setUploadedQrDataUrl(dataUrl);
        setQrMode('custom');

        const rawKhqr =
          decodedQr?.data && decodedQr.data.startsWith('000201') ? decodedQr.data : '';

        await fetch('/api/admin/aba-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customQrImageUrl: dataUrl,
            customRawKhqrString: rawKhqr,
          }),
        }).catch(() => {});

        setUploadSuccessMsg(
          rawKhqr
            ? 'បានអានកូដ KHQR ពិតពីរូបភាព ABA Mobile ជោគជ័យ!'
            : 'បានដាក់រូបភាព ABA QR ផ្ទាល់ខ្លួនរួចរាល់!'
        );
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleManualCheck = async () => {
    setErrorMsg('');
    setChecking(true);
    try {
      const res = await fetch('/api/khqr/check-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          md5: order.khqrMd5,
          orderNumber: order.orderNumber,
          expectedAmountUsd: order.totalUsd,
          expectedAmountKhr: order.totalKhr,
          currency: order.currency,
        }),
      });
      const data = await res.json();
      if (data.verified && data.status === 'PAID') {
        setStatus('PAID');
        await onPaymentVerified(data.bakongTransactionId, data.paidAt);
      } else {
        setErrorMsg(
          'មិនទាន់ឃើញប្រតិបត្តិការនៅឡើយទេ។ សូមចុចប៊ូតុងពណ៌មាសខាងក្រោម ប្រសិនបើអ្នកបានបង់ប្រាក់រួច។'
        );
      }
    } catch {
      setErrorMsg('មានបញ្ហាក្នុងការតភ្ជាប់ទៅកាន់ម៉ាស៊ីនមេ។');
    } finally {
      setChecking(false);
    }
  };

  const handleSimulateBakongAppScan = async () => {
    setErrorMsg('');
    setSimulating(true);
    try {
      const amountToVerify = order.currency === 'KHR' ? order.totalKhr : order.totalUsd;
      const res = await fetch('/api/khqr/confirm-sandbox-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          md5: order.khqrMd5,
          orderNumber: order.orderNumber,
          amount: amountToVerify,
        }),
      });
      const data = await res.json();
      if (res.ok && data.verified && data.status === 'PAID') {
        setStatus('PAID');
        await onPaymentVerified(data.bakongTransactionId, data.paidAt);
      } else {
        setErrorMsg(data.error || 'ការផ្ទៀងផ្ទាត់បរាជ័យ។');
      }
    } catch {
      setErrorMsg('មិនអាចផ្ទៀងផ្ទាត់ប្រតិបត្តិការបានទេ។');
    } finally {
      setSimulating(false);
    }
  };

  const handleCancel = async () => {
    try {
      await fetch('/api/khqr/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ md5: order.khqrMd5 }),
      });
      setStatus('CANCELLED');
      await onCancelOrder();
    } catch {
      onClose();
    }
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4">
      {/* Compact, Mobile-First Container that NEVER overflows viewport height */}
      <div className="bg-[#131722] text-white w-full max-w-[390px] max-h-[94dvh] rounded-2xl border border-[#2A3241] shadow-2xl flex flex-col overflow-hidden">
        {/* 1. COMPACT STICKY HEADER */}
        <div className="shrink-0 bg-gradient-to-r from-[#003D6B] via-[#005187] to-[#003D6B] border-b-2 border-[#E1232E] text-white px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="px-2 py-0.5 rounded-md bg-white text-[#003D6B] font-black text-xs tracking-tight flex items-center gap-0.5 shadow-xs shrink-0">
              <span>ABA</span>
              <span className="text-[#E1232E]">&apos;</span>
              <span className="text-[10px] font-extrabold ml-0.5">PAY</span>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold tracking-wide text-white truncate">
                {merchantName} · #{order.orderNumber.slice(-4)}
              </div>
              <div className="text-[10px] text-sky-200 truncate">
                ទូទាត់ប្រាក់រហ័សលើ Android / iOS ឬស្កេន KHQR
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white rounded-lg transition-colors shrink-0"
            aria-label="បិទ"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. SCROLLABLE COMPACT BODY */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-2.5 space-y-2.5">
          {/* Compact Single-Row Mode Tabs */}
          {status === 'PENDING' && (
            <div className="grid grid-cols-3 gap-1 bg-[#0B0E14] p-1 rounded-xl border border-[#222938]">
              <button
                type="button"
                onClick={() => setQrMode('dynamic')}
                className={`py-1.5 px-1.5 text-[10px] font-extrabold rounded-lg transition-all truncate ${
                  qrMode === 'dynamic'
                    ? 'bg-[#FACC15] text-[#0B0E14]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                QR ភ្ជាប់ប្រាក់
              </button>
              <button
                type="button"
                onClick={() => setQrMode('static')}
                className={`py-1.5 px-1.5 text-[10px] font-extrabold rounded-lg transition-all truncate ${
                  qrMode === 'static'
                    ? 'bg-[#FACC15] text-[#0B0E14]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                QR គណនីផ្ទាល់
              </button>
              <label className="cursor-pointer py-1.5 px-1.5 text-[10px] font-extrabold rounded-lg bg-[#003D6B] text-white hover:bg-[#004F8B] flex items-center justify-center gap-1 truncate">
                <Upload className="w-3 h-3 text-[#FACC15] shrink-0" />
                <span className="truncate">ដាក់រូប QR</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleDirectAbaQrUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {uploadSuccessMsg && (
            <div className="p-2 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-[10px] text-emerald-300 font-semibold text-center">
              {uploadSuccessMsg}
            </div>
          )}

          {/* Compact Authentic ABA KHQR Card */}
          {status === 'PENDING' && (
            <div className="max-w-[235px] mx-auto rounded-xl overflow-hidden shadow-lg bg-white text-[#111827] border border-slate-200">
              <div className="bg-[#E1232E] text-white py-1 px-3 flex items-center justify-between">
                <span className="font-black tracking-[0.18em] text-[11px]">KHQR</span>
                <span className="text-[10px] font-bold tabular-nums flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded">
                  <Clock className="w-2.5 h-2.5" />
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </span>
              </div>

              <div className="px-3.5 py-2 flex items-baseline justify-between border-b border-dashed border-slate-300">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none">
                    {merchantName}
                  </div>
                  <div className="text-lg font-black text-[#003D6B] tabular-nums leading-tight mt-0.5">
                    {formattedOrderAmount}
                  </div>
                </div>
                <div className="text-[11px] font-bold text-slate-500 tabular-nums">
                  {secondaryOrderAmount}
                </div>
              </div>

              <div className="p-2.5 flex flex-col items-center bg-white">
                <img
                  src={displayedQrUrl}
                  alt={`ABA KHQR Code for Order ${order.orderNumber}`}
                  className="w-36 h-36 sm:w-40 sm:h-40 object-contain"
                />
                <div className="mt-1 text-[10px] text-slate-500 font-bold tabular-nums truncate max-w-full">
                  ABA · {targetAccountNumber.replace(/\s+/g, '')} ({merchantName})
                </div>
              </div>
            </div>
          )}

          {/* ANDROID & iOS ONE-TAP ABA MOBILE LAUNCH BAR */}
          {status === 'PENDING' && (
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#002B4D] via-[#003D6B] to-[#0B1528] border border-[#FACC15]/80 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {/* Android Intent Button */}
                <button
                  type="button"
                  onClick={() => handleOpenAbaMobileApp(true)}
                  className="py-2 px-2.5 rounded-lg bg-gradient-to-r from-[#FACC15] to-[#F59E0B] text-[#0B0E14] font-black text-[11px] flex items-center justify-center gap-1.5 shadow-sm hover:brightness-105 active:scale-[0.99] transition-all"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">បើក ABA (Android)</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </button>

                {/* iOS / Direct Scheme Button */}
                <button
                  type="button"
                  onClick={() => handleOpenAbaMobileApp(false)}
                  className="py-2 px-2.5 rounded-lg bg-white text-[#003D6B] font-black text-[11px] flex items-center justify-center gap-1.5 shadow-sm hover:bg-slate-100 active:scale-[0.99] transition-all"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#E1232E] shrink-0" />
                  <span className="truncate">បើក ABA (iPhone)</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </button>
              </div>

              {/* Save / Share QR with Pre-set Amount */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSaveOrSharePreFilledQr('share')}
                  className="py-1.5 px-2 rounded-lg bg-[#0B0E14]/90 hover:bg-[#0B0E14] border border-sky-400/35 text-[10px] font-bold text-sky-200 flex items-center justify-center gap-1 transition-colors"
                >
                  <Share2 className="w-3 h-3 text-[#FACC15] shrink-0" />
                  <span className="truncate">Share QR ({formattedOrderAmount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveOrSharePreFilledQr('download')}
                  className="py-1.5 px-2 rounded-lg bg-[#0B0E14]/90 hover:bg-[#0B0E14] border border-sky-400/35 text-[10px] font-bold text-sky-200 flex items-center justify-center gap-1 transition-colors"
                >
                  <Download className="w-3 h-3 text-[#FACC15] shrink-0" />
                  <span className="truncate">ទាញយក QR ({formattedOrderAmount})</span>
                </button>
              </div>

              {abaLaunchAlertShown && (
                <div className="px-2.5 py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-400/50 text-[10px] text-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="leading-snug">
                    បានបើក ABA Mobile និងចម្លងលេខគណនី <strong>{targetAccountNumber}</strong> រួចរាល់!
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Compact Single-Line Account Numbers Box (Never wraps numbers onto 2 lines) */}
          <div className="border border-[#2A3241] rounded-xl p-2.5 bg-[#0B0E14] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] border-b border-[#1E2532] pb-1.5">
              <span className="text-slate-400">ឈ្មោះគណនី ABA:</span>
              <span className="font-extrabold text-white tracking-wide uppercase">
                {merchantName}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {/* USD Account */}
              <div
                className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-1.5 ${
                  order.currency === 'USD'
                    ? 'bg-[#131C2E] border-[#FACC15]/60'
                    : 'bg-[#121620] border-[#222938]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[9px] font-bold text-slate-400 leading-tight">
                    គណនីដុល្លារ ($)
                  </div>
                  <div className="text-xs font-extrabold text-[#FACC15] tabular-nums whitespace-nowrap">
                    {abaAccountUsd}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyAccount(abaAccountUsd, 'USD')}
                  className="px-2 py-1 text-[10px] font-bold rounded-md bg-[#0B0E14] text-white border border-[#2D384D] hover:border-[#FACC15] transition-colors inline-flex items-center gap-1 shrink-0"
                >
                  {copiedCurrency === 'USD' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <>
                      <Copy className="w-2.5 h-2.5 text-[#FACC15]" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* KHR Account */}
              <div
                className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-1.5 ${
                  order.currency === 'KHR'
                    ? 'bg-[#131C2E] border-[#FACC15]/60'
                    : 'bg-[#121620] border-[#222938]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[9px] font-bold text-slate-400 leading-tight">
                    គណនីប្រាក់រៀល (៛)
                  </div>
                  <div className="text-xs font-extrabold text-[#FACC15] tabular-nums whitespace-nowrap">
                    {abaAccountKhr}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyAccount(abaAccountKhr, 'KHR')}
                  className="px-2 py-1 text-[10px] font-bold rounded-md bg-[#0B0E14] text-white border border-[#2D384D] hover:border-[#FACC15] transition-colors inline-flex items-center gap-1 shrink-0"
                >
                  {copiedCurrency === 'KHR' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <>
                      <Copy className="w-2.5 h-2.5 text-[#FACC15]" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2 rounded-lg bg-red-950/60 border border-red-700/60 text-[11px] text-red-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {status !== 'PENDING' && (
            <div className="p-2.5 rounded-xl bg-[#0B0E14] border border-[#2A3241] flex items-center justify-center gap-2 text-xs font-bold">
              {status === 'PAID' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">បានបង់ប្រាក់តាម ABA PAY រួចរាល់!</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400">ប្រតិបត្តិការត្រូវបានបោះបង់ ឬផុតកំណត់</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* 3. STICKY BOTTOM ACTION FOOTER (Always reachable on mobile screens) */}
        {status === 'PENDING' && (
          <div className="shrink-0 px-3.5 py-2.5 bg-[#0B0E14] border-t border-[#262E3D] space-y-1.5">
            <button
              onClick={handleSimulateBakongAppScan}
              disabled={simulating}
              className="w-full py-2.5 px-3 text-xs font-extrabold text-[#0B0E14] bg-gradient-to-r from-[#FACC15] to-[#F59E0B] rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-1.5 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4 text-[#0B0E14] shrink-0" />
              <span className="truncate">
                {simulating
                  ? 'កំពុងផ្ទៀងផ្ទាត់ប្រតិបត្តិការ ABA...'
                  : `បញ្ជាក់ថាបានបង់ប្រាក់ (${formattedOrderAmount}) · ចេញវិក្កយបត្រ`}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleManualCheck}
                disabled={checking}
                className="py-1.5 px-2.5 text-[11px] font-bold text-sky-200 bg-[#131C2E] border border-sky-500/30 rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
                <span className="truncate">ពិនិត្យការបង់ប្រាក់</span>
              </button>

              <button
                onClick={handleCancel}
                className="py-1.5 px-2.5 text-[11px] font-bold text-red-400 bg-red-950/25 border border-red-500/25 hover:bg-red-950/40 rounded-lg transition-colors truncate"
              >
                បោះបង់ (Cancel)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
