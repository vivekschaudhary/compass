// How many navigations are in flight, anywhere on the page. `TopProgress` reads it; `PendingLink`
// and `useNavigate` write it. A module-level store rather than context so a link inside the
// sidebar and a bar in the root layout need no shared parent.

let count = 0;
const listeners = new Set<() => void>();

export const progressStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  get: () => count > 0,
  getServer: () => false,
  /** Returns the matching release. */
  begin() {
    count += 1;
    listeners.forEach((l) => l());
    let done = false;
    return () => {
      if (done) return;
      done = true;
      count -= 1;
      listeners.forEach((l) => l());
    };
  },
};
