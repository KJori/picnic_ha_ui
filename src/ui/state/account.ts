/**
 * What the page knows about the signed-in account, and forgetting all of it
 * when the account changes: after signing out, and after signing in (the
 * session may have expired and someone else signed in).
 */
import { useEffect, useSyncExternalStore } from "react";

import type { ProfileData } from "@/lib/core/user-types";

import { api } from "../lib/api";
import { cartModel } from "./cart";
import { forgetSaved } from "./saved";

let profileName: string | null = null;
let profileLoading = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The account holder's name, as Picnic has it; null until known. */
export function useProfileName(): string | null {
  useEffect(() => {
    if (profileName || profileLoading) return;
    profileLoading = true;
    void api<ProfileData>("user/profile").then((result) => {
      profileLoading = false;
      if (result.ok && result.data.name) {
        profileName = result.data.name;
        changed();
      }
    });
  }, []);
  return useSyncExternalStore(subscribe, () => profileName);
}

/** What this page keeps in the browser: a pasted list, a meal plan, a payment being watched. */
const BROWSER_KEY_PREFIX = "picnic_desk_";

/**
 * Forget the account's data in the page. Signing out (`signingOut`) also
 * clears what this page keeps in the browser, which another Home Assistant
 * user on the same browser could otherwise read.
 */
export function forgetAccount({ signingOut = false }: { signingOut?: boolean } = {}): void {
  profileName = null;
  changed();
  cartModel.reset();
  forgetSaved();
  if (signingOut) {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(BROWSER_KEY_PREFIX)) localStorage.removeItem(key);
      }
    } catch {
      // storage not available: nothing kept
    }
  }
}
