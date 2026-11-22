// Turns each SVG from build.mjs into a 2x PNG.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const DIR = dirname(fileURLToPath(import.meta.url));
for (const row of readFileSync(join(DIR, 'svg/sizes.txt'), 'utf8').trim().split('\n')) {
    const [name, width] = row.split(' ');
    const png = new Resvg(readFileSync(join(DIR, 'svg', `${name}.svg`)), {
        fitTo: { mode: 'width', value: Number(width) * 2 },
        font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica Neue' }
    }).render().asPng();
    writeFileSync(join(DIR, `${name}.png`), png);
    console.log(`${name}.png`, png.length);
}
