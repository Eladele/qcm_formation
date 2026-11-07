import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { QrBadge } from '../../domain';

export function QrImage({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt="QR code de connexion" /> : <div className="qr-placeholder" style={{ width: size, height: size }} />;
}

/** Ouvre WhatsApp avec le lien de connexion pré-rempli. */
function shareWhatsApp(badge: QrBadge) {
  const phone = badge.phone?.replace(/[\s.\-()+]/g, '') ?? '';
  const message =
    `Bonjour ${badge.fullName}, voici votre lien de connexion à l'examen :\n${badge.loginUrl}\n\nScannez ou cliquez directement sur ce lien depuis votre téléphone.`;
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Feuille de badges imprimable (un badge par candidat). */
export function BadgeSheet({ badges, title }: { badges: readonly QrBadge[]; title?: string }) {
  return (
    <div className="badge-sheet">
      {badges.map((b) => (
        <div key={b.candidateId} className="qr-badge">
          {title && <div className="qr-badge-title">{title}</div>}
          <QrImage value={b.loginUrl} size={180} />
          <strong>{b.fullName}</strong>
          <small>Scannez avec l'appareil photo de votre téléphone pour vous connecter. Ne partagez pas ce badge.</small>
          <button
            type="button"
            className="btn btn-ghost btn-sm whatsapp-btn no-print"
            onClick={() => shareWhatsApp(b)}
            title={b.phone ? `Envoyer à ${b.phone}` : 'Envoyer via WhatsApp'}
          >
            <WhatsAppIcon />
            {b.phone ? `Envoyer à ${b.phone}` : 'Partager via WhatsApp'}
          </button>
        </div>
      ))}
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      style={{ marginRight: 6, verticalAlign: 'middle' }}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
