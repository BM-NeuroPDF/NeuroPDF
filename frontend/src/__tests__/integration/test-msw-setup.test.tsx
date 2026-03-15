import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { server } from './setup'
import { http, HttpResponse } from 'msw'

describe('MSW Setup Test', () => {
  it('should mock API requests', async () => {
    const response = await fetch('http://localhost:8000/files/upload', {
      method: 'POST',
      body: new FormData()
    })
    
    const data = await response.json()
    expect(data).toHaveProperty('filename')
    expect(data).toHaveProperty('temp_id')
  })

  it('should allow handler override', async () => {
    // Override handler for this test
    server.use(
      http.post('http://localhost:8000/files/upload', () => {
        return HttpResponse.json({ error: 'Custom error' }, { status: 500 })
      })
    )

    const response = await fetch('http://localhost:8000/files/upload', {
      method: 'POST',
      body: new FormData()
    })
    
    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data).toHaveProperty('error')
  })
})