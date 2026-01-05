/**
 * React Query Configuration
 * 
 * Architecture Decision:
 * - Server state (Firestore data) için React Query kullanıyoruz
 * - Real-time subscriptions için onSnapshot'ı React Query ile entegre ediyoruz
 * - Cache ve background refetch otomatik yönetiliyor
 */

import { QueryClient } from "@tanstack/react-query";

/**
 * Default query client configuration
 * 
 * Stale time: 5 dakika (Firestore real-time olduğu için kısa tutuyoruz)
 * Cache time: 10 dakika (unused query'ler 10 dakika sonra temizlenir)
 * Retry: 3 kez (network hatalarında otomatik retry)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 dakika
      gcTime: 10 * 60 * 1000, // 10 dakika (eski cacheTime yerine)
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
      refetchOnWindowFocus: false, // Firestore real-time olduğu için window focus'ta refetch'e gerek yok
      refetchOnReconnect: true, // Network reconnect'te refetch
    },
    mutations: {
      retry: 1, // Mutation'larda sadece 1 kez retry
    },
  },
});

