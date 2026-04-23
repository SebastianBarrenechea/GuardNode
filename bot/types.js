// Shared TypeScript-like types (JSDoc)

/**
 * @typedef {Object} MessageData
 * @property {string} phone - User phone number (with country code)
 * @property {string} groupId - WhatsApp group JID
 * @property {string} [content] - Message text content
 * @property {string} [mediaUrl] - Uploaded media URL from FTP
 * @property {'text'|'image'|'video'|'gif'|'sticker'} type
 * @property {Object} [messageObj] - Original Baileys message object
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {'SAFE'|'VIOLATION'} label
 * @property {string|null} reason
 * @property {number} confidence - 0-100
 */

/**
 * @typedef {Object} StrikeInfo
 * @property {number} count
 * @property {number} maxStrike
 * @property {boolean} shouldBan
 */

