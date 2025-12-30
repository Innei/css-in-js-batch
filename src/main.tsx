/* eslint-disable @typescript-eslint/ban-ts-comment */
import { StrictMode } from 'react'
// @ts-ignore
import { createRoot } from 'react-dom/profiling'
import './index.css'
import App from './App.tsx'
import { defineFlexBasicElement } from './Flex/FlexBasicElement'

defineFlexBasicElement()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
