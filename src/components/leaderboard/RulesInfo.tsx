"use client";

import { motion } from "framer-motion";

/**
 * Rules Info Component
 * 
 * Architecture Decision:
 * - Liderlik tablosu kurallarını gösterir
 * - Static content, component dumb kalır
 */
export function RulesInfo() {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="rounded-3xl border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="mb-3 text-lg font-black uppercase text-black">Kurallar</div>
      <ul className="space-y-2 text-sm font-bold text-black/80">
        <li className="flex items-start gap-2">
          <span className="text-black">•</span>
          <span>İlk 5 sıra: Yukarı lige terfi eder</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-black">•</span>
          <span>Son 5 sıra: Aşağı lige düşer (Bronz hariç)</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-black">•</span>
          <span>0 kupa: Tüm liglerden Teneke’ye düşülür</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-black">•</span>
          <span>Haftalık sıfırlama: Her Pazar 23:59</span>
        </li>
      </ul>
    </motion.div>
  );
}
