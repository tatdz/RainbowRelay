import request from 'supertest'
import express from 'express'
import { app } from '../backend/index.js' // Assuming you export app separately for testing

describe('Backend API integration', () => {
  let server

  beforeAll(() => {
    server = app.listen(3001)
  })

  afterAll(done => {
    server.close(done)
  })

  test('POST /api/orders with missing order returns 400', async () => {
    const res = await request(server).post('/api/orders').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Missing order')
  })

  test('POST /api/darkpools/join adds peer successfully', async () => {
    const res = await request(server).post('/api/darkpools/join')
      .send({ poolName: 'whales', peerId: 'peerTest' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  test('GET /api/reputation/peers returns list', async () => {
    const res = await request(server).get('/api/reputation/peers')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
