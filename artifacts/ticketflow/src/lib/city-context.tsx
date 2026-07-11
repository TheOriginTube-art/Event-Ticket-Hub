import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "ticketflow-selected-city";

type CityContextValue = {
  city: string;
  setCity: (city: string) => void;
};

const CityContext = createContext<CityContextValue | undefined>(undefined);

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCityState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY) || "";
  });

  useEffect(() => {
    if (city) {
      window.localStorage.setItem(STORAGE_KEY, city);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [city]);

  const setCity = (next: string) => setCityState(next);

  return <CityContext.Provider value={{ city, setCity }}>{children}</CityContext.Provider>;
}

export function useCity(): CityContextValue {
  const ctx = useContext(CityContext);
  if (!ctx) {
    throw new Error("useCity must be used within a CityProvider");
  }
  return ctx;
}
