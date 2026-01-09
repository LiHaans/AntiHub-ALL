import database from '../db/database.js';
import logger from '../utils/logger.js';

class QwenAccountService {
  /**
   * 根据 account_id 获取账号
   * @param {string} account_id - 账号ID
   * @returns {Promise<Object|null>}
   */
  async getAccountById(account_id) {
    try {
      const result = await database.query(
        'SELECT * FROM qwen_accounts WHERE account_id = $1',
        [account_id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('查询Qwen账号失败:', error.message);
      throw error;
    }
  }

  /**
   * 根据 email 获取账号（用于去重/幂等导入）
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  async getAccountByEmail(email) {
    const normalized = typeof email === 'string' ? email.trim() : '';
    if (!normalized) return null;
    try {
      const result = await database.query(
        'SELECT * FROM qwen_accounts WHERE email = $1',
        [normalized]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('根据email查询Qwen账号失败:', error.message);
      throw error;
    }
  }

  /**
   * 根据 refresh_token 获取账号（用于去重/幂等导入）
   * @param {string} refresh_token
   * @returns {Promise<Object|null>}
   */
  async getAccountByRefreshToken(refresh_token) {
    const normalized = typeof refresh_token === 'string' ? refresh_token.trim() : '';
    if (!normalized) return null;
    try {
      const result = await database.query(
        'SELECT * FROM qwen_accounts WHERE refresh_token = $1',
        [normalized]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('根据refresh_token查询Qwen账号失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建或更新 Qwen 账号（按 email 优先幂等）
   * @param {Object} accountData
   * @param {string} accountData.user_id
   * @param {string|null} accountData.account_name
   * @param {number} accountData.is_shared
   * @param {string} accountData.access_token
   * @param {string|null} accountData.refresh_token
   * @param {number|null} accountData.expires_at
   * @param {string|null} accountData.last_refresh
   * @param {string|null} accountData.resource_url
   * @param {string|null} accountData.email
   * @returns {Promise<Object>}
   */
  async createAccount(accountData) {
    const {
      user_id,
      account_name = null,
      is_shared = 0,
      access_token,
      refresh_token = null,
      expires_at = null,
      last_refresh = null,
      resource_url = 'portal.qwen.ai',
      email = null,
    } = accountData || {};

    if (!user_id) {
      throw new Error('缺少必需字段: user_id');
    }
    if (!access_token || typeof access_token !== 'string' || !access_token.trim()) {
      throw new Error('缺少必需字段: access_token');
    }
    if (is_shared !== 0 && is_shared !== 1) {
      throw new Error('is_shared必须是0或1');
    }

    const normalizedEmail = typeof email === 'string' ? email.trim() : null;
    const normalizedRefreshToken =
      typeof refresh_token === 'string' ? refresh_token.trim() : null;
    const normalizedResourceURL =
      typeof resource_url === 'string' && resource_url.trim()
        ? resource_url.trim()
        : 'portal.qwen.ai';

    try {
      // 1) 优先按 email 幂等导入（因为 QwenCli 导出 JSON 通常会带 email/别名）
      if (normalizedEmail) {
        const existingByEmail = await this.getAccountByEmail(normalizedEmail);
        if (existingByEmail && existingByEmail.user_id !== user_id) {
          throw new Error(`该Qwen账号已被其他用户导入: ${normalizedEmail}`);
        }

        if (existingByEmail) {
          const result = await database.query(
            `UPDATE qwen_accounts
             SET account_name = $1,
                 is_shared = $2,
                 access_token = $3,
                 refresh_token = $4,
                 expires_at = $5,
                 last_refresh = $6,
                 resource_url = $7,
                 updated_at = CURRENT_TIMESTAMP,
                 need_refresh = FALSE,
                 status = 1
             WHERE account_id = $8
             RETURNING *`,
            [
              account_name,
              is_shared,
              access_token.trim(),
              normalizedRefreshToken,
              expires_at,
              last_refresh,
              normalizedResourceURL,
              existingByEmail.account_id,
            ]
          );
          logger.info(
            `Qwen账号已更新: account_id=${existingByEmail.account_id}, user_id=${user_id}, email=${normalizedEmail}`
          );
          return result.rows[0];
        }
      }

      // 2) 其次按 refresh_token 幂等导入（有些导出可能不包含 email）
      if (normalizedRefreshToken) {
        const existingByRT = await this.getAccountByRefreshToken(normalizedRefreshToken);
        if (existingByRT && existingByRT.user_id !== user_id) {
          throw new Error('该Qwen账号已被其他用户导入（refresh_token冲突）');
        }
        if (existingByRT) {
          const result = await database.query(
            `UPDATE qwen_accounts
             SET account_name = $1,
                 is_shared = $2,
                 access_token = $3,
                 expires_at = $4,
                 last_refresh = $5,
                 resource_url = $6,
                 email = COALESCE($7, email),
                 updated_at = CURRENT_TIMESTAMP,
                 need_refresh = FALSE,
                 status = 1
             WHERE account_id = $8
             RETURNING *`,
            [
              account_name,
              is_shared,
              access_token.trim(),
              expires_at,
              last_refresh,
              normalizedResourceURL,
              normalizedEmail,
              existingByRT.account_id,
            ]
          );
          logger.info(
            `Qwen账号已更新(refresh_token): account_id=${existingByRT.account_id}, user_id=${user_id}`
          );
          return result.rows[0];
        }
      }

      // 3) 新建
      const result = await database.query(
        `INSERT INTO qwen_accounts
         (user_id, account_name, is_shared, access_token, refresh_token, expires_at, last_refresh, resource_url, email, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
         RETURNING *`,
        [
          user_id,
          account_name,
          is_shared,
          access_token.trim(),
          normalizedRefreshToken,
          expires_at,
          last_refresh,
          normalizedResourceURL,
          normalizedEmail,
        ]
      );

      logger.info(
        `Qwen账号已创建: account_id=${result.rows[0].account_id}, user_id=${user_id}, email=${normalizedEmail || '(未提供)'}`
      );
      return result.rows[0];
    } catch (error) {
      logger.error('创建/更新Qwen账号失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取用户的 Qwen 账号列表
   * @param {string} user_id
   * @returns {Promise<Array>}
   */
  async getAccountsByUserId(user_id) {
    try {
      const result = await database.query(
        `SELECT * FROM qwen_accounts
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [user_id]
      );
      return result.rows;
    } catch (error) {
      logger.error('查询用户Qwen账号列表失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取可用账号（用于轮询/负载均衡）
   * @param {string|null} user_id
   * @param {number|null} is_shared
   * @returns {Promise<Array>}
   */
  async getAvailableAccounts(user_id = null, is_shared = null) {
    try {
      let query = 'SELECT * FROM qwen_accounts WHERE status = 1 AND need_refresh = FALSE';
      const params = [];
      let idx = 1;

      if (is_shared !== null) {
        query += ` AND is_shared = $${idx}`;
        params.push(is_shared);
        idx++;
      }

      if (user_id !== null && is_shared !== 1) {
        query += ` AND user_id = $${idx}`;
        params.push(user_id);
        idx++;
      }

      query += ' ORDER BY created_at ASC';

      const result = await database.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('查询可用Qwen账号失败:', error.message);
      throw error;
    }
  }

  /**
   * 更新账号 token
   * @param {string} account_id
   * @param {Object} tokenData
   * @param {string} tokenData.access_token
   * @param {string|null} tokenData.refresh_token
   * @param {number|null} tokenData.expires_at
   * @param {string|null} tokenData.last_refresh
   * @param {string|null} tokenData.resource_url
   * @returns {Promise<Object>}
   */
  async updateAccountToken(account_id, tokenData) {
    const accessToken =
      typeof tokenData?.access_token === 'string' ? tokenData.access_token.trim() : '';
    if (!accessToken) {
      throw new Error('updateAccountToken: access_token为空');
    }

    try {
      const result = await database.query(
        `UPDATE qwen_accounts
         SET access_token = $1,
             refresh_token = COALESCE($2, refresh_token),
             expires_at = $3,
             last_refresh = $4,
             resource_url = COALESCE($5, resource_url),
             updated_at = CURRENT_TIMESTAMP,
             need_refresh = FALSE
         WHERE account_id = $6
         RETURNING *`,
        [
          accessToken,
          typeof tokenData?.refresh_token === 'string' ? tokenData.refresh_token.trim() : null,
          tokenData?.expires_at ?? null,
          tokenData?.last_refresh ?? null,
          typeof tokenData?.resource_url === 'string' ? tokenData.resource_url.trim() : null,
          account_id,
        ]
      );

      if (result.rows.length === 0) {
        throw new Error(`Qwen账号不存在: account_id=${account_id}`);
      }
      return result.rows[0];
    } catch (error) {
      logger.error('更新Qwen账号token失败:', error.message);
      throw error;
    }
  }

  async updateAccountStatus(account_id, status) {
    if (status !== 0 && status !== 1) {
      throw new Error('status必须是0或1');
    }
    try {
      const result = await database.query(
        `UPDATE qwen_accounts
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE account_id = $2
         RETURNING *`,
        [status, account_id]
      );
      if (result.rows.length === 0) {
        throw new Error(`Qwen账号不存在: account_id=${account_id}`);
      }
      return result.rows[0];
    } catch (error) {
      logger.error('更新Qwen账号状态失败:', error.message);
      throw error;
    }
  }

  async updateAccountName(account_id, account_name) {
    const name = typeof account_name === 'string' ? account_name.trim() : '';
    if (!name) {
      throw new Error('account_name不能为空');
    }
    try {
      const result = await database.query(
        `UPDATE qwen_accounts
         SET account_name = $1, updated_at = CURRENT_TIMESTAMP
         WHERE account_id = $2
         RETURNING *`,
        [name, account_id]
      );
      if (result.rows.length === 0) {
        throw new Error(`Qwen账号不存在: account_id=${account_id}`);
      }
      return result.rows[0];
    } catch (error) {
      logger.error('更新Qwen账号名称失败:', error.message);
      throw error;
    }
  }

  async markAccountNeedRefresh(account_id) {
    try {
      const result = await database.query(
        `UPDATE qwen_accounts
         SET need_refresh = TRUE, status = 0, updated_at = CURRENT_TIMESTAMP
         WHERE account_id = $1
         RETURNING *`,
        [account_id]
      );
      if (result.rows.length === 0) {
        throw new Error(`Qwen账号不存在: account_id=${account_id}`);
      }
      return result.rows[0];
    } catch (error) {
      logger.error('标记Qwen账号需要重新授权失败:', error.message);
      throw error;
    }
  }

  async deleteAccount(account_id) {
    try {
      const result = await database.query(
        'DELETE FROM qwen_accounts WHERE account_id = $1 RETURNING account_id',
        [account_id]
      );
      if (result.rows.length === 0) {
        throw new Error(`Qwen账号不存在: account_id=${account_id}`);
      }
      return true;
    } catch (error) {
      logger.error('删除Qwen账号失败:', error.message);
      throw error;
    }
  }

  /**
   * 判断 token 是否过期（提前 5 分钟）
   * @param {Object} account
   * @returns {boolean}
   */
  isTokenExpired(account) {
    if (!account?.expires_at) return true;
    return Date.now() >= Number(account.expires_at) - 300000;
  }
}

const qwenAccountService = new QwenAccountService();
export default qwenAccountService;

