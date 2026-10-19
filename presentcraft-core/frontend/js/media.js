export const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv'];
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
export const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'];
export const MEDIA_FILTER = [{ name: 'Media', extensions: [...VIDEO_EXT, ...IMAGE_EXT] }];

export const LIB_FILTER = [
  { name: 'Media', extensions: [...VIDEO_EXT, ...IMAGE_EXT, ...AUDIO_EXT] },
  { name: 'All files', extensions: ['*'] },
];

export function libKindOf(path) {
  const ext = path.split('.').pop().toLowerCase();
  return kindOf(path) || (AUDIO_EXT.includes(ext) ? 'audio' : 'file');
}

export function kindOf(path) {
  const ext = path.split('.').pop().toLowerCase();
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return null;
}

