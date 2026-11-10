import QRCode from 'qrcode';

/**
 * Official EMVCo / NBC Bakong KHQR CRC-16/CCITT-FALSE calculator (Polynomial 0x1021, Init 0xFFFF)
 * Used as an automatic client-side fallback when deployed on static hosts like GitHub Pages
 * where the Node.js /api/khqr/create backend is not running.
 */
function crc16CcittFalse(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

export async function generateClientSideAbaKhqrFallback(params: {
  orderNumber: string;
  amountUsd: number;
  amountKhr: number;
  currency: 'USD' | 'KHR';
}) {
  const savedConfigRaw = localStorage.getItem('vomyol_aba_config');
  let customConfig: any = {};
  try {
    if (savedConfigRaw) customConfig = JSON.parse(savedConfigRaw);
  } catch {
    // Ignore parse error
  }

  const merchantName = (customConfig.accountName || 'UDOM KREN').slice(0, 25);
  const abaAccountUsd = customConfig.accountNumberUsd || '009 338 762';
  const abaAccountKhr = customConfig.accountNumberKhr || '009 338 764';
  const bakongAccountId =
    customConfig.bakongAccountId && String(customConfig.bakongAccountId).includes('@')
      ? customConfig.bakongAccountId
      : 'abaakhppxxx@abaa';

  const selectedCurrency: 'USD' | 'KHR' = params.currency === 'KHR' ? 'KHR' : 'USD';
  const numericAmount =
    selectedCurrency === 'USD' ? Number(params.amountUsd) : Number(params.amountKhr);
  const targetAbaAccount = (
    selectedCurrency === 'KHR' ? abaAccountKhr : abaAccountUsd
  ).replace(/[^0-9]/g, '');

  const currencyIsoNum = selectedCurrency === 'KHR' ? '116' : '840';
  const formattedAmount =
    selectedCurrency === 'KHR'
      ? Math.round(numericAmount).toString()
      : numericAmount.toFixed(2);

  // Tag 29: Merchant Account Information (Individual KHQR with ABA Bank Acquirer)
  const tag29Value =
    tlv('00', bakongAccountId) +
    tlv('01', targetAbaAccount) +
    tlv('02', 'ABA Bank');

  const nowMs = Date.now();
  const expMs = nowMs + 5 * 60 * 1000;

  // Tag 62: Additional Data Field Template (Bill Number & Store Label)
  const tag62Value =
    tlv('01', params.orderNumber.slice(0, 20)) + tlv('03', 'Romdoul Caffee');

  // Tag 99: Creation & Expiration Timestamp (Required for Dynamic KHQR 010212)
  const tag99Value = tlv('00', String(nowMs)) + tlv('01', String(expMs));

  const dynamicBodyWithoutCrc =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('29', tag29Value) +
    tlv('52', '5999') +
    tlv('53', currencyIsoNum) +
    tlv('54', formattedAmount) +
    tlv('58', 'KH') +
    tlv('59', merchantName) +
    tlv('60', 'PHNOM PENH') +
    tlv('62', tag62Value) +
    tlv('99', tag99Value) +
    '6304';

  const dynamicKhqrString =
    customConfig.customRawKhqrString && customConfig.customRawKhqrString.startsWith('000201')
      ? customConfig.customRawKhqrString
      : dynamicBodyWithoutCrc + crc16CcittFalse(dynamicBodyWithoutCrc);

  const staticBodyWithoutCrc =
    tlv('00', '01') +
    tlv('01', '11') +
    tlv('29', tag29Value) +
    tlv('52', '5999') +
    tlv('53', currencyIsoNum) +
    tlv('58', 'KH') +
    tlv('59', merchantName) +
    tlv('60', 'PHNOM PENH') +
    '6304';

  const staticKhqrString = staticBodyWithoutCrc + crc16CcittFalse(staticBodyWithoutCrc);

  const dynamicQrDataUrl = await QRCode.toDataURL(dynamicKhqrString, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  const staticQrDataUrl = await QRCode.toDataURL(staticKhqrString, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  const abaDeepLink = `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(
    dynamicKhqrString
  )}`;

  return {
    orderNumber: params.orderNumber,
    amount: numericAmount,
    currency: selectedCurrency,
    khqrString: dynamicKhqrString,
    staticKhqrString,
    md5: `local_${nowMs}_${Math.random().toString(36).slice(2, 10)}`,
    crcValid: true,
    qrDataUrl: customConfig.customQrImageUrl || dynamicQrDataUrl,
    staticQrDataUrl,
    dynamicQrDataUrl,
    abaDeepLink,
    bakongDeepLink: '',
    abaPaywayLink: customConfig.abaPaywayLink || '',
    merchantName,
    merchantAccount: `${targetAbaAccount} (${bakongAccountId})`,
    abaAccountUsd,
    abaAccountKhr,
    expiresAt: new Date(expMs).toISOString(),
    liveTokenConfigured: false,
  };
}
