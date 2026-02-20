import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

const ImageLightbox = ({ images, initialIndex = 0, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setIsZoomed(false);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goToPrevious();
          break;
        case "ArrowRight":
          goToNext();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    setIsZoomed(false);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    setIsZoomed(false);
  };

  const toggleZoom = () => {
    setIsZoomed(!isZoomed);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center"
      data-testid="image-lightbox"
      onClick={onClose}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
        data-testid="lightbox-close"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Zoom Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleZoom();
        }}
        className="absolute top-4 right-16 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
        data-testid="lightbox-zoom"
      >
        {isZoomed ? <ZoomOut className="w-6 h-6" /> : <ZoomIn className="w-6 h-6" />}
      </button>

      {/* Previous Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          goToPrevious();
        }}
        className="absolute left-4 z-50 p-3 rounded-full bg-white/10 hover:bg-neon-blue/30 text-white transition-all hover:scale-110"
        data-testid="lightbox-prev"
      >
        <ChevronLeft className="w-8 h-8" />
      </button>

      {/* Next Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          goToNext();
        }}
        className="absolute right-4 z-50 p-3 rounded-full bg-white/10 hover:bg-neon-blue/30 text-white transition-all hover:scale-110"
        data-testid="lightbox-next"
      >
        <ChevronRight className="w-8 h-8" />
      </button>

      {/* Image Container */}
      <div 
        className={`relative transition-transform duration-300 ${isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
        onClick={(e) => {
          e.stopPropagation();
          toggleZoom();
        }}
      >
        <img
          src={images[currentIndex]}
          alt={`Image ${currentIndex + 1}`}
          className={`max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform duration-300 ${
            isZoomed ? 'scale-150' : 'scale-100'
          }`}
          data-testid="lightbox-image"
        />
      </div>

      {/* Image Counter */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
        <span className="text-white font-outfit text-sm">
          {currentIndex + 1} / {images.length}
        </span>
      </div>

      {/* Thumbnail Strip */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2">
        {images.map((img, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex(index);
              setIsZoomed(false);
            }}
            className={`w-12 h-12 rounded-md overflow-hidden border-2 transition-all ${
              index === currentIndex 
                ? 'border-neon-blue scale-110' 
                : 'border-transparent opacity-50 hover:opacity-100'
            }`}
          >
            <img
              src={img}
              alt={`Thumbnail ${index + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ImageLightbox;
