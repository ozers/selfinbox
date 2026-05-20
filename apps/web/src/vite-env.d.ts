/// <reference types="vite/client" />

// Fontsource packages ship CSS side-effect imports without bundled types.
// Declare the bare module specifiers as side-effect modules so `tsc` doesn't
// trip over them.
declare module "@fontsource-variable/inter";
declare module "@fontsource/jetbrains-mono/400.css";
declare module "@fontsource/jetbrains-mono/500.css";
