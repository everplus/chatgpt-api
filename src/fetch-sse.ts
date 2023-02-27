import { createParser } from 'eventsource-parser'

import * as types from './types'
import { fetch as globalFetch } from './fetch'
import { streamAsyncIterable } from './stream-async-iterable'

export async function fetchSSE(
  url: string,
  options: Parameters<typeof fetch>[1] & { onMessage: (data: string) => void },
  fetch: types.FetchFn = globalFetch
) {
  const { onMessage, ...fetchOptions } = options
  const res = await fetch(url, fetchOptions)
  if (!res.ok) {
    const msg = `ChatGPT error ${res.status || res.statusText}`
    const error = new types.ChatGPTError(msg, { cause: res })
    error.statusCode = res.status
    error.statusText = res.statusText
    throw error
  }

  const parser = createParser((event) => {
    if (event.type === 'event') {
      onMessage(event.data)
    }
  })

  let isFirstChunk = false
  function checkFirstChunk(str) {
    if (!isFirstChunk) {
      isFirstChunk = true
      let json = null
      try {
        json = JSON.parse(str)
      } catch (err) {
        // empty
      }
      if (json) {
        throw json
      }
    }
  }

  if (!res.body.getReader) {
    for await (const chunk of res.body as any) {
      const str = chunk.toString()
      checkFirstChunk(str)
      parser.feed(str)
    }
  } else {
    for await (const chunk of streamAsyncIterable(res.body)) {
      const str = new TextDecoder().decode(chunk)
      checkFirstChunk(str)
      parser.feed(str)
    }
  }
}
