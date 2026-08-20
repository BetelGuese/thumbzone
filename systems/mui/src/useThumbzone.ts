/** The React binding for the Material UI port, bound to its own adapter. */

import { createUseThumbzone } from '../../../shared/react/useThumbzone'
import { adapter } from './thumbzone'

export type { ThumbzoneRefObjects } from '../../../shared/react/useThumbzone'

export const useThumbzone = createUseThumbzone(adapter)
