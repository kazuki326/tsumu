// server/generate-vapid-keys.js
// VAPIDキーを生成するスクリプト
import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('=================================');
console.log('VAPID Keys Generated!');
console.log('=================================');
console.log('\nAdd these to your .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('\n=================================');
