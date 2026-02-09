/**
 * ポートで OCD サーバーが既に listen しているかを判定するユーティリティ
 *
 * EADDRINUSE 発生時に、既存プロセスが自サーバー（OCD）か別アプリかを
 * GET /whois の応答で判定するために使用する。
 */

import http from 'node:http'

/** /whois の応答に含まれることを期待する識別子 */
const OCD_WHOIS_MARKER = 'OCD'

/** GET /whois のタイムアウト（ミリ秒） */
const WHOIS_TIMEOUT_MS = 2000

/**
 * 指定ポートで OCD サーバーが既に listen しているかどうかを判定する。
 * 127.0.0.1:port/whois に GET を送り、200 かつ body に "OCD" が含まれれば true。
 *
 * @param port - 確認するポート番号
 * @returns 既に OCD が listen していれば true、それ以外は false
 */
export async function isOcdListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/whois`, (res) => {
      if (res.statusCode !== 200) {
        resolve(false)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')
        resolve(body.includes(OCD_WHOIS_MARKER))
      })
      res.on('error', () => resolve(false))
    })
    req.on('error', () => resolve(false))
    req.setTimeout(WHOIS_TIMEOUT_MS, () => {
      req.destroy()
      resolve(false)
    })
  })
}
