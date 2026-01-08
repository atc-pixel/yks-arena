"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

type PromotionInfo = {
  qualifiesForPromotion: boolean;
  willDemote: boolean;
  willGoToTeneke: boolean;
};

type PromotionInfoProps = {
  promotionInfo: PromotionInfo | null;
};

/**
 * Promotion Info Component
 * 
 * Architecture Decision:
 * - Promotion/demotion durumlarını gösterir
 * - Component dumb kalır, logic hook'ta
 */
export function PromotionInfo({ promotionInfo }: PromotionInfoProps) {
  if (!promotionInfo) return null;

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="space-y-3"
    >
      {promotionInfo.qualifiesForPromotion && (
        <div className="rounded-2xl border-4 border-black bg-lime-400 p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-black" />
            <div>
              <div className="font-black uppercase text-black">Terfi Hakkı Kazandın! 🚀</div>
              <div className="mt-1 text-sm font-bold text-black/80">
                İlk 5'te olduğun için yukarı lige çıkacaksın.
              </div>
            </div>
          </div>
        </div>
      )}

      {promotionInfo.willDemote && (
        <div className="rounded-2xl border-4 border-black bg-orange-400 p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-3">
            <TrendingDown className="h-6 w-6 text-black" />
            <div>
              <div className="font-black uppercase text-black">Düşme Riski! ⚠️</div>
              <div className="mt-1 text-sm font-bold text-black/80">
                Son 5'te olduğun için aşağı lige düşeceksin.
              </div>
            </div>
          </div>
        </div>
      )}

      {promotionInfo.willGoToTeneke && (
        <div className="rounded-2xl border-4 border-black bg-red-400 p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-black" />
            <div>
              <div className="font-black uppercase text-black">Teneke Lige Gidiyorsun! 📦</div>
              <div className="mt-1 text-sm font-bold text-black/80">
                0 kupa ile tüm liglerden Teneke'ye düşülür.
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

