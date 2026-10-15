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

export function forgetAccount(): void {
  profileName = null;
  changed();
  cartModel.reset();
  forgetSaved();
}
