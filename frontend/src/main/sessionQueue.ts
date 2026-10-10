// Runs each session's file operations one at a time, in the order they arrived.
//
// ipcMain starts every handler as soon as its message arrives, without waiting for earlier
// handlers to finish. On the last round the renderer sends saveRound and then
// terminateSession back to back, so without a queue finishSession could read rounds.jsonl
// before the last round has been appended, leaving it out of the CSVs.

export type SessionQueue = {
  // Runs task after every earlier task for the same key has finished, and resolves or
  // rejects with task's own result
  run: <T>(key: string, task: () => Promise<T>) => Promise<T>
  // Forgets a key once its session is finished
  clear: (key: string) => void
}

export function createSessionQueue(): SessionQueue {
  // key -> promise that settles when the most recently queued task for that key is done
  const tails = new Map<string, Promise<unknown>>()

  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve()
      // Start once the previous task settles, whether it succeeded or failed: one failed
      // save shouldn't block every save after it
      const result = previous.then(task, task)
      // The next task waits on this one. The .catch only keeps the chain going; the caller
      // still receives the error through result
      tails.set(
        key,
        result.catch(() => undefined)
      )
      return result
    },

    clear(key: string): void {
      tails.delete(key)
    }
  }
}
