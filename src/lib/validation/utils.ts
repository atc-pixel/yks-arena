/**
 * Validation Utilities
 * 
 * Safe parse helper'ları burada. Firestore'dan gelen data'yı 
 * validate ederken try-catch ve safe parse kullanıyoruz.
 * 
 * Architecture Decision:
 * - Production'da invalid data gelirse error log'layıp null döneriz
 * - Development'da console.error ile detaylı bilgi veririz
 * - Bu sayede uygulama crash olmaz, sadece o data null olur
 */

import { z } from "zod";
import type { ZodSchema } from "zod";

/**
 * Safe parse wrapper - error handling ile
 * Invalid data gelirse null döner, valid data gelirse parse edilmiş data döner
 * 
 * Architecture Decision:
 * - Boş object'ler (emulator'da data yokken) sessizce ignore edilir
 * - Gerçek validation hataları log'lanır
 */
export function safeParse<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context?: string
): T | null {
  // Boş object veya null check - emulator'da data yokken sessizce ignore
  if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
    return null;
  }

  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  // Invalid data - log error (sadece gerçek validation hataları)
  const contextMsg = context ? `[${context}] ` : "";
  
  // Development'da daha detaylı log (production'da sadece error count)
  if (process.env.NODE_ENV === "development") {
    console.warn(
      `${contextMsg}Validation failed (${result.error.issues.length} issues):`,
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
    );
    console.warn("Invalid data:", data);
  } else {
    // Production'da sadece count log'la (noisy olmasın)
    console.warn(`${contextMsg}Validation failed: ${result.error.issues.length} issues`);
  }

  return null;
}

/**
 * Strict parse - error fırlatır (API input validation için)
 * Invalid input gelirse exception fırlatır, bu durumda UI'da error gösterilir
 */
export function strictParse<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  const contextMsg = context ? `[${context}] ` : "";
  const errorMsg = `${contextMsg}Validation failed: ${result.error.issues.map(e => e.message).join(", ")}`;
  
  throw new Error(errorMsg);
}

