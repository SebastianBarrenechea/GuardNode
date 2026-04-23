import fs from 'fs-extra';
import path from 'path';
import { config } from './config.js';
import logger from './logger.js';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';

const TYPE_MAP = {
  image: 'image',
  video: 'video',
  gif: 'image',
  sticker: 'sticker'
};

export async function saveMediaLocal(buffer, originalFilename, contentType) {
  try {
    // Validate buffer
    if (!buffer || buffer.length === 0) {
      logger.warn('Empty media buffer, skipping save');
      return null;
    }

    // Detect type
    let mediaType = 'image';
    if (contentType.includes('video')) mediaType = 'video';
    else if (contentType.includes('webp') && originalFilename.includes('.webp')) mediaType = 'sticker';
    else if (contentType.includes('gif')) mediaType = 'gif';

    const subdir = config.uploads.subdirs[mediaType] || 'images';

    // Validate type
    const allowedTypes = config.uploads.types[mediaType] || config.uploads.types.image;
    if (!allowedTypes.includes(contentType)) {
      logger.warn(`Invalid media type: ${contentType}`);
      return null;
    }

    // Size check
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > config.uploads.maxSizeMB) {
      logger.warn(`Media too large: ${sizeMB.toFixed(1)}MB`);
      return null;
    }

    // Generate name
    const ext = mime.extension(contentType) || 'bin';
    const filename = `${uuidv4()}.${ext}`;
    const fullPath = path.join(config.uploads.path, subdir, filename);

    // Ensure dir & save
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, buffer);

    const relativeUrl = `/media/${subdir}/${filename}`;
    logger.info(`💾 Media saved: ${relativeUrl} (${sizeMB.toFixed(1)}MB)`);

    return relativeUrl;
  } catch (error) {
    logger.error('Media save failed:', error.message);
    return null;
  }
}
