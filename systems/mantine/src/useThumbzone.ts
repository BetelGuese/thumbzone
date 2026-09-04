/** The React binding for the Mantine port, bound to its own adapter. */

import { createUseThumbzone } from '../../../shared/react/useThumbzone'
import { adapter } from './thumbzone'

export const useThumbzone = createUseThumbzone(adapter)
