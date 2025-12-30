import type React from 'react'
import type { FlexBasicElement } from './Flex/FlexBasicElement'

declare global {
  interface HTMLElementTagNameMap {
    'lobe-flex': FlexBasicElement
  }

  // If you want to use <lobe-flex> inside React/TSX without TS errors
  namespace JSX {
    interface IntrinsicElements {
      'lobe-flex': React.DetailedHTMLProps<
        React.HTMLAttributes<FlexBasicElement>,
        FlexBasicElement
      >
    }
  }
}

export {}
