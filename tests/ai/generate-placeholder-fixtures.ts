/**
 * 一次性 helper: 把 tests/ai/fixtures/{1..20}.jpg 用 1x1 白色像素填滿。
 * 真跑 eval suite 前, 把每張替換成真實照片即可。
 *
 * Usage: tsx tests/ai/generate-placeholder-fixtures.ts
 */
import sharp from 'sharp';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES_DIR = join(__dirname, 'fixtures');

async function main() {
  const buf = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();

  for (let i = 1; i <= 20; i++) {
    const out = join(FIXTURES_DIR, `${i}.jpg`);
    if (existsSync(out)) {
      // 不覆蓋, 真照片不可被 placeholder 覆蓋
      console.log(`skip ${out} (exists)`);
      continue;
    }
    writeFileSync(out, buf);
    console.log(`wrote ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
