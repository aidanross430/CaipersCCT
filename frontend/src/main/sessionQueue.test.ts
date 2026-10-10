import { describe, it, expect } from 'vitest'
import { createSessionQueue } from './sessionQueue'

// A task that waits ms milliseconds, then records its name
function delayed(log: string[], name: string, ms: number): () => Promise<string> {
  return () =>
    new Promise((resolve) =>
      setTimeout(() => {
        log.push(name)
        resolve(name)
      }, ms)
    )
}

describe('createSessionQueue', () => {
  it('runs tasks for the same key in arrival order, even when an earlier one is slower', async () => {
    const queue = createSessionQueue()
    const log: string[] = []

    // The situation on the last round: a slow save, then an immediate finish
    const save = queue.run('s1', delayed(log, 'save', 50))
    const finish = queue.run('s1', delayed(log, 'finish', 0))
    await Promise.all([save, finish])

    expect(log).toEqual(['save', 'finish'])
  })

  it('resolves each caller with its own task result', async () => {
    const queue = createSessionQueue()
    const log: string[] = []
    await expect(queue.run('s1', delayed(log, 'a', 10))).resolves.toBe('a')
    await expect(queue.run('s1', delayed(log, 'b', 0))).resolves.toBe('b')
  })

  it('still runs later tasks after one fails, and the failure reaches its caller', async () => {
    const queue = createSessionQueue()
    const log: string[] = []

    const failing = queue.run('s1', async () => {
      throw new Error('disk full')
    })
    const next = queue.run('s1', delayed(log, 'next', 0))

    await expect(failing).rejects.toThrow('disk full')
    await expect(next).resolves.toBe('next')
    expect(log).toEqual(['next'])
  })

  it('does not make different sessions wait on each other', async () => {
    const queue = createSessionQueue()
    const log: string[] = []

    const slow = queue.run('s1', delayed(log, 's1', 50))
    const fast = queue.run('s2', delayed(log, 's2', 0))
    await Promise.all([slow, fast])

    expect(log).toEqual(['s2', 's1'])
  })

  it('starts fresh for a key after clear', async () => {
    const queue = createSessionQueue()
    const log: string[] = []
    await queue.run('s1', delayed(log, 'first', 0))
    queue.clear('s1')
    await expect(queue.run('s1', delayed(log, 'second', 0))).resolves.toBe('second')
    expect(log).toEqual(['first', 'second'])
  })
})
