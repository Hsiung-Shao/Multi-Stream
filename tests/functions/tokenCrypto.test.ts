// token-crypto：AES-GCM 加解密（只依介面規格撰寫；用真的 WebCrypto）
import { describe, it, expect } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { encryptToken, decryptToken } from '../../functions/lib/token-crypto.js';

const b64 = (fill: number) => Buffer.from(new Uint8Array(32).fill(fill)).toString('base64');
const KEY = b64(7);

describe('token-crypto', () => {
    it('T3a 加密後不是明文，解密還原相同字串', async () => {
        const enc = await encryptToken('my-refresh-token', KEY);
        expect(typeof enc).toBe('string');
        expect(enc).not.toContain('my-refresh-token');
        expect(await decryptToken(enc, KEY)).toBe('my-refresh-token');
    });

    it('T3b 同一明文加密兩次結果不同（iv 隨機）但都能還原', async () => {
        const a = await encryptToken('same', KEY);
        const b = await encryptToken('same', KEY);
        expect(a).not.toBe(b);
        expect(await decryptToken(a, KEY)).toBe('same');
        expect(await decryptToken(b, KEY)).toBe('same');
    });

    it('T3c 用錯誤金鑰解密丟錯', async () => {
        const enc = await encryptToken('secret', KEY);
        await expect(decryptToken(enc, b64(9))).rejects.toThrow();
    });

    it('T3d 密文被改動後解密丟錯', async () => {
        const enc = await encryptToken('secret', KEY);
        const mid = Math.floor(enc.length / 2);
        const tampered = enc.slice(0, mid) + (enc[mid] === 'A' ? 'B' : 'A') + enc.slice(mid + 1);
        await expect(decryptToken(tampered, KEY)).rejects.toThrow();
    });
});
