import React, { useState, useMemo } from 'react';
import { X, Plus, Minus, Check, Coffee, Sparkles } from 'lucide-react';
import {
  MenuItem,
  CupSizeCode,
  CurrencyCode,
  CUP_SIZE_OPTIONS,
  SUGAR_LEVEL_OPTIONS,
  ICE_LEVEL_OPTIONS,
  TOPPING_OPTIONS,
  formatUsd,
  formatKhr,
  getDiscountedPrice,
} from '../types';
import { ProductImage } from './ProductImage';

interface DrinkCustomizationModalProps {
  item: MenuItem | null;
  currency: CurrencyCode;
  onClose: () => void;
  onConfirmAddToCart: (params: {
    item: MenuItem;
    quantity: number;
    cupSize: CupSizeCode;
    sugarLevel: string;
    iceLevel: string;
    toppings: string[];
    extraPriceUsd: number;
  }) => void;
}

export const DrinkCustomizationModal: React.FC<DrinkCustomizationModalProps> = ({
  item,
  currency,
  onClose,
  onConfirmAddToCart,
}) => {
  const [cupSize, setCupSize] = useState<CupSizeCode>('M');
  const [sugarLevel, setSugarLevel] = useState<string>('75%');
  const [iceLevel, setIceLevel] = useState<string>('ទឹកកកធម្មតា');
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1);

  const isBakery = item?.categoryId === 'cat_default_bakery';

  const pricing = useMemo(() => {
    if (!item) return { baseDiscounted: 0, extraPriceUsd: 0, unitFinalUsd: 0, totalUsd: 0 };
    const baseDiscounted = getDiscountedPrice(item.priceUsd, item.discountPercent);
    const sizeObj = CUP_SIZE_OPTIONS.find((s) => s.code === cupSize);
    const sizeExtra = isBakery ? 0 : sizeObj ? sizeObj.extraUsd : 0;
    const toppingsExtra = isBakery
      ? 0
      : selectedToppings.reduce((sum, label) => {
          const found = TOPPING_OPTIONS.find((t) => t.labelKh === label);
          return sum + (found ? found.priceUsd : 0);
        }, 0);

    const extraPriceUsd = Number((sizeExtra + toppingsExtra).toFixed(2));
    const unitFinalUsd = Number((baseDiscounted + extraPriceUsd).toFixed(2));
    const totalUsd = Number((unitFinalUsd * quantity).toFixed(2));

    return {
      baseDiscounted,
      extraPriceUsd,
      unitFinalUsd,
      totalUsd,
    };
  }, [item, cupSize, selectedToppings, quantity, isBakery]);

  if (!item) return null;

  const formatDisplay = (usd: number) => (currency === 'USD' ? formatUsd(usd) : formatKhr(usd));

  const toggleTopping = (labelKh: string) => {
    setSelectedToppings((prev) =>
      prev.includes(labelKh) ? prev.filter((t) => t !== labelKh) : [...prev, labelKh]
    );
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmAddToCart({
      item,
      quantity,
      cupSize: isBakery ? 'S' : cupSize,
      sugarLevel: isBakery ? 'ធម្មតា' : sugarLevel,
      iceLevel: isBakery ? 'ធម្មតា' : iceLevel,
      toppings: isBakery ? [] : selectedToppings,
      extraPriceUsd: pricing.extraPriceUsd,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="rgb-modal text-white w-full max-w-lg rounded-2xl overflow-hidden my-6">
        {/* Header with Product Image & Title */}
        <div className="relative h-44 bg-[#0B0E14]">
          <ProductImage
            src={item.imageUrl}
            alt={item.nameKh}
            className="w-full h-full object-cover brightness-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131722] via-black/40 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-black/65 text-white hover:text-[#FACC15] flex items-center justify-center border border-white/15"
            aria-label="បិទ"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#FACC15] text-[#0B0E14] text-[11px] font-extrabold mb-1">
                <Coffee className="w-3 h-3" />
                ជ្រើសរើសរសជាតិតាមចំណូលចិត្ត
              </span>
              <h3 className="text-lg font-extrabold text-white leading-tight">{item.nameKh}</h3>
              <p className="text-xs text-slate-300">{item.nameEn}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-extrabold text-[#FACC15] tabular-nums">
                {formatDisplay(pricing.baseDiscounted)}
              </div>
              <div className="text-[11px] text-slate-300 tabular-nums">
                {currency === 'USD'
                  ? formatKhr(pricing.baseDiscounted)
                  : formatUsd(pricing.baseDiscounted)}
              </div>
            </div>
          </div>
        </div>
        <div className="rgb-line" />

        {/* Customization Form */}
        <form onSubmit={handleConfirm} className="p-5 space-y-5 max-h-[68vh] overflow-y-auto">
          {!isBakery && (
            <>
              {/* 1. Cup Size Selection */}
              <div>
                <label className="block text-xs font-bold text-[#FACC15] mb-2">
                  ១. ជ្រើសរើសទំហំកែវ (Cup Size)
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {CUP_SIZE_OPTIONS.map((sz) => {
                    const active = cupSize === sz.code;
                    return (
                      <button
                        key={sz.code}
                        type="button"
                        onClick={() => setCupSize(sz.code)}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-0.5 ${
                          active
                            ? 'rgb-card-dark text-[#FACC15]'
                            : 'bg-[#0B0E14] border border-[#262E3D] text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <span>{sz.labelKh}</span>
                        <span className="text-[11px] tabular-nums text-slate-400">
                          {sz.extraUsd > 0 ? `+${formatUsd(sz.extraUsd)}` : 'តម្លៃដើម'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Sugar Level Selection */}
              <div>
                <label className="block text-xs font-bold text-[#FACC15] mb-2">
                  ២. កម្រិតជាតិស្ករ (Sugar Level)
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {SUGAR_LEVEL_OPTIONS.map((lvl) => {
                    const active = sugarLevel === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setSugarLevel(lvl)}
                        className={`py-2 px-2 rounded-xl border text-xs font-bold tabular-nums transition-all ${
                          active
                            ? 'bg-[#FACC15] border-[#FACC15] text-[#0B0E14]'
                            : 'bg-[#0B0E14] border-[#262E3D] text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Ice Level Selection */}
              <div>
                <label className="block text-xs font-bold text-[#FACC15] mb-2">
                  ៣. កម្រិតទឹកកក ឬក្ដៅ (Ice / Temperature)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ICE_LEVEL_OPTIONS.map((ice) => {
                    const active = iceLevel === ice;
                    return (
                      <button
                        key={ice}
                        type="button"
                        onClick={() => setIceLevel(ice)}
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all text-left flex items-center justify-between ${
                          active
                            ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15]'
                            : 'bg-[#0B0E14] border-[#262E3D] text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <span>{ice}</span>
                        {active && <Check className="w-3.5 h-3.5 text-[#FACC15]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Toppings / Add-ons */}
              <div>
                <label className="block text-xs font-bold text-[#FACC15] mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>៤. បន្ថែមគ្រឿងបន្ថែម (Toppings & Extra)</span>
                </label>
                <div className="space-y-2">
                  {TOPPING_OPTIONS.map((top) => {
                    const selected = selectedToppings.includes(top.labelKh);
                    return (
                      <button
                        key={top.id}
                        type="button"
                        onClick={() => toggleTopping(top.labelKh)}
                        className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between ${
                          selected
                            ? 'bg-emerald-950/50 border-emerald-500/70 text-emerald-300'
                            : 'bg-[#0B0E14] border-[#262E3D] text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              selected
                                ? 'bg-emerald-500 border-emerald-500 text-black'
                                : 'border-slate-600'
                            }`}
                          >
                            {selected && <Check className="w-3 h-3" />}
                          </span>
                          <span>{top.labelKh}</span>
                        </span>
                        <span className="tabular-nums font-bold text-[#FACC15]">
                          +{formatUsd(top.priceUsd)} ({formatKhr(top.priceUsd)})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Quantity & Confirm Footer */}
          <div className="pt-4 border-t border-[#262E3D] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-300">ចំនួនកែវ/ចាន៖</span>
              <div className="inline-flex items-center border border-[#2A3241] rounded-xl bg-[#0B0E14]">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-white hover:bg-[#1C2230] rounded-l-xl"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-4 text-sm font-extrabold tabular-nums text-[#FACC15]">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-3 py-2 text-white hover:bg-[#1C2230] rounded-r-xl"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto flex-1 py-3 px-5 text-xs sm:text-sm font-extrabold text-[#0B0E14] bg-gradient-to-r from-[#FACC15] to-[#F59E0B] rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span>
                ដាក់ចូលកន្ត្រក · {formatUsd(pricing.totalUsd)} ({formatKhr(pricing.totalUsd)})
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
