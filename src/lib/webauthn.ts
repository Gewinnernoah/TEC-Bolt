import { supabase } from './supabase';
import type { Profile, WebAuthnCredential } from './types';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function randomChallenge(): Uint8Array {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

function randomUserId(): Uint8Array {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return arr;
}

function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && 'credentials' in navigator;
}

export async function canUseBiometric(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enrollFingerprint(profile: Profile): Promise<{ error: string | null }> {
  if (!isWebAuthnAvailable()) return { error: 'Biometric authentication not supported on this device.' };

  try {
    const publicKey: PublicKeyCredentialCreationOptions = {
      challenge: randomChallenge(),
      rp: { name: 'School TEC Hub' },
      user: {
        id: randomUserId(),
        name: profile.email,
        displayName: profile.full_name,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    };

    const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
    if (!credential) return { error: 'Enrollment cancelled.' };

    const rawId = arrayBufferToBase64(credential.rawId);
    const response = credential.response as AuthenticatorAttestationResponse;
    const pubKey = arrayBufferToBase64(response.getPublicKey() ?? new ArrayBuffer(0));

    const creds = [...(profile.webauthn_credentials || [])];
    creds.push({
      id: rawId,
      publicKey: pubKey,
      transports: [],

      createdAt: Date.now(),
    });

    const { error } = await supabase
      .from('profiles')
      .update({
        webauthn_credentials: creds as unknown as never,
        fingerprint_enrolled: true,
        fingerprint_credential_id: rawId,
      })
      .eq('id', profile.id);

    if (error) return { error: error.message };
    setStoredFingerprintEmail(profile.email);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Enrollment failed.' };
  }
}

export async function verifyFingerprint(profile: Profile): Promise<{ success: boolean; error: string | null }> {
  if (!isWebAuthnAvailable()) return { success: false, error: 'Biometric authentication not supported.' };
  if (!profile.webauthn_credentials?.length) return { success: false, error: 'No fingerprint enrolled.' };

  try {
    const cred = profile.webauthn_credentials[0];
    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: randomChallenge(),
      allowCredentials: [
        {
          id: base64ToArrayBuffer(cred.id),
          type: 'public-key',
          transports: cred.transports as AuthenticatorTransport[] | undefined,
        },
      ],
      userVerification: 'required',
      timeout: 30_000,
    };

    const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
    if (!assertion) return { success: false, error: 'Verification cancelled.' };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Verification failed.' };
  }
}

export async function removeFingerprint(profile: Profile): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({
      webauthn_credentials: [] as unknown as never,
      fingerprint_enrolled: false,
      fingerprint_credential_id: null,
    })
    .eq('id', profile.id);
  if (error) return { error: error.message };
  clearStoredFingerprintEmail();
  return { error: null };
}

export function getStoredFingerprintEmail(): string | null {
  try {
    return localStorage.getItem('fingerprint_email');
  } catch {
    return null;
  }
}

export function setStoredFingerprintEmail(email: string): void {
  try {
    localStorage.setItem('fingerprint_email', email);
  } catch {
    // ignore
  }
}

export function clearStoredFingerprintEmail(): void {
  try {
    localStorage.removeItem('fingerprint_email');
  } catch {
    // ignore
  }
}

export async function getProfileForFingerprint(email: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export type { WebAuthnCredential };
