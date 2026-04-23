import { getRecentStrikes, getUserContext, createInfraction } from '../database/models/infractions.js';
import { isBanned, createBan } from '../database/models/bans.js';
import { config } from '../utils/config.js';
import logger from '../utils/logger.js';
import { isWhitelisted } from './analyzer.js';

/** Anti-False Positive System + Strike Management */
export class AntiFPSystem {
  constructor() {
    this.MIN_CONFIDENCE = 75;
    this.REQUIRED_STRIKES = 3;
    this.WINDOW_DAYS = 7;
  }

  /**
   * Complete analysis pipeline
   */
  async processViolation(phone, groupId, analysis, messageData) {
    // 1. Whitelist check
    if (isWhitelisted(phone)) {
      logger.info(`👑 Whitelisted user: ${phone}`);
      return { action: 'ignore', reason: 'whitelisted' };
    }

    // 2. Already banned?
    const existingBan = await isBanned(phone, groupId);
    if (existingBan) {
      logger.warn(`🔄 Rejoin attempt by banned user: ${phone}`);
      return { action: 'kick', reason: 'active_ban' };
    }

    // 3. Confidence threshold
    if (analysis.confidence < this.MIN_CONFIDENCE) {
      logger.debug(`Low confidence ${analysis.confidence}%: ${phone}`);
      return { action: 'ignore', reason: 'low_confidence' };
    }

    // 4. Get strike history
    const strikes = await getRecentStrikes(phone, groupId, this.WINDOW_DAYS);
    
    // 5. Record infraction with strike count
    const strikeCount = strikes.max_strike ? strikes.max_strike + 1 : 1;
    await createInfraction({ 
      ...messageData, 
      confidence: analysis.confidence, 
      reason: analysis.reason,
      strike_count: strikeCount 
    });

    logger.info(`⚠️ Strike #${strikeCount} for ${phone} (${analysis.confidence}%): ${analysis.reason}`);

    // 6. Decision matrix
    if (strikeCount >= this.REQUIRED_STRIKES) {
      await createBan({
        phone,
        group_id: groupId,
        reason: analysis.reason,
        trigger_content: messageData.content,
        media_url: messageData.mediaUrl
      });
      return { action: 'ban', reason: '3_strikes', strikeCount };
    }

    return { 
      action: 'warn', 
      reason: 'strike_recorded', 
      strikeCount,
      nextStrike: this.REQUIRED_STRIKES - strikeCount 
    };
  }

  /**
   * Context analysis (last 3 messages)
   */
  async getContextRisk(phone, groupId) {
    const context = await getUserContext(phone, groupId, 3);
    if (!context.length) return 0;

    const violationCount = context.filter(m => m.confidence >= this.MIN_CONFIDENCE).length;
    return Math.round((violationCount / context.length) * 100);
  }
}

export const antiFP = new AntiFPSystem();

