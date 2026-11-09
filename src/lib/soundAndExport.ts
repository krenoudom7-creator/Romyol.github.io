import { Order, ExpenseRecord, OrderLineItem, formatUsd, formatKhr } from '../types';

/**
 * Plays a pleasant two-tone coffee shop bell chime using the Web Audio API
 */
export function playOrderNotificationSound(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.28, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(880, now, 0.35); // A5
    playTone(1174.66, now + 0.16, 0.55); // D6
  } catch {
    // Ignore audio context restrictions if user hasn't interacted yet
  }
}

/**
 * Exports Orders to a UTF-8 BOM CSV file compatible with Microsoft Excel (supports Khmer Unicode)
 */
export function exportOrdersToExcelCsv(orders: Order[]): void {
  const headers = [
    'លេខកម្មង់ (Order No)',
    'លេខវិក្កយបត្រ (Invoice No)',
    'កាលបរិច្ឆេទ (Date)',
    'អតិថិជន (Customer)',
    'លេខទូរស័ព្ទ (Phone)',
    'តុ/ប្រភេទ (Table/Type)',
    'មុខម្ហូប (Items)',
    'តម្លៃដើម (Subtotal USD)',
    'បញ្ចុះតម្លៃ (Discount USD)',
    'សរុប (Total USD)',
    'សរុបរៀល (Total KHR)',
    'ស្ថានភាពបង់ប្រាក់ (Payment)',
    'ស្ថានភាពកម្មង់ (Order Status)',
    'លេខប្រតិបត្តិការ Bakong',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = orders.map((o) => {
    let itemsLabel = '';
    try {
      const lines: OrderLineItem[] = JSON.parse(o.itemsSummary);
      itemsLabel = lines
        .map(
          (l) =>
            `${l.nameKh}${l.cupSize ? ` (${l.cupSize})` : ''} x${l.quantity}${
              l.sugarLevel ? ` [ស្ករ ${l.sugarLevel}]` : ''
            }`
        )
        .join('; ');
    } catch {
      itemsLabel = '';
    }

    return [
      o.orderNumber,
      o.invoiceNumber,
      new Date(o.createdAt).toLocaleString('km-KH'),
      o.customerName,
      o.customerPhone,
      o.tableOrType,
      itemsLabel,
      o.subtotalUsd.toFixed(2),
      o.discountUsd.toFixed(2),
      o.totalUsd.toFixed(2),
      o.totalKhr,
      o.paymentStatus,
      o.orderStatus,
      o.bakongTransactionId,
    ]
      .map(escapeCsv)
      .join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Vomyol-Coffee-Sales-Report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports Daily Expenses & Profit Summary to UTF-8 BOM CSV for Excel
 */
export function exportExpensesToExcelCsv(expenses: ExpenseRecord[]): void {
  const headers = [
    'កាលបរិច្ឆេទចំណាយ (Date)',
    'បរិយាយចំណាយ (Title)',
    'ប្រភេទចំណាយ (Category)',
    'ទឹកប្រាក់ដុល្លារ (USD)',
    'ទឹកប្រាក់រៀល (KHR)',
    'ចំណាំ (Note)',
  ];

  const escapeCsv = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = expenses.map((ex) =>
    [
      ex.expenseDate,
      ex.titleKh,
      ex.category,
      ex.amountUsd.toFixed(2),
      ex.amountKhr,
      ex.note,
    ]
      .map(escapeCsv)
      .join(',')
  );

  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Vomyol-Coffee-Expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads/prints the Shift Closing Report (របាយការណ៍បិទបញ្ជីប្រចាំថ្ងៃ)
 */
export function downloadShiftClosingReportHtml(params: {
  dateStr: string;
  paidOrdersCount: number;
  unpaidOrdersCount: number;
  grossRevenueUsd: number;
  totalExpensesUsd: number;
  netProfitUsd: number;
  adminName: string;
}): void {
  const html = `<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8" />
<title>របាយការណ៍បិទបញ្ជីប្រចាំថ្ងៃ - វំយោលកាហ្វេ (${params.dateStr})</title>
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  body { font-family: 'Kantumruy Pro', sans-serif; max-width: 520px; margin: 24px auto; padding: 28px; border: 1px solid #cbd5e1; color: #0f172a; }
  h1 { font-size: 20px; margin: 0 0 4px 0; text-align: center; }
  .sub { font-size: 13px; color: #475569; text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #94a3b8; padding-bottom: 14px; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .net { font-weight: 700; font-size: 16px; border-top: 2px solid #0f172a; margin-top: 10px; padding-top: 12px; }
</style>
</head>
<body>
  <h1>វំយោលកាហ្វេ (VOMYOL COFFEE)</h1>
  <div class="sub">
    <div><strong>របាយការណ៍បិទបញ្ជីប្រចាំថ្ងៃ (Shift Closing Report)</strong></div>
    <div>កាលបរិច្ឆេទ៖ ${params.dateStr} · អ្នកគ្រប់គ្រង៖ ${params.adminName}</div>
  </div>
  <div class="row"><span>ការកម្មង់បានបង់ប្រាក់រួច (Paid Orders):</span><strong>${params.paidOrdersCount} កម្មង់</strong></div>
  <div class="row"><span>ការកម្មង់មិនទាន់បង់ប្រាក់ (Unpaid/Pending):</span><span>${params.unpaidOrdersCount} កម្មង់</span></div>
  <div class="row"><span>ចំណូលលក់សរុប (Gross Revenue):</span><strong>${formatUsd(params.grossRevenueUsd)} (${formatKhr(params.grossRevenueUsd)})</strong></div>
  <div class="row"><span>ចំណាយប្រតិបត្តិការសរុប (Total Expenses):</span><strong>-${formatUsd(params.totalExpensesUsd)} (${formatKhr(params.totalExpensesUsd)})</strong></div>
  <div class="row net"><span>ប្រាក់ចំណេញសុទ្ធ (Net Profit):</span><span>${formatUsd(params.netProfitUsd)} (${formatKhr(params.netProfitUsd)})</span></div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Vomyol-Shift-Closing-${params.dateStr}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
