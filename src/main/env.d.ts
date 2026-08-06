/// <reference types="electron-vite/node" />

// electron-vite's own ImportMetaEnv declaration only covers MODE/DEV/PROD —
// project-specific MAIN_VITE_-prefixed vars must be augmented here, per
// Vite's standard convention (see .env.example for what this is used for).
interface ImportMetaEnv {
  readonly MAIN_VITE_UPDATE_TOKEN?: string
}
