import ftp from 'basic-ftp';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../utils/config.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export async function uploadMedia(buffer, filename, contentType) {
  if (!config.ftp.host) {
    logger.warn('FTP not configured, returning null URL');
    return null;
  }

  const client = new ftp.Client();
  let tempPath = null;
  
  try {
    // Validate buffer
    if (!buffer || buffer.length === 0) {
      logger.warn('Empty media buffer, skipping upload');
      return null;
    }

    // Generate unique filename
    const ext = path.extname(filename) || `.${contentType.split('/')[1] || 'bin'}`;
    const uniqueName = `${uuidv4()}${ext}`;
    tempPath = path.join(process.cwd(), `temp_${uniqueName}`);
    const remotePath = `/media/${new Date().toISOString().slice(0,10).replace(/-/g,'')}/${uniqueName}`;

    // Write temp file
    await fs.writeFile(tempPath, buffer);

    await client.access({
      host: config.ftp.host,
      user: config.ftp.user,
      password: config.ftp.password,
      secure: config.ftp.secure
    });

    // Ensure remote directory exists
    await client.ensureDir(path.dirname(remotePath));

    // Upload
    await client.uploadFrom(tempPath, remotePath);

    const publicUrl = `https://${config.ftp.host}/media/${path.basename(remotePath)}`;
    logger.info(`📤 Media uploaded: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    logger.error('FTP upload failed:', error.message);
    return null;
  } finally {
    // Always cleanup temp file
    if (tempPath) {
      try {
        await fs.unlink(tempPath);
        logger.debug(`🧹 Temp file cleaned: ${tempPath}`);
      } catch (cleanupErr) {
        logger.warn(`Failed to cleanup temp: ${tempPath}`, cleanupErr.message);
      }
    }
    client.close();
  }
}

