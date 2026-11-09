// 알림(Web Push)에 쓸 키를 만든다. 실행: node scripts/make-push-keys.mjs
// 출력된 값은 Vercel 환경 변수와 Supabase Vault 에 넣는다 (git에 올리지 않는다).
import { randomBytes } from "node:crypto";
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const secret = randomBytes(32).toString("base64url");

console.log(`
[Vercel 환경 변수]
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
PUSH_SECRET=${secret}

[.env.local 에도 추가 (공개 키만)]
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}

[Supabase SQL Editor]
select vault.create_secret('${secret}', 'daypath_push_secret');
select vault.create_secret('https://daypath-ten.vercel.app', 'daypath_app_url');
`);
