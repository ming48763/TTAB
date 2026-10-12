import { pickHomeLine } from '../server/homeLines'

export function GET() {
  return Response.json(
    { line: pickHomeLine() },
    { headers: { 'cache-control': 'no-store' } },
  )
}
