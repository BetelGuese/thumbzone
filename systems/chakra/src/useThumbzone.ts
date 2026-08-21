/** The React binding for the Chakra UI port, bound to its own adapter. */

import { createUseThumbzone } from '../../../shared/react/useThumbzone'
import { adapter } from './thumbzone'

export const useThumbzone = createUseThumbzone(adapter)
