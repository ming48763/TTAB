import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pickHomeLine } from '../server/homeLines'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.status(200).json({ line: pickHomeLine() })
}
