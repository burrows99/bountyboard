import { HttpApi, WebApp, type Stack as Base, type Wiring } from "@burrows99/alexander";

/** BountyBoard's stack: the local Solana validator, the board itself, and GitHub (your signed-in session). */
export const services = (w: Wiring) => ({
  chain: new HttpApi("chain", w.url("chain"), "/health"),
  web: new WebApp("web", w.url("web"), w.host, w.size("web")),
  github: new WebApp("github", w.url("github"), w.host, w.size("github")),
});

export type Stack = Base & ReturnType<typeof services>;
export type Step = (s: Stack) => unknown;
