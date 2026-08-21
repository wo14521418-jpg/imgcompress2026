import { createHash, createHmac } from 'node:crypto'

export function sha256hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

export interface VolcSignatureParams {
  method: string
  host: string
  path: string
  query: Record<string, string>
  payload: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  service: string
  now: Date
}

export function volcSignatureV4(params: VolcSignatureParams): {
  authorization: string
  xDate: string
  contentSha256: string
} {
  const { method, host, path, query, payload, accessKeyId, secretAccessKey, region, service, now } =
    params

  const xDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '')
  const dateOnly = xDate.slice(0, 8)

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&')

  const contentSha256 = sha256hex(payload)

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host,
    'x-content-sha256': contentSha256,
    'x-date': xDate,
  }
  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join('')

  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    contentSha256,
  ].join('\n')

  const credentialScope = `${dateOnly}/${region}/${service}/request`
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, sha256hex(canonicalRequest)].join('\n')

  const kDate = hmac(secretAccessKey, dateOnly)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  const authorization = `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { authorization, xDate, contentSha256 }
}
