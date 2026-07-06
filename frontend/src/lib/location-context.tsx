'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getRestaurants, type Restaurant, type Branch } from './api';

const REST_KEY = 'foodaudit.selectedRestaurantId';
const BRANCH_KEY = 'foodaudit.selectedBranchId';

interface LocationContextValue {
  restaurants: Restaurant[];
  loading: boolean;
  selectedRestaurantId: string;
  selectedBranchId: string;
  selectedRestaurant?: Restaurant;
  selectedBranch?: Branch;
  setSelectedRestaurantId: (id: string) => void;
  setSelectedBranchId: (id: string) => void;
  reload: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRestaurantId, setSelectedRestaurantIdState] = useState('');
  const [selectedBranchId, setSelectedBranchIdState] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRestaurants();
      setRestaurants(data);
    } catch {
      // silently retry on next view; UI shows empty-state instead
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const r = localStorage.getItem(REST_KEY) || '';
    const b = localStorage.getItem(BRANCH_KEY) || '';
    setSelectedRestaurantIdState(r);
    setSelectedBranchIdState(b);
    reload();
  }, [reload]);

  // If the saved restaurant/branch no longer exists once data loads, clear it
  useEffect(() => {
    if (loading) return;
    if (selectedRestaurantId && !restaurants.find(r => r.id === selectedRestaurantId)) {
      setSelectedRestaurantId('');
    }
  }, [loading, restaurants]); // eslint-disable-line react-hooks/exhaustive-deps

  function setSelectedRestaurantId(id: string) {
    setSelectedRestaurantIdState(id);
    localStorage.setItem(REST_KEY, id);
    // switching restaurant invalidates the previously-selected branch
    setSelectedBranchIdState('');
    localStorage.removeItem(BRANCH_KEY);
  }

  function setSelectedBranchId(id: string) {
    setSelectedBranchIdState(id);
    localStorage.setItem(BRANCH_KEY, id);
  }

  const selectedRestaurant = restaurants.find(r => r.id === selectedRestaurantId);
  const selectedBranch = selectedRestaurant?.branches.find(b => b.id === selectedBranchId);

  return (
    <LocationContext.Provider value={{
      restaurants, loading,
      selectedRestaurantId, selectedBranchId,
      selectedRestaurant, selectedBranch,
      setSelectedRestaurantId, setSelectedBranchId,
      reload,
    }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within a LocationProvider');
  return ctx;
}
