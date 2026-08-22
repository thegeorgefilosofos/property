import http from 'node:http';
import crypto from 'node:crypto';
import webpush from 'web-push';
import { readFileSync } from 'node:fs';

const [pub, priv] = readFileSync('/tmp/vapid.txt','utf8').trim().split('\n');

// Ζεύγος όπως θα το έδινε ο περιηγητής.
const ec = crypto.createECDH('prime256v1'); ec.generateKeys();
const p256dh = ec.getPublicKey().toString('base64url');
const auth = crypto.randomBytes(16).toString('base64url');

const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    console.log('authorization:', String(req.headers.authorization).slice(0, 20) + '…');
    console.log('content-encoding:', req.headers['content-encoding']);
    console.log('ttl:', req.headers.ttl, '· urgency:', req.headers.urgency);
    console.log('bytes κρυπτογραφημένα:', body.length);
    console.log('καθαρό κείμενο μέσα;', body.includes(Buffer.from('ΔΕΗ','utf8')));
    res.writeHead(201); res.end();
    srv.close();
  });
});
srv.listen(3488, async () => {
  const { sendPush } = await import('/home/user/property/lib/push/send.ts');
  const out = await sendPush(
    { endpoint: 'http://127.0.0.1:3488/wpush/v2/abc', p256dh, auth },
    { title: 'ΔΕΗ', body: 'Λήγει σήμερα, 87,45 €', url: '/dashboard' },
    { subject: 'mailto:test@example.com', publicKey: pub, privateKey: priv },
  );
  console.log('έκβαση:', JSON.stringify(out));
});
