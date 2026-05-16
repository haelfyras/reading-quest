"use client";

import { useEffect, useRef } from "react";
import {
  clothingColorOptions,
  getAvatarColor,
  getSkinToneColor,
  hairColorOptions,
  sourceAvatarPalettes,
  wizardTemplateImage,
  type AvatarColor,
  type AvatarSkinTone,
} from "../../lib/avatar";

type AvatarCanvasProps = {
  skinTone: AvatarSkinTone;
  hairColor: AvatarColor;
  clothingColor: AvatarColor;
  className?: string;
};

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function rgbKey(r: number, g: number, b: number) {
  return `${r},${g},${b}`;
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function makeShadePalette(baseHex: string, steps: number) {
  const base = hexToRgb(baseHex);
  const factors = steps === 4 ? [1.42, 1, 0.68, 0.38] : [1.28, 1, 0.58];
  return factors.map((factor) => ({
    r: clamp(base.r * factor),
    g: clamp(base.g * factor),
    b: clamp(base.b * factor),
  }));
}

export default function AvatarCanvas({ skinTone, hairColor, clothingColor, className }: AvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = wizardTemplateImage;

    image.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const replacements = new Map<string, { r: number; g: number; b: number }>();
      const skinPalette = makeShadePalette(getSkinToneColor(skinTone), 3);
      const hairPalette = makeShadePalette(getAvatarColor(hairColor, hairColorOptions), 3);
      const clothingPalette = makeShadePalette(getAvatarColor(clothingColor, clothingColorOptions), 4);

      sourceAvatarPalettes.skin.forEach((hex, index) => {
        const color = hexToRgb(hex);
        replacements.set(rgbKey(color.r, color.g, color.b), skinPalette[index]);
      });
      sourceAvatarPalettes.hair.forEach((hex, index) => {
        const color = hexToRgb(hex);
        replacements.set(rgbKey(color.r, color.g, color.b), hairPalette[index]);
      });
      sourceAvatarPalettes.clothing.forEach((hex, index) => {
        const color = hexToRgb(hex);
        replacements.set(rgbKey(color.r, color.g, color.b), clothingPalette[index]);
      });

      for (let index = 0; index < imageData.data.length; index += 4) {
        const replacement = replacements.get(rgbKey(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]));
        if (replacement) {
          imageData.data[index] = replacement.r;
          imageData.data[index + 1] = replacement.g;
          imageData.data[index + 2] = replacement.b;
        }
      }

      context.putImageData(imageData, 0, 0);
    };

    return () => {
      cancelled = true;
    };
  }, [clothingColor, hairColor, skinTone]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label="Selected wizard avatar preview"
      role="img"
    />
  );
}
