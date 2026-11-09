import React from 'react';
import { Printer, Download, X, CheckCircle2, Coffee } from 'lucide-react';
import { Invoice, OrderLineItem, formatUsd, formatKhr } from '../types';

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
<title>វិក្កយបត្រ ${invoice.invoiceNumber} - វំយោលកាហ្វេ</title>
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  body { font-family: 'Kantumruy Pro', sans-serif; max-width: 480px; margin: 24px auto; padding: 24px; border: 1px solid #ddd; color: #111827; }
  .header { text-align: center; border-bottom: 1px dashed #999; padding-bottom: 16px; margin-bottom: 16px; }
  .title { font-size: 22px; font-weight: 700; margin: 0; }
  .meta { font-size: 13px; color: #555; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  th, td { padding: 8px 4px; text-align: left; border-bottom: 1px solid #eee; }
  th:last-child, td:last-child { text-align: right; }
  .totals { border-top: 1px dashed #999; padding-top: 12px; font-size: 14px; }
  .row { display: flex; justify-content: space-between; margin: 6px 0; }
  .grand { font-weight: 700; font-size: 16px; margin-top: 8px; }
</style>
</head>
<body>
  <div class="header">
    <p class="title">វំយោលកាហ្វេ (VOMYOL COFFEE)</p>
    <p class="meta">វិក្កយបត្រផ្លូវការ / Official Receipt</p>
    <p class="meta">លេខវិក្កយបត្រ: <strong>${invoice.invoiceNumber}</strong></p>
    <p class="meta">លេខការកម្មង់: ${invoice.orderNumber} · កាលបរិច្ឆេទ: ${formattedDate}</p>
    <p class="meta">អតិថិជន: ${invoice.customerName || 'អតិថិជនទូទៅ'}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>មុខម្ហូប</th>
        <th>ចំនួន</th>
        <th>តម្លៃរាយ</th>
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
          <div style="font-size:11px;color:#555;">
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
    <div class="row"><span>ការបញ្ចុះតម្លៃ (Discount):</span><span>-${formatUsd(invoice.discountUsd)}</span></div>
    <div class="row grand"><span>ទឹកប្រាក់ត្រូវបង់ (USD):</span><span>${formatUsd(invoice.totalUsd)}</span></div>
    <div class="row grand"><span>ទឹកប្រាក់ត្រូវបង់ (KHR):</span><span>${formatKhr(invoice.totalKhr, true)}</span></div>
    <div class="row"><span>ប្រភេទការទូទាត់:</span><span>${
      invoice.paymentMethod === 'ABA_KHQR'
        ? 'ABA PAY (ABA KHQR)'
        : invoice.paymentMethod === 'KHQR_BAKONG'
        ? 'KHQR Bakong'
        : invoice.paymentMethod
    }</span></div>
    <div class="row"><span>ស្ថានភាពការទូទាត់:</span><span>បានបង់ប្រាក់រួចរាល់ (${invoice.paymentStatus})</span></div>
    <div class="row"><span>លេខប្រតិបត្តិការ ABA / Bakong:</span><span>${invoice.bakongTransactionId}</span></div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNumber}-Vomyol-Coffee.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#131722] text-white w-full max-w-lg rounded-2xl border border-[#2A3241] shadow-2xl overflow-hidden my-8">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0B0E14] border-b border-[#2A3241]">
          <div className="flex items-center gap-2 text-sm font-bold text-[#FACC15]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>វិក្កយបត្រផ្លូវការ · {invoice.invoiceNumber}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
            aria-label="បិទ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Invoice Area (Clean white paper receipt for print compatibility) */}
        <div id="printable-invoice" className="p-6 sm:p-8 bg-white text-[#111827]">
          <div className="text-center border-b border-dashed border-slate-300 pb-5 mb-5">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#0B0E14] text-[#FACC15] mb-2">
              <Coffee className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[#111827]">
              វំយោលកាហ្វេ · VOMYOL COFFEE
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              កាហ្វេឆុងថ្មីៗតាមស្តង់ដារវិជ្ជាជីវៈ · រាជធានីភ្នំពេញ
            </p>
            <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-2 text-left text-xs">
              <div>
                <span className="text-slate-500">លេខវិក្កយបត្រ៖ </span>
                <span className="font-semibold tabular-nums text-[#111827]">
                  {invoice.invoiceNumber}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500">លេខកម្មង់៖ </span>
                <span className="font-semibold tabular-nums text-[#111827]">
                  {invoice.orderNumber}
                </span>
              </div>
              <div>
                <span className="text-slate-500">អតិថិជន៖ </span>
                <span className="font-medium text-[#111827]">
                  {invoice.customerName || 'អតិថិជនទូទៅ'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500">កាលបរិច្ឆេទ៖ </span>
                <span className="tabular-nums text-[#111827]">{formattedDate}</span>
              </div>
            </div>
          </div>

          <div className="mb-5">
            <table className="w-full text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs">
                  <th className="py-2 text-left font-medium">មុខម្ហូប</th>
                  <th className="py-2 text-center font-medium">ចំនួន</th>
                  <th className="py-2 text-right font-medium">តម្លៃក្នុងមួយមុខ</th>
                  <th className="py-2 text-right font-medium">សរុប</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((item, idx) => (
                  <tr key={`${item.menuItemId}-${idx}`} className="text-[#111827]">
                    <td className="py-2.5 pr-2">
                      <div className="font-medium">
                        {item.nameKh} {item.cupSize ? `(${item.cupSize})` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.nameEn}
                        {item.discountPercent > 0 ? ` · បញ្ចុះតម្លៃ ${item.discountPercent}%` : ''}
                        {item.sugarLevel ? ` · ស្ករ ${item.sugarLevel}` : ''}
                        {item.iceLevel ? ` · ${item.iceLevel}` : ''}
                        {item.toppings && item.toppings.length > 0
                          ? ` · +${item.toppings.join(', ')}`
                          : ''}
                      </div>
                    </td>
                    <td className="py-2.5 text-center tabular-nums font-medium">
                      x{item.quantity}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatUsd(item.discountedUnitPriceUsd)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-semibold">
                      {formatUsd(item.lineTotalUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-dashed border-slate-300 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-xs text-slate-500">
              <span>តម្លៃសរុបដើម (Subtotal)</span>
              <span className="tabular-nums">{formatUsd(invoice.subtotalUsd)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>ការបញ្ចុះតម្លៃសរុប (Discount)</span>
              <span className="tabular-nums">-{formatUsd(invoice.discountUsd)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-[#111827] pt-2 border-t border-slate-200">
              <span>ចំនួនប្រាក់ត្រូវបង់ (USD)</span>
              <span className="tabular-nums">{formatUsd(invoice.totalUsd)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-slate-600">
              <span>ចំនួនប្រាក់ត្រូវបង់ (KHR)</span>
              <span className="tabular-nums">{formatKhr(invoice.totalKhr, true)}</span>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-200 space-y-1 text-xs text-slate-500">
              <div className="flex justify-between">
                <span>ប្រភេទការទូទាត់៖</span>
                <span className="font-semibold text-[#003D6B]">
                  {invoice.paymentMethod === 'ABA_KHQR'
                    ? 'ABA PAY (ABA KHQR)'
                    : invoice.paymentMethod === 'KHQR_BAKONG'
                    ? 'KHQR Bakong'
                    : invoice.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between">
                <span>ស្ថានភាពការទូទាត់៖</span>
                <span className="font-semibold text-emerald-700">
                  បានបង់ប្រាក់រួចរាល់ ({invoice.paymentStatus})
                </span>
              </div>
              <div className="flex justify-between">
                <span>លេខប្រតិបត្តិការ ABA / Bakong៖</span>
                <span className="tabular-nums font-medium text-[#111827]">
                  {invoice.bakongTransactionId}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-dashed border-slate-300 text-center text-xs text-slate-500">
            សូមអរគុណសម្រាប់ការគាំទ្រ «វំយោលកាហ្វេ»! សូមអញ្ជើញមកពិសាម្ដងទៀត។
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 bg-[#0B0E14] border-t border-[#2A3241]">
          <button
            onClick={handleDownloadHtml}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1A202C] border border-[#2D3748] rounded-xl hover:bg-[#252D3D] transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 text-[#FACC15]" />
            <span>ទាញយកជា PDF / ឯកសារ</span>
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#0B0E14] bg-gradient-to-r from-[#FACC15] to-[#F59E0B] rounded-xl hover:brightness-105 transition-all whitespace-nowrap shrink-0"
          >
            <Printer className="w-4 h-4 text-[#0B0E14]" />
            <span>បោះពុម្ពវិក្កយបត្រ</span>
          </button>
        </div>
      </div>
    </div>
  );
};
