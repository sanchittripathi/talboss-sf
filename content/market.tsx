"use client";

import { createContext, useContext, type ReactNode } from "react";
import { copyFor, type Market } from "./site";

/** Which market's words the client components read. "/" = us, "/pune" = india. */
const MarketContext = createContext<Market>("us");

export function MarketProvider({ market, children }: { market: Market; children: ReactNode }) {
  return <MarketContext.Provider value={market}>{children}</MarketContext.Provider>;
}

export const useMarket = () => useContext(MarketContext);
export const useCopy = () => copyFor(useMarket());
