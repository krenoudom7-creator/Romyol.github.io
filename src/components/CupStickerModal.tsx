import React from 'react';
import { Printer, X, Tag } from 'lucide-react';
import { Order, OrderLineItem } from '../types';

interface CupStickerModalProps {
  order: Order | null;
  onClose: () => void;
}

interface ExpandedCupSticker {
  cupIndex: number;
  totalCups: number;
  nameKh: string;
  nameEn: string;
  cupSize: string;
  sugarLevel: string;
  iceLevel: string;
  toppings: string[];
}

export const CupStickerModal: React.FC<CupStickerModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  let lineItems: OrderLineItem[] = [];
  try {
    lineItems = JSON.parse(order.itemsSummary);
  } catch {
    lineItems = [];
  }

  // Expand each quantity into an individual cup label (e.g. 1/3, 2/3, 3/3)
  const rawCups: Omit<ExpandedCupSticker, 'cupIndex' | 'totalCups'>[] = [];
  for (const item of lineItems) {
    const qty = Math.max(1, item.quantity || 1);
    for (let i = 0; i < qty; i++) {
      rawCups.push({
        nameKh: item.nameKh,
        nameEn: item.nameEn,
        cupSize: item.cupSize || 'M',
        sugarLevel: item.sugarLevel || '100%',
        iceLevel: item.iceLevel || 'ទឹកកកធម្មតា',
        toppings: item.toppings || [],
      });
    }
  }

  const totalCups = rawCups.length;
  const stickers: ExpandedCupSticker[] = rawCups.map((c, idx) => ({
    ...c,
    cupIndex: idx + 1,
    totalCups,
  }));

  const shortOrderQueue = order.orderNumber.split('-').pop() || order.orderNumber;
  const timeStr = new Date(order.createdAt).toLocaleTimeString('km-KH', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrintStickers = () => {
    const stickerHtml = `<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8" />
<title>ស្ទីគ័រកែវកាហ្វេ #${shortOrderQueue} - រំដួលកាហ្វេ</title>
<link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@500;700;800&display=swap" rel="stylesheet" />
<style>
  @page { size: 50mm 30mm; margin: 0; }
  body { font-family: 'Kantumruy Pro', sans-serif; margin: 0; padding: 8px; background: #fff; color: #000; }
  .sticker { width: 210px; border: 1.5px solid #000; border-radius: 6px; padding: 6px 8px; margin: 6px auto; page-break-after: always; box-sizing: border-box; }
  .top { display: flex; justify-content: space-between; align-items: center; font-size: 9px; font-weight: 800; border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 4px; }
  .drink { font-size: 12px; font-weight: 800; line-height: 1.25; }
  .opts { font-size: 9.5px; font-weight: 700; margin-top: 3px; line-height: 1.3; }
  .foot { display: flex; justify-content: space-between; font-size: 8.5px; margin-top: 4px; padding-top: 3px; border-top: 1px solid #ccc; font-weight: 700; }
</style>
</head>
<body>
  ${stickers
    .map(
      (s) => `<div class="sticker">
    <div class="top">
      <span>រំដួលកាហ្វេ · #${shortOrderQueue}</span>
      <span>កែវ ${s.cupIndex}/${s.totalCups}</span>
    </div>
    <div class="drink">${s.nameKh} (${s.cupSize})</div>
    <div class="opts">
      ស្ករ: ${s.sugarLevel} · ${s.iceLevel}
      ${s.toppings.length > 0 ? `<br/>+${s.toppings.join(', ')}` : ''}
    </div>
    <div class="foot">
      <span>${order.tableOrType}</span>
      <span>${timeStr}</span>
    </div>
  </div>`
    )
    .join('')}
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

    const blob = new Blob([stickerHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cup-Stickers-${order.orderNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3">
      <div className="rgb-modal text-white w-full max-w-[330px] max-h-[88dvh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5 bg-[#0B0E14]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#FACC15] truncate">
            <Tag className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
            <span className="truncate">
              ស្ទីគ័រติดកែវកាហ្វេ · #{shortOrderQueue} ({totalCups} កែវ)
            </span>
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

        {/* Stickers List */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 space-y-2.5 bg-[#11151F]">
          {stickers.map((s) => (
            <div
              key={s.cupIndex}
              className="bg-white text-[#0B0E14] rounded-xl p-3 border-2 border-[#FACC15] shadow-md space-y-1"
            >
              <div className="flex items-center justify-between text-[10px] font-extrabold border-b border-dashed border-slate-300 pb-1">
                <span className="text-[#002B5C]">រំដួលកាហ្វេ · កิว #{shortOrderQueue}</span>
                <span className="px-1.5 py-0.5 rounded bg-[#0B0E14] text-[#FACC15] tabular-nums">
                  កែវទី {s.cupIndex}/{s.totalCups}
                </span>
              </div>

              <div className="text-xs font-black text-[#0B0E14] pt-0.5">
                {s.nameKh} <span className="text-[#E1232E]">({s.cupSize})</span>
              </div>
              <div className="text-[10px] font-bold text-slate-700">
                ស្ករ៖ <span className="text-[#002B5C]">{s.sugarLevel}</span> · {s.iceLevel}
              </div>
              {s.toppings.length > 0 && (
                <div className="text-[10px] font-extrabold text-emerald-700">
                  + {s.toppings.join(', ')}
                </div>
              )}

              <div className="pt-1 mt-1 border-t border-slate-200 flex items-center justify-between text-[9px] font-bold text-slate-500">
                <span>{order.tableOrType}</span>
                <span className="tabular-nums">{timeStr}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="rgb-line shrink-0" />
        {/* Footer */}
        <div className="shrink-0 grid grid-cols-2 gap-2 px-3.5 py-2.5 bg-[#0B0E14]">
          <button
            type="button"
            onClick={() => window.print()}
            className="rgb-pill inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-bold text-white rounded-xl hover:brightness-110 transition-all"
          >
            <Printer className="w-3.5 h-3.5 text-[#FACC15]" />
            <span>ព្រីនភ្លាម</span>
          </button>
          <button
            type="button"
            onClick={handlePrintStickers}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-extrabold text-[#0B0E14] bg-gradient-to-r from-[#FACC15] to-[#F59E0B] rounded-xl hover:brightness-105 transition-all"
          >
            <Tag className="w-3.5 h-3.5 text-[#0B0E14]" />
            <span>ទាញយកស្ទីគ័រ (50x30mm)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
