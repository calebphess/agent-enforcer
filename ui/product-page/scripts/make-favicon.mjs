import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

const NAVY = { r: 8, g: 17, b: 32, alpha: 1 } // #081120
const src = 'public/agent-enforcer-icon.png'

async function make(size, pad, out) {
  const inner = size - pad * 2
  const icon = await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  const buf = await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([{ input: icon, top: pad, left: pad }])
    .png()
    .toBuffer()

  await writeFile(out, buf)
  console.log('wrote', out)
}

await make(64, 6, 'public/favicon-64.png')
await make(180, 22, 'public/apple-icon.png')
await make(512, 60, 'public/icon-512.png')
