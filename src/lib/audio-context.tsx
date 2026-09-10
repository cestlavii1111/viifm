"use client";

import { createContext, useContext } from "react";

/**
 * Shares the active AnalyserNode down into the R3F scene tree so any scene
 * component can read live frequency data inside its own useFrame loop
 * without prop drilling.
 */
const AnalyserContext = createContext<AnalyserNode | null>(null);

export const AnalyserProvider = AnalyserContext.Provider;

export function useAnalyser(): AnalyserNode | null {
  return useContext(AnalyserContext);
}
