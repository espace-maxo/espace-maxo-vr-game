/**
 * ShareModal - Modal de partage avec QR Code
 * Permet de partager l'application via QR code ou lien
 */
import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { 
  Share2, Copy, Download, QrCode, Check, Smartphone,
  ExternalLink
} from 'lucide-react';

const APP_URL = "https://caisse-mon-point.preview.emergentagent.com/caisse";

export default function ShareModal({ open, onOpenChange }) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      toast.success('Lien copié !');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Erreur lors de la copie');
    }
  };

  const handleDownloadQR = () => {
    // Create a canvas from the SVG
    const svg = document.getElementById('qr-code-svg');
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;
      
      // Background
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw QR code centered
      const padding = 30;
      ctx.drawImage(img, padding, padding, canvas.width - padding * 2, canvas.height - padding * 2);
      
      // Add text
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('CAISSE PRO', canvas.width / 2, canvas.height - 10);
      
      // Download
      const link = document.createElement('a');
      link.download = 'caisse-pro-qr-code.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast.success('QR Code téléchargé !');
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Caisse Pro - Espace Maxo',
          text: 'Accédez à l\'application de caisse',
          url: APP_URL
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          toast.error('Erreur lors du partage');
        }
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Share2 className="w-5 h-5 text-amber-400" />
            Partager Caisse Pro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* QR Code */}
          <div className="flex flex-col items-center">
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 shadow-lg">
              <QRCodeSVG
                id="qr-code-svg"
                value={APP_URL}
                size={200}
                level="H"
                includeMargin={true}
                bgColor="#1e293b"
                fgColor="#fbbf24"
              />
            </div>
            <p className="text-slate-400 text-sm mt-3 flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Scannez pour accéder à l'application
            </p>
          </div>

          {/* URL avec bouton copier */}
          <div className="space-y-2">
            <label className="text-sm text-slate-400">Lien de l'application</label>
            <div className="flex gap-2">
              <Input
                value={APP_URL}
                readOnly
                className="bg-slate-900 border-slate-600 text-white text-sm"
              />
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className={`border-slate-600 ${copied ? 'bg-green-600 border-green-600' : 'hover:bg-slate-700'}`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleDownloadQR}
              variant="outline"
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
            >
              <Download className="w-4 h-4 mr-2" />
              Télécharger QR
            </Button>
            <Button
              onClick={handleShare}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Partager
            </Button>
          </div>

          {/* Lien direct */}
          <div className="text-center">
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:text-amber-300 text-sm flex items-center justify-center gap-1"
            >
              Ouvrir dans un nouvel onglet
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Bouton de partage pour le header
export function ShareButton({ onClick }) {
  return (
    <Button
      onClick={onClick}
      variant="ghost"
      size="sm"
      className="text-slate-400 hover:text-amber-400 hover:bg-slate-700/50"
      title="Partager l'application"
    >
      <QrCode className="w-5 h-5" />
    </Button>
  );
}
