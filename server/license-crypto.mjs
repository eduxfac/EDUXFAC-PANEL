import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function privateKeyFromEnvironment(environment=process.env) {
  const pem = environment.EDUXFAC_LICENSE_PRIVATE_KEY_PEM
    || (environment.EDUXFAC_LICENSE_PRIVATE_KEY_PATH ? readFileSync(environment.EDUXFAC_LICENSE_PRIVATE_KEY_PATH, 'utf8') : '');
  if (!pem) throw new Error('La clave privada de licencias no está configurada.');
  return createPrivateKey(pem);
}

export function signLicense(payload, { privateKey=privateKeyFromEnvironment() }={}) {
  const serialized = canonicalize(payload);
  return { payload, signature: sign(null, Buffer.from(serialized), privateKey).toString('base64') };
}

export function verifyLicense(signedLicense, { publicKey }={}) {
  if (!signedLicense?.payload || typeof signedLicense.signature !== 'string' || !publicKey) return false;
  try {
    const key=publicKey.type==='public'?publicKey:createPublicKey(publicKey);
    return verify(null, Buffer.from(canonicalize(signedLicense.payload)), key, Buffer.from(signedLicense.signature, 'base64'));
  } catch { return false; }
}

export { canonicalize };
