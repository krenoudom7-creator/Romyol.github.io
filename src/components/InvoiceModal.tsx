import React from 'react';
import { Printer, Download, X, CheckCircle2 } from 'lucide-react';
import { Invoice, OrderLineItem, formatUsd, formatKhr } from '../types';
import { ProductImage } from './ProductImage';

const ROMDOUL_LOGO_URL = '/src/assets/images/romdoul_caffee_logo_1794272922476.jpg';

interface InvoiceModalProps {
  invoice: Invoice | null;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ invoice, onClose }) => {
  if (!invoice) return null;

  let lineItems: OrderLineItem[] = [];
  try {
    lineItems = JSON.parse(invoice.itemsSummary);
  } catch {
    lineItems = [];
  }

  const formattedDate = new Date(invoice.issuedAt).toLocaleString('km-KH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8" />
<title>វិក្កយបត្រ ${invoice.invoiceNumber} - រំដួលកាហ្វេ (Romdoul Caffee)</title>
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  body { font-family: 'Kantumruy Pro', sans-serif; max-width: 310px; margin: 12px auto; padding: 14px; border: 1px solid #ddd; border-radius: 8px; color: #111827; font-size: 11px; }
  .header { text-align: center; border-bottom: 1px dashed #999; padding-bottom: 10px; margin-bottom: 10px; }
  .title { font-size: 15px; font-weight: 700; margin: 0; }
  .meta { font-size: 11px; color: #555; margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
  th, td { padding: 5px 2px; text-align: left; border-bottom: 1px solid #eee; }
  th:last-child, td:last-child { text-align: right; }
  .totals { border-top: 1px dashed #999; padding-top: 8px; font-size: 11px; }
  .row { display: flex; justify-content: space-between; margin: 4px 0; }
  .grand { font-weight: 700; font-size: 13px; margin-top: 6px; }
</style>
</head>
<body>
  <div class="header">
    <p class="title">រំដួលកាហ្វេ (ROMDOUL CAFFEE)</p>
    <p class="meta">វិក្កយបត្រផ្លូវការ / Official Receipt</p>
    <p class="meta">លេខបុង: <strong>${invoice.invoiceNumber}</strong></p>
    <p class="meta">លេខកម្មង់: ${invoice.orderNumber} · ${formattedDate}</p>
    <p class="meta">អតិថិជន: ${invoice.customerName || 'អតិថិជនទូទៅ'}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>មុខម្ហូប</th>
        <th>ចំនួន</th>
        <th>តម្លៃ</th>
        <th>សរុប</th>
      </tr>
    </thead>
    <tbody>
      ${lineItems
        .map(
          (item) => `<tr>
        <td>
          <strong>${item.nameKh}</strong>${item.cupSize ? ` (${item.cupSize})` : ''}${
            item.discountPercent > 0 ? ` (-${item.discountPercent}%)` : ''
          }
          <div style="font-size:10px;color:#555;">
            ${item.sugarLevel ? `ស្ករ: ${item.sugarLevel}` : ''}${
            item.iceLevel ? ` · ${item.iceLevel}` : ''
          }${item.toppings && item.toppings.length > 0 ? ` · +${item.toppings.join(', ')}` : ''}
          </div>
        </td>
        <td>x${item.quantity}</td>
        <td>$${item.discountedUnitPriceUsd.toFixed(2)}</td>
        <td>$${item.lineTotalUsd.toFixed(2)}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span>តម្លៃសរុប (Subtotal):</span><span>${formatUsd(invoice.subtotalUsd)}</span></div>
    <div class="row"><span>បញ្ចុះតម្លៃ (Discount):</span><span>-${formatUsd(invoice.discountUsd)}</span></div>
    <div class="row grand"><span>សរុបត្រូវបង់ (USD):</span><span>${formatUsd(invoice.totalUsd)}</span></div>
    <div class="row grand"><span>សរុបត្រូវបង់ (KHR):</span><span>${formatKhr(invoice.totalKhr, true)}</span></div>
    <div class="row"><span>ការទូទាត់:</span><span>${
      invoice.paymentMethod === 'ABA_KHQR'
        ? 'ABA PAY (ABA KHQR)'
        : invoice.paymentMethod === 'KHQR_BAKONG'
        ? 'KHQR Bakong'
        : invoice.paymentMethod
    }</span></div>
    <div class="row"><span>ស្ថានភាព:</span><span>បានបង់ប្រាក់រួច (${invoice.paymentStatus})</span></div>
    <div class="row"><span>លេខប្រតិបត្តិការ:</span><span>${invoice.bakongTransactionId}</span></div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNumber}-Romdoul-Caffee.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3">
      {/* Compact POS Thermal Receipt Modal (Small & Neatly Proportioned) */}
      <div className="rgb-modal text-white w-full max-w-[335px] max-h-[90dvh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Compact Top Action Bar */}
        <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5 bg-[#0B0E14]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#FACC15] truncate">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">បុងផ្លូវការ · {invoice.invoiceNumber}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors shrink-0"
            aria-label="បិទ"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="rgb-line shrink-0" />

        {/* Printable Compact Receipt Area */}
        <div
          id="printable-invoice"
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 bg-white text-[#111827]"
        >
          {/* Compact Store Header */}
          <div className="text-center border-b border-dashed border-slate-300 pb-2.5 mb-2.5">
            <div className="inline-flex items-center justify-center p-0.5 rounded-full rgb-logo-ring mb-1">
              <ProductImage
                src={ROMDOUL_LOGO_URL}
                alt="Romdoul Caffee Logo"
                className="w-9 h-9 rounded-full object-cover"
              />
            </div>
            <h2 className="text-base font-extrabold tracking-tight text-[#111827] leading-snug">
              រំដួលកាហ្វេ · ROMDOUL CAFFEE
            </h2>
            <p className="text-[10px] text-slate-500">
              កាហ្វេឆុងថ្មីៗតាមស្តង់ដារវិជ្ជាជីវៈ · ភ្នំពេញ
            </p>
            <div className="mt-2 pt-2 border-t border-slate-200 grid grid-cols-2 gap-1 text-left text-[10px]">
              <div className="truncate">
                <span className="text-slate-500">លេខបុង៖ </span>
                <span className="font-bold tabular-nums text-[#111827]">
                  {invoice.invoiceNumber}
                </span>
              </div>
              <div className="text-right truncate">
                <span className="text-slate-500">កម្មង់៖ </span>
                <span className="font-bold tabular-nums text-[#111827]">
                  {invoice.orderNumber}
                </span>
              </div>
              <div className="truncate">
                <span className="text-slate-500">អតិថិជន៖ </span>
                <span className="font-semibold text-[#111827]">
                  {invoice.customerName || 'អតិថិជនទូទៅ'}
                </span>
              </div>
              <div className="text-right truncate">
                <span className="tabular-nums text-slate-600">{formattedDate}</span>
              </div>
            </div>
          </div>

          {/* Compact Line Items Table */}
          <div className="mb-2.5">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[10px]">
                  <th className="py-1 text-left font-medium">មុខម្ហូប</th>
                  <th className="py-1 text-center font-medium">ចំនួន</th>
                  <th className="py-1 text-right font-medium">តម្លៃ</th>
                  <th className="py-1 text-right font-medium">សរុប</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((item, idx) => (
                  <tr key={`${item.menuItemId}-${idx}`} className="text-[#111827]">
                    <td className="py-1.5 pr-1.5">
                      <div className="font-bold leading-snug">
                        {item.nameKh} {item.cupSize ? `(${item.cupSize})` : ''}
                      </div>
                      <div className="text-[9px] text-slate-500 leading-tight">
                        {item.nameEn}
                        {item.discountPercent > 0 ? ` · -${item.discountPercent}%` : ''}
                        {item.sugarLevel ? ` · ស្ករ ${item.sugarLevel}` : ''}
                        {item.iceLevel ? ` · ${item.iceLevel}` : ''}
                        {item.toppings && item.toppings.length > 0
                          ? ` · +${item.toppings.join(', ')}`
                          : ''}
                      </div>
                    </td>
                    <td className="py-1.5 text-center tabular-nums font-semibold">
                      x{item.quantity}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatUsd(item.discountedUnitPriceUsd)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-bold">
                      {formatUsd(item.lineTotalUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Compact Totals Section */}
          <div className="border-t border-dashed border-slate-300 pt-2.5 space-y-1 text-[11px]">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>តម្លៃសរុបដើម (Subtotal)</span>
              <span className="tabular-nums">{formatUsd(invoice.subtotalUsd)}</span>
            </div>
            {invoice.discountUsd > 0 && (
              <div className="flex justify-between text-[10px] text-emerald-700 font-medium">
                <span>ការបញ្ចុះតម្លៃសរុប (Discount)</span>
                <span className="tabular-nums">-{formatUsd(invoice.discountUsd)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs font-extrabold text-[#111827] pt-1.5 border-t border-slate-200">
              <span>ប្រាក់ត្រូវបង់ (USD)</span>
              <span className="tabular-nums text-sm">{formatUsd(invoice.totalUsd)}</span>
            </div>
            <div className="flex justify-between text-[11px] font-bold text-slate-700">
              <span>ប្រាក់ត្រូវបង់ (KHR)</span>
              <span className="tabular-nums">{formatKhr(invoice.totalKhr, true)}</span>
            </div>

            <div className="pt-2 mt-1.5 border-t border-slate-200 space-y-0.5 text-[10px] text-slate-500">
              <div className="flex justify-between">
                <span>ការទូទាត់៖</span>
                <span className="font-bold text-[#003D6B]">
                  {invoice.paymentMethod === 'ABA_KHQR'
                    ? 'ABA PAY (ABA KHQR)'
                    : invoice.paymentMethod === 'KHQR_BAKONG'
                    ? 'KHQR Bakong'
                    : invoice.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between">
                <span>ស្ថានភាព៖</span>
                <span className="font-bold text-emerald-700">
                  បានបង់ប្រាក់រួច ({invoice.paymentStatus})
                </span>
              </div>
              <div className="flex justify-between">
                <span>លេខប្រតិបត្តិការ៖</span>
                <span className="tabular-nums font-semibold text-[#111827]">
                  {invoice.bakongTransactionId}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-dashed border-slate-300 text-center text-[10px] text-slate-500 leading-snug">
            សូមអរគុណសម្រាប់ការគាំទ្រ «រំដួលកាហ្វេ»!
          </div>
        </div>

        <div className="rgb-line shrink-0" />
        {/* Compact Footer Action Buttons */}
        <div className="shrink-0 grid grid-cols-2 gap-2 px-3.5 py-2.5 bg-[#0B0E14]">
          <button
            onClick={handleDownloadHtml}
            className="rgb-pill inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-bold text-white rounded-xl hover:brightness-110 transition-all whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
            <span>ទាញយក PDF</span>
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-extrabold text-[#0B0E14] bg-gradient-to-r from-[#FACC15] to-[#F59E0B] rounded-xl hover:brightness-105 transition-all whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 text-[#0B0E14] shrink-0" />
            <span>ព្រីនបុង</span>
          </button>
        </div>
      </div>
    </div>
  );
};
