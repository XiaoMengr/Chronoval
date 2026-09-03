// @ts-nocheck
/// <reference lib="webworker" />

/**
 * Image decoder worker
 * @param {MessageEvent} event
 * @returns
 */
self.onmessage = async (event) => {
  const { type } = event.data

  if (type === 'load') {
    const { payload } = event.data
    const gen = payload && payload.gen
    const requestSrc = payload && payload.src
    let src = requestSrc
    try {
      try {
        const absolute = new URL(
          src,
          self.location?.origin || 'http://localhost',
        )
        src = absolute.toString()
      } catch {
        /* empty */
      }
      const response = await fetch(src, { mode: 'cors' })
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`)
      }

      const blob = await response.blob()

      const imageBitmap = await createImageBitmap(blob)

      self.postMessage(
        {
          type: 'loaded',
          payload: {
            imageBitmap,
            width: imageBitmap.width,
            height: imageBitmap.height,
            src,
            gen,
          },
        },
        [imageBitmap],
      )
    } catch (error) {
      self.postMessage({
        type: 'load-error',
        payload: {
          error: error instanceof Error ? error : 'Unknown error',
          src,
          gen,
        },
      })
    }
  }
}
