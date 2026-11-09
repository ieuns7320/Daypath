// 아이콘 원본(scripts/icon-source.svg)에서 PWA·앱 아이콘을 만든다. 실행: node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const src = readFileSync("scripts/icon-source.svg", "utf8");
// 둥근 모서리 버전 (브라우저 탭·manifest "any")
const rounded = src.replace('<rect width="512" height="512"', '<rect width="512" height="512" rx="112"');

const png = (svg, size, out) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);

writeFileSync("src/app/icon.svg", rounded);
await png(rounded, 192, "public/icons/icon-192.png");
await png(rounded, 512, "public/icons/icon-512.png");
await png(src, 512, "public/icons/maskable-512.png"); // 기기가 모양을 잘라 쓰는 버전
await png(src, 180, "src/app/apple-icon.png"); // iOS가 모서리를 직접 둥글게 한다
console.log("icons done");
