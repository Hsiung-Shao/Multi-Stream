// 權杖加解密（AES-GCM-256，WebCrypto）。格式：v1.<iv base64url>.<密文 base64url>
// 金鑰：環境變數（32 bytes 的 base64），不進資料庫；資料庫外洩也拿不到明文權杖。

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function importKey(keyB64) {
    const raw = Uint8Array.from(atob(String(keyB64 || '')), c => c.charCodeAt(0));
    if (raw.length !== 32) throw new Error('token key must be 32 bytes');
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plain, keyB64) {
    const key = await importKey(keyB64);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
    return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptToken(enc, keyB64) {
    const [ver, iv, ct] = String(enc || '').split('.');
    if (ver !== 'v1' || !iv || !ct) throw new Error('bad token format');
    const key = await importKey(keyB64);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, key, fromB64url(ct));
    return new TextDecoder().decode(plain);
}
