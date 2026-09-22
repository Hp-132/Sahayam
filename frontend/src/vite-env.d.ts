/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ADMIN_EMAIL: string;
  readonly VITE_ADMIN_PASSWORD: string;
  readonly VITE_SMS_GATEWAY_NUMBER: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
