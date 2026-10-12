import { createContext, useContext } from 'react'
import type { Options } from '../../../shared/options'

// The options loaded from Options/ by the main process. OptionsProvider only renders its
// children once they've arrived, so inside the app they're never missing
export const OptionsContext = createContext<Options | null>(null)

export function useOptions(): Options {
  const options = useContext(OptionsContext)
  if (!options) throw new Error('useOptions must be used inside <OptionsProvider>')
  return options
}
