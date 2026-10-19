import { describe, it, expect } from "vitest";
import { releaseChannel, whenReleased } from "./realtime-channel";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("releaseChannel / whenReleased", () => {
  it("resolves immediately when nothing on the topic is being released", async () => {
    await expect(whenReleased("task-none")).resolves.toBeUndefined();
  });

  it("holds the next subscriber back until removeChannel has finished", async () => {
    const removal = deferred();
    const client = { removeChannel: () => removal.promise };
    releaseChannel(client, "task-a", {});

    let free = false;
    void whenReleased("task-a").then(() => { free = true; });
    await new Promise((r) => setTimeout(r, 5));
    expect(free).toBe(false); // the old channel is still registered — opening now would reuse it

    removal.resolve();
    await whenReleased("task-a");
    expect(free).toBe(true);
  });

  it("does not wait on a different topic", async () => {
    const removal = deferred();
    releaseChannel({ removeChannel: () => removal.promise }, "task-b", {});
    await expect(whenReleased("task-other")).resolves.toBeUndefined();
    removal.resolve();
  });

  it("still frees the topic, without rejecting, when removeChannel fails", async () => {
    const removal = deferred();
    const done = releaseChannel({ removeChannel: () => removal.promise }, "task-c", {});
    removal.reject(new Error("socket closed"));
    await expect(done).resolves.toBeUndefined();
    await expect(whenReleased("task-c")).resolves.toBeUndefined();
  });

  it("survives removeChannel throwing synchronously", async () => {
    const client = { removeChannel: () => { throw new Error("boom"); } };
    await expect(releaseChannel(client, "task-d", {})).resolves.toBeUndefined();
  });

  it("a second release on the same topic is waited for as well", async () => {
    const first = deferred();
    const second = deferred();
    releaseChannel({ removeChannel: () => first.promise }, "task-e", {});
    releaseChannel({ removeChannel: () => second.promise }, "task-e", {});

    let free = false;
    void whenReleased("task-e").then(() => { free = true; });
    first.resolve();
    await new Promise((r) => setTimeout(r, 5));
    expect(free).toBe(false); // the latest release is the one that gates the topic

    second.resolve();
    await whenReleased("task-e");
    expect(free).toBe(true);
  });
});
