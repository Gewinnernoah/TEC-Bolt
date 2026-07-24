import QRCode from 'qrcode';
import type { Device } from './types';

export async function generateQRCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 256,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
}

export async function generateBarcodeDataUrl(code: string): Promise<string> {
  // Generate a visual barcode representation using QR as fallback
  // Real barcode scanners read QR codes; for 1D-style display we use QR
  return QRCode.toDataURL(code, {
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'L',
  });
}

export async function generateDeviceLabel(device: Device): Promise<{
  qrUrl: string;
  barcodeUrl: string;
  html: string;
}> {
  const qrUrl = await generateQRCodeDataUrl(device.inventory_number);
  const barcodeUrl = await generateBarcodeDataUrl(device.barcode || device.inventory_number);

  const html = `
  <html>
  <head>
    <style>
      @page { size: 62mm 40mm; margin: 0; }
      body { font-family: 'Courier New', monospace; margin: 0; padding: 4px; width: 62mm; }
      .label { border: 1px solid #000; padding: 4px; text-align: center; }
      .name { font-size: 11px; font-weight: bold; margin-bottom: 2px; }
      .inv { font-size: 10px; margin-bottom: 4px; }
      .codes { display: flex; justify-content: center; gap: 4px; }
      .code { text-align: center; }
      .code-label { font-size: 7px; margin-top: 2px; }
      .code-text { font-size: 8px; font-weight: bold; }
      img { width: 80px; height: 80px; }
    </style>
  </head>
  <body>
    <div class="label">
      <div class="name">${device.name}</div>
      <div class="inv">Inv: ${device.inventory_number}</div>
      <div class="codes">
        <div class="code">
          <img src="${qrUrl}" alt="QR" />
          <div class="code-label">QR</div>
          <div class="code-text">${device.inventory_number}</div>
        </div>
        <div class="code">
          <img src="${barcodeUrl}" alt="Barcode" />
          <div class="code-label">Barcode</div>
          <div class="code-text">${device.barcode || '—'}</div>
        </div>
      </div>
    </div>
  </body>
  </html>`;

  return { qrUrl, barcodeUrl, html };
}

export function generateBarcodeValue(prefix: string): string {
  const num = Math.floor(Date.now() / 1000) % 100000;
  const rand = Math.floor(Math.random() * 1000);
  return `${prefix}${String(num).padStart(5, '0')}${String(rand).padStart(3, '0')}`;
}

export function generateNfcTagId(): string {
  const hex = '0123456789ABCDEF';
  let id = '';
  for (let i = 0; i < 14; i++) id += hex[Math.floor(Math.random() * 16)];
  return id;
}

export function generateInventoryNumber(prefix: string, existing: number): string {
  return `${prefix}-${String(existing + 1).padStart(5, '0')}`;
}
