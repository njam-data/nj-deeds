export async function repeat (times, fn) {
  for (let i = 0; i < times; i++) {
    await fn()
  }
}
