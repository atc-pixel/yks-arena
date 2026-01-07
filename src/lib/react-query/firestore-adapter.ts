/**
 * Firestore React Query Adapter
 * 
 * Architecture Decision:
 * - Firestore onSnapshot real-time subscriptions'ı React Query ile entegre ediyoruz
 * - useQuery normalde promise-based, ama bizim real-time data'mız var
 * - Bu adapter onSnapshot'ı React Query cache'i ile sync ediyor
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DocumentSnapshot, QuerySnapshot } from "firebase/firestore";

/**
 * Real-time Firestore document subscription hook
 * 
 * React Query cache'i ile sync eder, aynı queryKey kullanıldığında cache'den döner
 */
export function useFirestoreQuery<T>(
  queryKey: string[],
  subscribeFn: (onNext: (data: T | null) => void) => () => void
) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<T | null>(() => {
    // Initial state: cache'den al (eğer varsa)
    return queryClient.getQueryData<T | null>(queryKey) ?? null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    let isMounted = true;

    // Subscribe to Firestore real-time updates
    const unsubscribe = subscribeFn((newData) => {
      if (!isMounted) return;
      
      try {
        // Update local state
        setData(newData);
        setLoading(false);

        // Update React Query cache
        queryClient.setQueryData(queryKey, newData);
      } catch (err) {
        if (!isMounted) return;
        console.error("useFirestoreQuery error:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey.join("-")]); // queryKey array dependency için string'e çevir

  return { data, loading, error };
}

/**
 * Real-time Firestore query subscription hook (collection queries)
 */
export function useFirestoreQueryCollection<T>(
  queryKey: string[],
  subscribeFn: (onNext: (data: T[]) => void) => () => void
) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<T[]>(() => {
    return queryClient.getQueryData<T[]>(queryKey) ?? [];
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeFn((newData) => {
      setData(newData);
      setLoading(false);
      queryClient.setQueryData(queryKey, newData);
    });

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey.join("-")]);

  return { data, loading, error };
}

