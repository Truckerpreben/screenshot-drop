/** Converts a canvas to a PNG Blob. Works with both HTMLCanvasElement and OffscreenCanvas. */
export function canvasToPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvasToPngBlob: toBlob returned null'));
    }, 'image/png');
  });
}
