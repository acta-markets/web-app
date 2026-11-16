// Makes src/app/favicon.ico from the site's own icon route, so the file and the other icons
// are one drawing. Run it with the dev server up, after the logomark or its colours change:
//
//   node scripts/make-favicon.mjs [http://localhost:3000]
//
// An .ico file is a small directory followed by the images it holds. Each image here is a
// PNG as the route drew it, which every current browser reads from an .ico.
import { writeFile } from "node:fs/promises";

const origin = process.argv[2] ?? "http://localhost:3000";
const SIZES = [16, 32, 48];
const PNG_SIGNATURE = "89504e470d0a1a0a";

const images = [];
for (const size of SIZES) {
  const res = await fetch(`${origin}/app-icon/${size}`);
  if (!res.ok) throw new Error(`/app-icon/${size} answered ${res.status}`);
  const png = Buffer.from(await res.arrayBuffer());
  if (png.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) throw new Error(`/app-icon/${size} is not a PNG`);
  images.push({ size, png });
}

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(images.length, 4);

let offset = header.length + images.length * 16;
const entries = images.map(({ size, png }) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0); // width
  entry.writeUInt8(size, 1); // height
  entry.writeUInt8(0, 2); // no palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});

const out = new URL("../src/app/favicon.ico", import.meta.url);
await writeFile(out, Buffer.concat([header, ...entries, ...images.map((image) => image.png)]));
console.log(`favicon.ico: ${images.map((image) => `${image.size}px ${image.png.length}b`).join(", ")}`);
