import React, { useState } from 'react';
import { Coffee } from 'lucide-react';

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className = '' }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#141923] via-[#1C2230] to-[#0E121A] text-[#FACC15] p-4 ${className}`}
      >
        <Coffee className="w-10 h-10 text-[#FACC15] mb-2 opacity-90" />
        <span className="text-xs font-medium text-center line-clamp-2 px-2 text-slate-300">
          {alt || 'វំយោលកាហ្វេ'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
      loading="lazy"
    />
  );
};
