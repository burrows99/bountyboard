// This project's own recipes: steps several claims share, built on alexander's (re-exported here).
import { contract } from "@burrows99/alexander";
import type { Stack, Step } from "../services.ts";

export * from "@burrows99/alexander";

/** `state`, `claim` and `given` typed to this project's stack: claims import them from here. */
export const { state, claim, given } = contract<Stack>();

/** The app's home screen. Replace with this project's real flows (sign in, open a record, …). */
export const home: Step[] = [s => s.web.login("/")];
