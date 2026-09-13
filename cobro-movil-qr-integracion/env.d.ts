/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_PAGO_QR?: string
  readonly VITE_QR_BASE_URL?: string
  readonly VITE_QR_API_KEY?: string
  readonly VITE_QR_ENVIRONMENT?: string
  readonly VITE_QR_BANECO_ACCOUNT?: string
  readonly VITE_QR_BRANCH_CODE?: string
  readonly VITE_QR_CURRENCY?: string
  readonly VITE_QR_DUE_DAYS?: string
  readonly VITE_QR_POLL_SECONDS?: string
  readonly VITE_QR_TIMEOUT_MS?: string
  readonly VITE_QR_TX_PREFIX?: string
  readonly VITE_PRINTER_PAPER_MM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
