'use strict';

const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function cloudinaryConfig() {
  const raw = String(process.env.CLOUDINARY_URL || '').trim();

  if (!raw) {
    throw new Error('CLOUDINARY_URL is not configured.');
  }

  const parsed = new URL(raw);

  if (parsed.protocol !== 'cloudinary:') {
    throw new Error('CLOUDINARY_URL is invalid.');
  }

  return {
    cloudName: parsed.hostname,
    apiKey: decodeURIComponent(parsed.username),
    apiSecret: decodeURIComponent(parsed.password),
  };
}

function isCloudinaryPhysicsClass(subject, klass) {
  const normalizedClass = String(klass || '')
    .replace(/^class\s*/i, '')
    .trim();

  return String(subject || '').trim().toLowerCase() === 'physics'
    && ['11', '12'].includes(normalizedClass);
}

function safeSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

router.post(
  '/image',
  requireAuth,
  requireRole('admin', 'adder', 'editor'),
  async (req, res) => {
    try {
      const { dataUrl, subject, klass } = req.body || {};

      if (!isCloudinaryPhysicsClass(subject, klass)) {
        return res.status(400).json({
          error: 'Cloudinary image upload is currently enabled only for Physics Classes 11 and 12.',
        });
      }

      if (
        typeof dataUrl !== 'string'
        || !/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(dataUrl)
      ) {
        return res.status(400).json({ error: 'A valid image data URL is required.' });
      }

      if (dataUrl.length > 9_000_000) {
        return res.status(413).json({ error: 'Image is too large.' });
      }

      const { cloudName, apiKey, apiSecret } = cloudinaryConfig();

      const normalizedClass = String(klass || '')
        .replace(/^class\s*/i, '')
        .trim();

      const publicId = [
        'question-bank',
        'physics',
        normalizedClass,
        `${Date.now()}-${crypto.randomUUID()}`,
      ].map(safeSegment).join('/');

      const form = new URLSearchParams();
      form.set('file', dataUrl);
      form.set('public_id', publicId);
      form.set('overwrite', 'false');

      const authorization = Buffer
        .from(`${apiKey}:${apiSecret}`, 'utf8')
        .toString('base64');

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authorization}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.secure_url) {
        console.error(
          '[cloudinary-upload]',
          result?.error?.message || `HTTP ${response.status}`
        );

        return res.status(502).json({
          error: 'Image upload failed.',
        });
      }

      if (!/^https:\/\/res\.cloudinary\.com\//i.test(result.secure_url)) {
        return res.status(502).json({
          error: 'Cloudinary returned an unexpected image URL.',
        });
      }

      return res.status(201).json({
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        format: result.format,
        width: result.width,
        height: result.height,
      });
    } catch (error) {
      console.error('[cloudinary-upload]', error.message);

      return res.status(500).json({
        error: 'Image upload service is unavailable.',
      });
    }
  }
);

module.exports = router;