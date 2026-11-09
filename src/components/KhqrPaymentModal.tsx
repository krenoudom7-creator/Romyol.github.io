import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
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
  merchantAccount,
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
  // Default to Dynamic QR so the exact amount is pre-filled inside the KHQR code
  const [qrMode, setQrMode] = useState<'static' | 'dynamic' | 'custom'>('dynamic');
  const [uploadedQrDataUrl, setUploadedQrDataUrl] = useState<string>('');
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string>('');
  const [abaLaunchAlertShown, setAbaLaunchAlertShown] = useState<boolean>(false);

  const formattedOrderAmount =
    order.currency === 'KHR'
      ? formatKhr(order.totalKhr, true)
      : formatUsd(order.totalUsd);

  const targetAccountNumber =
    order.currency === 'KHR' ? abaAccountKhr : abaAccountUsd;

  const displayedQrUrl =
    qrMode === 'custom' && uploadedQrDataUrl
      ? uploadedQrDataUrl
      : qrMode === 'dynamic' && dynamicQrDataUrl
      ? dynamicQrDataUrl
      : staticQrDataUrl || qrDataUrl;

  const computedAbaDeepLink =
    abaDeepLink ||
    `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(
      order.khqrString || ''
    )}`;

  // Launch ABA Mobile app with pre-set amount (triggers native OS "Open in ABA Mobile?" alert)
  const handleOpenAbaMobileApp = useCallback(() => {
    setQrMode('dynamic');
    setAbaLaunchAlertShown(true);

    // Copy target account number to clipboard as a helpful assistant
    const cleanAcc = targetAccountNumber.replace(/\s+/g, '');
    navigator.clipboard.writeText(cleanAcc).catch(() => {});

    // Primary target URI: custom PayWay link if configured, otherwise Bakong shortLink or direct abamobilebank:// scheme
    const targetUri =
      abaPaywayLink && abaPaywayLink.startsWith('http')
        ? abaPaywayLink
        : bakongDeepLink && bakongDeepLink.startsWith('http')
        ? bakongDeepLink
        : computedAbaDeepLink;

    // Trigger deep link navigation via anchor click (safe inside iframe & mobile Safari/Chrome)
    const link = document.createElement('a');
    link.href = targetUri;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [abaPaywayLink, bakongDeepLink, computedAbaDeepLink, targetAccountNumber]);

  // Auto-trigger ABA Mobile Deep Link if customer clicked the "Open ABA Mobile" button in Cart
  useEffect(() => {
    if (autoTriggerAbaDeepLink && status === 'PENDING') {
      const timer = setTimeout(() => {
        handleOpenAbaMobileApp();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoTriggerAbaDeepLink, status, handleOpenAbaMobileApp]);

  // Download or Share Dynamic KHQR Image (with pre-set amount encoded in Tag 54)
  const handleSaveOrSharePreFilledQr = async () => {
    const qrSource = dynamicQrDataUrl || displayedQrUrl;
    if (!qrSource) return;

    try {
      const res = await fetch(qrSource);
      const blob = await res.blob();
      const fileName = `ABA-KHQR-${order.orderNumber}-${
        order.currency === 'KHR' ? `${order.totalKhr}KHR` : `$${order.totalUsd.toFixed(2)}`
      }.png`;
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
      // Fallback to direct download below
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
    setTimeout(() => setCopiedCurrency(null), 2500);
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
            ? 'បានអានកូដ EMVCo KHQR ពិតពីរូបភាព ABA Mobile របស់អ្នក និងរក្សាទុកជោគជ័យ!'
            : 'បានដាក់រូបភាព ABA QR ផ្ទាល់ខ្លួនរបស់អ្នករួចរាល់!'
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
          'មិនទាន់ទទួលបានប្រតិបត្តិការទូទាត់ពីកម្មវិធី ABA Mobile / KHQR នៅឡើយទេ។ សូមស្កេន QR Code ឬចុចប៊ូតុងផ្ទៀងផ្ទាត់ការបង់ប្រាក់ខាងក្រោម។'
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

  const renderStatusText = () => {
    switch (status) {
      case 'PENDING':
        return 'កំពុងរង់ចាំការស្កេន ឬទូទាត់តាម ABA Mobile';
      case 'PAID':
        return 'បានបង់ប្រាក់តាម ABA PAY រួចរាល់ (Verified)';
      case 'FAILED':
        return 'ការទូទាត់បរាជ័យ (Payment Failed)';
      case 'EXPIRED':
        return 'ផុតកំណត់ (QR Expired)';
      case 'CANCELLED':
        return 'បានបោះបង់ (Cancelled)';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#131722] text-white w-full max-w-md rounded-2xl border border-[#2A3241] shadow-2xl overflow-hidden my-6">
        {/* Official ABA PAY Navy Blue & Red Accent Header */}
        <div className="bg-gradient-to-r from-[#003D6B] via-[#005187] to-[#003D6B] border-b-2 border-[#E1232E] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 rounded-lg bg-white text-[#003D6B] font-black text-sm tracking-tight flex items-center gap-0.5 shadow-sm">
              <span>ABA</span>
              <span className="text-[#E1232E]">&apos;</span>
              <span className="text-xs font-extrabold ml-0.5">PAY</span>
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-wide text-white">
                ABA KHQR · {merchantName}
              </div>
              <div className="text-[11px] text-sky-200">
                ទូទាត់ប្រាក់រហ័សតាមកម្មវិធី ABA Mobile ឬស្កេន KHQR
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-lg transition-colors"
            aria-label="បិទ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* =================================================================
              ONE-TAP "OPEN ABA MOBILE TO PAY PRE-SET AMOUNT" BUTTON
             ================================================================= */}
          {status === 'PENDING' && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#002B4D] via-[#003D6B] to-[#0B1528] border-2 border-[#FACC15] shadow-[0_0_25px_rgba(250,204,21,0.2)] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-[#FACC15] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>ទូទាត់ផ្ទាល់លើទូរស័ព្ទ (One-Tap ABA Pay)</span>
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#E1232E] text-white text-[10px] font-black tracking-wider uppercase">
                  ចំនួនទឹកប្រាក់កំណត់ស្រេច
                </span>
              </div>

              <a
                href={computedAbaDeepLink}
                onClick={(e) => {
                  e.preventDefault();
                  handleOpenAbaMobileApp();
                }}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FACC15] via-[#FDE047] to-[#F59E0B] text-[#0B0E14] font-black text-xs sm:text-sm flex items-center justify-between gap-2 shadow-lg hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-1 rounded-lg bg-[#003D6B] text-white text-xs font-black tracking-tight shrink-0">
                    ABA<span className="text-[#E1232E]">&apos;</span>
                  </span>
                  <div className="text-left">
                    <div className="leading-tight">
                      ចុចបើក ABA Mobile ទូទាត់ឥឡូវនេះ
                    </div>
                    <div className="text-[10px] font-bold text-[#003D6B] leading-tight mt-0.5">
                      គណនី {merchantName} ({targetAccountNumber})
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 bg-[#0B0E14] text-[#FACC15] px-3 py-1.5 rounded-lg font-black text-sm tabular-nums">
                  <span>{formattedOrderAmount}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </div>
              </a>

              {/* Quick Share / Save Pre-Filled Dynamic QR for 1-Tap "Open QR" inside ABA Mobile */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleSaveOrSharePreFilledQr}
                  className="py-2 px-3 rounded-xl bg-[#0B0E14]/90 hover:bg-[#0B0E14] border border-sky-400/40 text-[11px] font-bold text-sky-200 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>បញ្ជូន QR ({formattedOrderAmount}) ទៅ ABA</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveOrSharePreFilledQr}
                  className="py-2 px-3 rounded-xl bg-[#0B0E14]/90 hover:bg-[#0B0E14] border border-sky-400/40 text-[11px] font-bold text-sky-200 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[#FACC15]" />
                  <span>រក្សាទុករូប QR ({formattedOrderAmount})</span>
                </button>
              </div>

              {abaLaunchAlertShown && (
                <div className="p-2.5 rounded-xl bg-emerald-950/90 border border-emerald-400/60 text-[11px] text-emerald-200 space-y-1 animate-fadeIn">
                  <div className="font-extrabold text-[#FACC15] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>
                      បានបើក Alert ចូលកម្មវិធី ABA Mobile និងចម្លងលេខគណនី ({targetAccountNumber}) រួចរាល់!
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-100/90 leading-relaxed">
                    • ប្រសិនបើទូរស័ព្ទលោតផ្ទាំងសួរ <strong>&ldquo;Open in ABA Mobile?&rdquo;</strong> សូមចុច <strong>Open</strong> ដើម្បីទូទាត់ចំនួន <strong>{formattedOrderAmount}</strong> តែម្ដង។
                    <br />• ឬចុច <strong>«រក្សាទុករូប QR ({formattedOrderAmount})»</strong> រួចចុចប៊ូតុង <strong>«បើក QR»</strong> ក្នុង ABA Scan នោះទឹកប្រាក់ <strong>{formattedOrderAmount}</strong> នឹងលោតចូលដោយស្វ័យប្រវត្តិ!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* QR Mode Selector Pills (Dynamic Pre-Set Amount vs Static vs Upload Real ABA Mobile QR) */}
          {status === 'PENDING' && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 bg-[#0B0E14] p-1.5 rounded-xl border border-[#222938]">
              <button
                type="button"
                onClick={() => setQrMode('dynamic')}
                className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  qrMode === 'dynamic'
                    ? 'bg-[#FACC15] text-[#0B0E14]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                QR កំណត់ប្រាក់ស្រេច ({formattedOrderAmount})
              </button>
              <button
                type="button"
                onClick={() => setQrMode('static')}
                className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  qrMode === 'static'
                    ? 'bg-[#FACC15] text-[#0B0E14]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                QR គណនីផ្ទាល់ (Static)
              </button>
              <label className="cursor-pointer px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-[#003D6B] text-white hover:bg-[#004F8B] inline-flex items-center gap-1">
                <Upload className="w-3 h-3 text-[#FACC15]" />
                <span>ដាក់រូប QR ពី ABA</span>
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
            <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-[11px] text-emerald-300 font-semibold text-center">
              {uploadSuccessMsg}
            </div>
          )}

          {/* Authentic ABA KHQR Standee Card */}
          {status === 'PENDING' && (
            <div className="max-w-[290px] mx-auto rounded-2xl overflow-hidden shadow-2xl bg-white text-[#111827] border border-slate-200">
              {/* Top Red KHQR Header Bar */}
              <div className="bg-[#E1232E] text-white py-2 px-4 text-center font-black tracking-[0.2em] text-sm">
                KHQR
              </div>

              {/* Merchant Name & Exact Order Amount */}
              <div className="px-5 pt-3.5 pb-2.5 text-left border-b border-dashed border-slate-300">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {merchantName}
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <div className="text-2xl font-black text-[#003D6B] tabular-nums">
                    {order.currency === 'KHR'
                      ? formatKhr(order.totalKhr, true)
                      : formatUsd(order.totalUsd)}
                  </div>
                  <div className="text-xs font-semibold text-slate-500 tabular-nums">
                    {order.currency === 'KHR'
                      ? formatUsd(order.totalUsd)
                      : formatKhr(order.totalKhr, true)}
                  </div>
                </div>
              </div>

              {/* QR Code Image */}
              <div className="p-3.5 flex flex-col items-center bg-white">
                <img
                  src={displayedQrUrl}
                  alt={`ABA KHQR Code for Order ${order.orderNumber}`}
                  className="w-48 h-48 object-contain"
                />
                <div className="mt-2 flex items-center justify-between w-full text-[11px] text-slate-500 font-semibold px-1">
                  <span className="truncate max-w-[175px]">ABA · {merchantAccount}</span>
                  <span className="tabular-nums text-[#E1232E] font-bold flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ABA Direct Account Numbers Box (Both USD $ and KHR ៛ for UDOM KREN) */}
          <div className="border border-[#2A3241] rounded-xl p-3.5 bg-[#0B0E14] space-y-2.5">
            <div className="flex items-center justify-between text-xs border-b border-[#1E2532] pb-2">
              <span className="text-slate-400">ឈ្មោះគណនី ABA (Account Name):</span>
              <span className="font-extrabold text-white tracking-wide uppercase">
                {merchantName}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* USD Account */}
              <div
                className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                  order.currency === 'USD'
                    ? 'bg-[#131C2E] border-[#FACC15]/60'
                    : 'bg-[#121620] border-[#222938]'
                }`}
              >
                <div>
                  <div className="text-[10px] font-bold text-slate-400">គណនីដុល្លារ ($)</div>
                  <div className="text-sm font-extrabold text-[#FACC15] tabular-nums tracking-wide">
                    {abaAccountUsd}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyAccount(abaAccountUsd, 'USD')}
                  className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-[#0B0E14] text-white border border-[#2D384D] hover:border-[#FACC15] transition-colors inline-flex items-center gap-1 shrink-0"
                >
                  {copiedCurrency === 'USD' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">ចម្លងរួច</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-[#FACC15]" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* KHR Account */}
              <div
                className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                  order.currency === 'KHR'
                    ? 'bg-[#131C2E] border-[#FACC15]/60'
                    : 'bg-[#121620] border-[#222938]'
                }`}
              >
                <div>
                  <div className="text-[10px] font-bold text-slate-400">គណនីប្រាក់រៀល (៛)</div>
                  <div className="text-sm font-extrabold text-[#FACC15] tabular-nums tracking-wide">
                    {abaAccountKhr}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyAccount(abaAccountKhr, 'KHR')}
                  className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-[#0B0E14] text-white border border-[#2D384D] hover:border-[#FACC15] transition-colors inline-flex items-center gap-1 shrink-0"
                >
                  {copiedCurrency === 'KHR' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">ចម្លងរួច</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-[#FACC15]" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Status Feedback Banner */}
          <div className="p-3 rounded-xl bg-[#0B0E14] border border-[#2A3241] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-medium text-white">
              {status === 'PENDING' && (
                <RefreshCw className={`w-4 h-4 text-[#FACC15] ${checking ? 'animate-spin' : ''}`} />
              )}
              {status === 'PAID' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {(status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED') && (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span>{renderStatusText()}</span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-950/60 border border-red-700/60 text-xs text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Helpful Explanation Note */}
          <div className="p-3 rounded-lg bg-[#0B0E14] border border-[#1E2532] text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-sky-400">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>របៀបទូទាត់ប្រាក់ដោយមិនបាច់វាយលេខទឹកប្រាក់៖</span>
            </div>
            <p>
              1. ចុចប៊ូតុងពណ៌មាស <strong className="text-[#FACC15]">«ចុចបើក ABA Mobile ទូទាត់ឥឡូវនេះ ({formattedOrderAmount})»</strong> ខាងលើ ដើម្បីឱ្យទូរស័ព្ទលោត Alert បើកចូលកម្មវិធី ABA Mobile ភ្លាមៗ។
              <br />
              2. ឬស្កេនកូដ <strong>QR កំណត់ប្រាក់ស្រេច ({formattedOrderAmount})</strong> នោះចំនួនទឹកប្រាក់នឹងលោតចូលក្នុង ABA Mobile ដោយស្វ័យប្រវត្តិ!
            </p>
          </div>

          {/* Action Controls */}
          {status === 'PENDING' && (
            <div className="space-y-2.5 pt-1">
              <button
                onClick={handleManualCheck}
                disabled={checking}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-gradient-to-r from-[#004269] to-[#005B8E] border border-sky-500/40 rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                <span>ពិនិត្យស្ថានភាពបង់ប្រាក់ ABA ឥឡូវនេះ</span>
              </button>

              <button
                onClick={handleSimulateBakongAppScan}
                disabled={simulating}
                className="w-full py-2.5 px-4 text-xs font-extrabold text-[#0B0E14] bg-gradient-to-r from-[#FACC15] to-[#F59E0B] rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 shadow-md"
              >
                <Smartphone className="w-4 h-4 text-[#0B0E14]" />
                <span>
                  {simulating
                    ? 'កំពុងផ្ទៀងផ្ទាត់ប្រតិបត្តិការ ABA...'
                    : 'បញ្ជាក់ថាបានបង់ប្រាក់តាម ABA រួចរាល់ (ចេញវិក្កយបត្រ)'}
                </span>
              </button>

              <button
                onClick={handleCancel}
                className="w-full py-2 px-4 text-xs font-medium text-red-400 hover:bg-red-950/40 rounded-xl transition-colors"
              >
                បោះបង់ការទូទាត់ (Cancel Payment)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
